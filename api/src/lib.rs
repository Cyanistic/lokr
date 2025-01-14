use anyhow::Result;
use std::str::FromStr;

use axum::Router;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqliteSynchronous},
    SqlitePool,
};

pub mod utils;

pub const PKG_NAME: &str = env!("CARGO_PKG_NAME");

pub async fn start_server() {
    let app = Router::new();

    // run our app with hyper, listening globally on port 3000
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

/// Initialize the database by creating the database file and running the migrations.
/// Returns a connection pool to the database.
pub async fn init_db(db_url: &str) -> Result<SqlitePool> {
    let pool: SqlitePool = SqlitePool::connect_lazy_with(
        SqliteConnectOptions::from_str(db_url)?
            .foreign_keys(true)
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            // Only user NORMAL is WAL mode is enabled
            // as it provides extra performance benefits
            // at the cost of durability
            .synchronous(SqliteSynchronous::Normal),
    );
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}
