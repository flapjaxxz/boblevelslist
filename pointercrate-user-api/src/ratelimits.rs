use pointercrate_core::localization::tr;
use pointercrate_core::ratelimits;
use std::net::IpAddr;

// Limits are per client IP address. They are deliberately generous: behind a hosting proxy many
// different people can share one address, and the original values (1 registration per day, 3 login
// attempts per 30 minutes) locked out real members.
ratelimits! {
    UserRatelimits {
        registrations[100u32 per 86400 per IpAddr] => tr("error-user-ratelimit-registration"),
        soft_registrations[100u32 per 21600 per IpAddr] => tr("error-user-ratelimit-soft-registration"),
        login_attempts[100u32 per 1800 per IpAddr] => tr("error-user-ratelimit-login"),
    }
}
