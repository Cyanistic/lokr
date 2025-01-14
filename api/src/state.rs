use axum::extract::FromRef;
use sqlx::SqlitePool;

#[derive(Clone, Debug)]
pub(crate) struct AppState {
    pool: SqlitePool,
}

impl AppState {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

impl FromRef<AppState> for SqlitePool {
    fn from_ref(input: &AppState) -> Self {
        input.pool.clone()
    }
}
