use anyhow::Result;
use regex::Regex;
use std::{net::SocketAddr, str::FromStr};
use tower_http::cors::{self, AllowOrigin, CorsLayer};

use axum::{
    http::{
        header::{ACCEPT, AUTHORIZATION, CONTENT_ENCODING, CONTENT_LENGTH, CONTENT_TYPE},
        HeaderValue,
    },
    routing::get,
    Router,
};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqliteSynchronous},
    SqlitePool,
};

pub mod utils;

pub const PKG_NAME: &str = env!("CARGO_PKG_NAME");

/// Start up the HTTP server and listen for incoming requests
/// on port 6969.
pub async fn start_server(pool: SqlitePool) -> Result<()> {
    let origin_regex = Regex::new(r"^https?://localhost:\d+/?$").unwrap();
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(move |origin: &HeaderValue, _: _| {
            origin_regex.is_match(origin.to_str().unwrap_or_default())
        }))
        .allow_methods(cors::Any)
        .allow_headers([
            AUTHORIZATION,
            CONTENT_TYPE,
            CONTENT_ENCODING,
            CONTENT_LENGTH,
            ACCEPT,
        ])
        .expose_headers([
            AUTHORIZATION,
            CONTENT_TYPE,
            CONTENT_ENCODING,
            CONTENT_LENGTH,
            ACCEPT,
        ]);

    let api = Router::new()
        .route("/", get(|| async { "Hello, world!" }))
        .layer(cors);

    let app = Router::new().nest("/api", api);

    // run our app with hyper, listening globally on port 6969
    let listener = tokio::net::TcpListener::bind("0.0.0.0:6969").await.unwrap();

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to install CTRL+C signal handler");
    })
    .await?;
    pool.close().await;
    Ok(())
}

/// Initialize the database by creating the database file and running the migrations.
/// Returns a connection pool to the database.
pub async fn init_db(db_url: &str) -> Result<SqlitePool> {
    let pool: SqlitePool = SqlitePool::connect_lazy_with(
        SqliteConnectOptions::from_str(db_url)?
            .foreign_keys(true)
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            // Only use NORMAL if WAL mode is enabled
            // as it provides extra performance benefits
            // at the cost of durability
            .synchronous(SqliteSynchronous::Normal),
    );
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}
