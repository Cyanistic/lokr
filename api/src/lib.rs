use anyhow::{anyhow, Result};
use regex::Regex;
use serde::Serialize;
use state::AppState;
use std::{net::SocketAddr, str::FromStr, sync::Arc, time::Duration};
use tower::ServiceBuilder;
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::GovernorLayer;
use tower_http::{
    cors::{self, AllowOrigin, CorsLayer},
    timeout::TimeoutLayer,
    trace::{DefaultMakeSpan, DefaultOnRequest, DefaultOnResponse, TraceLayer},
    LatencyUnit, ServiceBuilderExt,
};
use tracing::Level;
use url::Url;
use utoipa::{OpenApi, ToSchema};
use utoipa_axum::{router::OpenApiRouter, routes};
use utoipa_swagger_ui::SwaggerUi;

use axum::{
    http::{
        header::{ACCEPT, AUTHORIZATION, CONTENT_ENCODING, CONTENT_LENGTH, CONTENT_TYPE, COOKIE},
        HeaderValue,
    },
    Router,
};
use sqlx::{
    migrate::MigrateError,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqliteSynchronous},
    SqlitePool,
};

pub mod auth;
pub mod error;
pub mod state;
pub mod users;
pub mod utils;

pub const PKG_NAME: &str = env!("CARGO_PKG_NAME");

#[derive(OpenApi)]
#[openapi(
        paths(users::create_user, users::authenticate_user, users::check_usage, users::get_logged_in_user, users::update_user),
        tags(
            (name = "users", description = "User related operations"),
        )
    )]
struct ApiDoc;

#[derive(Serialize, ToSchema)]
pub struct SuccessResponse {
    pub message: String,
}

#[macro_export]
macro_rules! success {
    ($message:literal) => {{
        ::axum::extract::Json($crate::SuccessResponse {
            message: ($message).into(),
        })
    }};
    ($message:expr) => {{
        ::axum::extract::Json($crate::SuccessResponse {
            message: ($message).into(),
        })
    }};
}

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

    let sensitive_headers: Arc<[_]> = [AUTHORIZATION, COOKIE].into();

    // Rate limit the number of requests a given IP can make within a time period
    // In this case, the time period is 500ms and the burst size is 20 requests.
    // This means that a given IP can make up to 20 requests at once before
    // needing to wait for 500ms before sending another request. They can make
    // and extra request for every 500ms they go without sending a request
    // until a maximum of 20 requests are reached.
    let ip_governor_config = Arc::new(unsafe {
        GovernorConfigBuilder::default()
            .const_period(Duration::from_millis(500))
            .burst_size(20)
            .finish()
            .unwrap_unchecked()
    });

    let middleware = ServiceBuilder::new()
        // Mark the `Authorization` and `Cookie` headers as sensitive so it doesn't show in logs
        .sensitive_request_headers(sensitive_headers.clone())
        // Add high level tracing/logging to all requests
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(
                    DefaultMakeSpan::new()
                        .level(Level::TRACE)
                        .include_headers(true),
                )
                .on_request(DefaultOnRequest::new().level(Level::TRACE))
                .on_response(
                    DefaultOnResponse::new()
                        .level(Level::TRACE)
                        .include_headers(true)
                        .latency_unit(LatencyUnit::Micros),
                ),
        )
        .sensitive_response_headers(sensitive_headers)
        // GovernorLayer is a rate limiter that limits the number of requests a user can make
        // within a given time period. This is used to prevent abuse/attacks on the server.
        // This is safe to use because the it is only none if the period or burst size is 0.
        // Neither of which are the case here.
        // Set a timeout
        .layer(TimeoutLayer::new(Duration::from_secs(15)))
        // Compress responses
        .compression()
        .layer(GovernorLayer {
            config: ip_governor_config,
        })
        // Set a `Content-Type` if there isn't one already.
        .insert_response_header_if_not_present(
            CONTENT_TYPE,
            HeaderValue::from_static("application/octet-stream"),
        );

    // Setup the router along with the OpenApi documentation router
    // for easy docs generation.
    let (api_router, open_api): (Router, _) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(users::create_user))
        .routes(routes!(users::authenticate_user))
        .routes(routes!(users::check_usage))
        .routes(routes!(users::get_logged_in_user))
        .routes(routes!(users::update_user))
        .layer(cors)
        .with_state(AppState::new(pool.clone()))
        .split_for_parts();

    let app = Router::new()
        .merge(api_router)
        .merge(SwaggerUi::new("/docs").url("/api-docs/openapi.json", open_api))
        .layer(middleware);

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
pub async fn init_db(db_url: &Url) -> Result<SqlitePool> {
    let pool: SqlitePool = SqlitePool::connect_lazy_with(
        SqliteConnectOptions::from_str(db_url.as_str())?
            .foreign_keys(true)
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            // Only use NORMAL if WAL mode is enabled
            // as it provides extra performance benefits
            // at the cost of durability
            .synchronous(SqliteSynchronous::Normal),
    );
    // Check if there is a version mismatch between the migrations and the database
    // If there is, delete the database file and run the migrations again
    match sqlx::migrate!("./migrations").run(&pool).await {
        Err(MigrateError::VersionMismatch(_)) => {
            std::fs::remove_file(
                db_url
                    .to_file_path()
                    .map_err(|_| anyhow!("Unable to convert db url to file path"))?,
            )?;
            // Pin the future so we can call it recursively within the same async function
            // Will get a recursion error otherwise if we don't
            Box::pin(init_db(db_url)).await?;
        }
        // We don't know how to deal with the other errors
        // but we can't continue so just return early with them
        Err(e) => return Err(e.into()),
        _ => {}
    }
    Ok(pool)
}
