use std::sync::Arc;

use argon2::Argon2;
use axum::extract::FromRef;
use sqlx::SqlitePool;

#[derive(Clone, Debug)]
pub struct AppState {
    pub pool: SqlitePool,
    pub argon2: Arc<Argon2<'static>>,
}

impl AppState {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            pool,
            argon2: Argon2::default().into(),
        }
    }
}

impl FromRef<AppState> for SqlitePool {
    fn from_ref(input: &AppState) -> Self {
        input.pool.clone()
    }
}
