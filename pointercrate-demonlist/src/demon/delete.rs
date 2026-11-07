use crate::{demon::Demon, error::Result, player::recompute_scores};
use log::info;
use sqlx::PgConnection;

impl Demon {
    /// Deletes this demon together with all of its records and creator entries, moves every demon below it up by
    /// one position so no hole is left in the list, and recomputes all scores.
    ///
    /// Must run inside a transaction!
    pub async fn delete(self, connection: &mut PgConnection) -> Result<()> {
        info!("Deleting demon {}", self);

        // `records` and `creators` reference the demon without a cascade, so they have to go first. Notes attached
        // to the records are removed by the ON DELETE CASCADE on `record_notes.record`.
        sqlx::query!("DELETE FROM records WHERE demon = $1", self.base.id)
            .execute(&mut *connection)
            .await?;

        sqlx::query!("DELETE FROM creators WHERE demon = $1", self.base.id)
            .execute(&mut *connection)
            .await?;

        sqlx::query!("DELETE FROM demons WHERE id = $1", self.base.id)
            .execute(&mut *connection)
            .await?;

        // Close the gap. (The unique constraint on `position` is DEFERRABLE, so it is only checked once the whole
        // statement has run; the same thing is done when adding or moving a demon.)
        sqlx::query!("UPDATE demons SET position = position - 1 WHERE position > $1", self.base.position)
            .execute(&mut *connection)
            .await?;

        recompute_scores(connection).await?;

        Ok(())
    }
}
