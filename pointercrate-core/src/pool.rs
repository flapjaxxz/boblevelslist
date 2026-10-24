use crate::{config, error::Result};
use log::trace;
use sqlx::{pool::PoolConnection, postgres::PgPoolOptions, PgConnection, Pool, Postgres, Transaction};

pub struct PointercratePool {
    connection_pool: Pool<Postgres>,
}

impl PointercratePool {
    pub fn clone_inner(&self) -> Pool<Postgres> {
        self.connection_pool.clone()
    }

    /// Grants the user with the given name every permission bit (administrator, moderator and
    /// all list permissions). Returns the number of users that were updated (0 if no user with
    /// that name exists).
    ///
    /// This exists to bootstrap the first administrator of a freshly deployed website without
    /// needing database shell access.
    pub async fn grant_all_permissions(&self, username: &str) -> std::result::Result<u64, sqlx::Error> {
        let result = sqlx::query("UPDATE members SET permissions = B'0110000000001110'::BIT(16) WHERE lower(name) = lower($1)")
            .bind(username)
            .execute(&self.connection_pool)
            .await?;

        Ok(result.rows_affected())
    }

    pub async fn init() -> Self {
        let pool = PointercratePool {
            connection_pool: PgPoolOptions::default()
                .max_connections(20)
                .connect(&config::database_url())
                .await
                .expect("Failed to connect to pointercrate database"),
        };

        pool.run_migrations().await;

        pool
    }

    async fn run_migrations(&self) {
        let row = sqlx::query!(
            r#"
SELECT EXISTS (
    SELECT FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename  = '__diesel_schema_migrations'
    )
AND NOT EXISTS (
    SELECT FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = '_sqlx_migrations'
) AS "unsupported_db_config!"
        "#,
        )
        .fetch_one(&self.connection_pool)
        .await
        .unwrap();

        if row.unsupported_db_config {
            panic!("Database has not been switched from diesel migrations to sqlx migrations. Please run the final migration from https://github.com/stadust/pointercrate-migration to switch")
        }

        sqlx::migrate!("../migrations")
            .run(&self.connection_pool)
            .await
            .expect("Failed to run migrations");
    }

    /// Gets a connection from the connection pool
    pub async fn connection(&self) -> Result<PoolConnection<Postgres>> {
        let mut connection = self.connection_pool.acquire().await?;

        audit_connection(&mut connection, 0).await?;

        Ok(connection)
    }

    pub async fn transaction(&self) -> Result<Transaction<'static, Postgres>> {
        let mut connection = self.connection_pool.begin().await?;

        audit_connection(&mut connection, 0).await?;

        Ok(connection)
    }
}

// Used for integration tests, when sqlx::test sets up a pool for us
impl From<Pool<Postgres>> for PointercratePool {
    fn from(connection_pool: Pool<Postgres>) -> Self {
        PointercratePool { connection_pool }
    }
}

pub async fn audit_connection(connection: &mut PgConnection, user_id: i32) -> Result<()> {
    trace!(
        "Creating connection of which usage will be attributed to user {} in audit logs",
        user_id
    );

    sqlx::query!("CREATE TEMPORARY TABLE IF NOT EXISTS active_user (id INTEGER)")
        .execute(&mut *connection)
        .await?;
    sqlx::query!("DELETE FROM active_user").execute(&mut *connection).await?;
    sqlx::query!("INSERT INTO active_user (id) VALUES ($1)", user_id)
        .execute(connection)
        .await?;

    Ok(())
}
