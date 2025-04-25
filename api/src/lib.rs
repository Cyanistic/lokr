use anyhow::{anyhow, Result};
use download::serve_auth;
use regex::Regex;
use serde::Serialize;
use state::AppState;
use std::{
    env::{current_dir, temp_dir},
    net::SocketAddr,
    path::PathBuf,
    str::FromStr,
    sync::{Arc, LazyLock},
    time::Duration,
};
use tower::ServiceBuilder;
use tower_governor::GovernorLayer;
use tower_governor::{governor::GovernorConfigBuilder, key_extractor::SmartIpKeyExtractor};
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    services::{ServeDir, ServeFile},
    timeout::TimeoutLayer,
    trace::{DefaultMakeSpan, DefaultOnRequest, DefaultOnResponse, TraceLayer},
    LatencyUnit, ServiceBuilderExt,
};
use tracing::{info, warn, Level};
use url::Url;
use utoipa::{
    openapi::security::{ApiKey, ApiKeyValue, SecurityScheme},
    Modify, OpenApi, ToSchema,
};
use utoipa_axum::{router::OpenApiRouter, routes};
use utoipa_swagger_ui::SwaggerUi;

use axum::{
    extract::DefaultBodyLimit,
    http::{
        header::{
            ACCEPT, AUTHORIZATION, CONTENT_ENCODING, CONTENT_LENGTH, CONTENT_TYPE, COOKIE,
            SET_COOKIE,
        },
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
pub mod download;
pub mod error;
pub mod session;
pub mod share;
pub mod state;
pub mod upload;
pub mod users;
pub mod utils;

pub const PKG_NAME: &str = env!("CARGO_PKG_NAME");

/// Path to the data directory for the application.
/// Falls back to the current directory if the data directory cannot be determined.
pub static DATA_DIR: LazyLock<PathBuf> = LazyLock::new(|| {
    let mut path = match dirs::data_dir() {
        Some(dir) => dir,
        None => {
            warn!("Could not determine data directory. Attempting to use current directory.");
            current_dir().unwrap()
        }
    };
    path.push(PKG_NAME);
    if !path.exists() {
        std::fs::create_dir_all(&path).unwrap();
    }
    path
});

/// Path to the config directory for the application.
/// Falls back to the current directory if the config directory cannot be determined.
pub static CONFIG_DIR: LazyLock<PathBuf> = LazyLock::new(|| {
    let mut path = match dirs::config_dir() {
        Some(dir) => dir,
        None => {
            warn!("Could not determine config directory. Attempting to use current directory.");
            current_dir().unwrap()
        }
    };
    path.push(PKG_NAME);
    if !path.exists() {
        std::fs::create_dir_all(&path).unwrap();
    }
    path
});

/// Path to where user uploads are stored.
pub static UPLOAD_DIR: LazyLock<PathBuf> = LazyLock::new(|| {
    let path = DATA_DIR.join("uploads");
    if !path.exists() {
        std::fs::create_dir_all(&path).unwrap();
    }
    path
});

/// Path to where user avatar/profile images are stored.
pub static AVATAR_DIR: LazyLock<PathBuf> = LazyLock::new(|| {
    let path = DATA_DIR.join("avatars");
    if !path.exists() {
        std::fs::create_dir_all(&path).unwrap();
    }
    path
});

pub static TEMP_DIR: LazyLock<PathBuf> = LazyLock::new(|| {
    let path = temp_dir().join(PKG_NAME);
    if !path.exists() {
        std::fs::create_dir_all(&path).unwrap();
    }
    path
});

/// Path to where chunked upload transaction data is stored
pub static TRANSACTION_DIR: LazyLock<PathBuf> = LazyLock::new(|| {
    let path = TEMP_DIR.join("transactions");
    if !path.exists() {
        std::fs::create_dir_all(&path).unwrap();
    }
    path
});

/// Website host
pub static HOST: LazyLock<String> =
    LazyLock::new(|| std::env::var("LOKR_HOST").unwrap_or("lokr.cyanistic.com".to_string()));

pub const MAX_FILE_SIZE: u64 = 1_000_000_000;

#[derive(OpenApi)]
#[openapi(
        modifiers(&SecurityAddon),
        paths(
            users::create_user,
            users::authenticate_user,
            users::logout,
            users::check_usage,
            users::get_logged_in_user,
            users::update_user,
            users::update_totp,
            users::search_users,
            users::get_user,
            users::upload_avatar,
            users::get_avatar,
            users::update_preferences,
            upload::upload_file,
            upload::delete_file,
            upload::update_file,
            upload::start_chunked_upload,
            upload::upload_chunk,
            upload::finalize_chunked_upload,
            download::get_file,
            download::get_file_metadata,
            share::share_file,
            share::get_user_shared_file,
            share::get_link_shared_file,
            share::delete_share_permission,
            share::update_share_permission,
            share::get_shared_links,
            share::get_shared_users,
            share::get_link_info,
            session::get_sessions,
            session::delete_session,
        ),
        tags(
            (name = "users", description = "User related operations"),
            (name = "upload", description = "File and directory uploading"),
            (name = "session", description = "User session management"),
            (name = "share", description = "File and directory sharing"),
        )
    )]
struct ApiDoc;

struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "lokr_session_cookie",
                SecurityScheme::ApiKey(ApiKey::Cookie(ApiKeyValue::new("session"))),
            )
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct SuccessResponse {
    #[schema(example = "Yay! It worked!")]
    pub message: String,
}

#[macro_export]
macro_rules! success {
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
    let cors = CorsLayer::very_permissive()
        .allow_origin(AllowOrigin::predicate({
            let origin_regex = origin_regex.clone();
            move |origin: &HeaderValue, _: _| {
                origin_regex.is_match(origin.to_str().unwrap_or_default())
            }
        }))
        .allow_headers([
            AUTHORIZATION,
            CONTENT_TYPE,
            CONTENT_ENCODING,
            CONTENT_LENGTH,
            ACCEPT,
            SET_COOKIE,
        ])
        .expose_headers([
            AUTHORIZATION,
            CONTENT_TYPE,
            CONTENT_ENCODING,
            CONTENT_LENGTH,
            ACCEPT,
            SET_COOKIE,
        ]);

    let sensitive_headers: Arc<[_]> = [AUTHORIZATION, COOKIE].into();

    // Rate limit the number of requests a given IP can make within a time period
    // In this case, the time period is 200ms and the burst size is 30 requests.
    // This means that a given IP can make up to 30 requests at once before
    // needing to wait for 200ms before sending another request. They can make
    // and extra request for every 300ms they go without sending a request
    // until a maximum of 30 requests are reached.
    let ip_governor_config = Arc::new(unsafe {
        GovernorConfigBuilder::default()
            .const_period(Duration::from_millis(200))
            .key_extractor(SmartIpKeyExtractor)
            .burst_size(30)
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
                        .level(Level::DEBUG)
                        .include_headers(true),
                )
                .on_request(DefaultOnRequest::new().level(Level::TRACE))
                .on_response(
                    DefaultOnResponse::new()
                        .level(Level::TRACE)
                        .include_headers(true)
                        .latency_unit(LatencyUnit::Micros),
                )
                .on_failure(()), // .make_span_with(|req: &Request| {
                                 //     let method = req.method();
                                 //     let uri = req.uri();
                                 //
                                 //     // axum automatically adds this extension.
                                 //     let matched_path = req
                                 //         .extensions()
                                 //         .get::<MatchedPath>()
                                 //         .map(|matched_path| matched_path.as_str());
                                 //
                                 //     tracing::debug_span!("request", %method, %uri, matched_path)
                                 // }),
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
        // Set a `Content-Type` if there isn't one already.
        .insert_response_header_if_not_present(
            CONTENT_TYPE,
            HeaderValue::from_static("application/octet-stream"),
        );

    let state = AppState::new(pool.clone());
    // Make a separate upload router for handling auth using middleware
    let upload_router = OpenApiRouter::new()
        .nest_service("/api/file/data/", ServeDir::new(&*UPLOAD_DIR))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            serve_auth,
        ));
    // Setup the router along with the OpenApi documentation router
    // for easy docs generation.
    let (api_router, open_api): (Router, _) = OpenApiRouter::with_openapi(ApiDoc::openapi())
        .routes(routes!(upload::upload_file))
        .route_layer(DefaultBodyLimit::max(MAX_FILE_SIZE as usize))
        .routes(routes!(users::search_users))
        .routes(routes!(download::get_file_metadata))
        .routes(routes!(share::get_user_shared_file))
        .routes(routes!(share::get_link_shared_file))
        .routes(routes!(users::upload_avatar))
        .routes(routes!(upload::delete_file))
        .routes(routes!(upload::update_file))
        .routes(routes!(upload::start_chunked_upload))
        .routes(routes!(upload::upload_chunk))
        .routes(routes!(upload::finalize_chunked_upload))
        .route_layer(GovernorLayer {
            config: ip_governor_config,
        })
        // Routes above this line are rate limited by the `GovernorLayer`
        .routes(routes!(users::create_user))
        .routes(routes!(users::authenticate_user))
        .routes(routes!(users::logout))
        .routes(routes!(users::check_usage))
        .routes(routes!(users::get_logged_in_user))
        .routes(routes!(users::update_user))
        .routes(routes!(users::update_totp))
        .routes(routes!(users::get_user))
        .routes(routes!(users::update_preferences))
        .routes(routes!(share::share_file))
        .routes(routes!(share::get_shared_links))
        .routes(routes!(share::get_shared_users))
        .routes(routes!(share::delete_share_permission))
        .routes(routes!(share::update_share_permission))
        .routes(routes!(share::get_link_info))
        .routes(routes!(session::get_sessions))
        .routes(routes!(session::delete_session))
        // Serve uploaded files from the uploads directory
        // These files are eincrypted so they can't be accessed directly,
        // but they can be downloaded by the user who uploaded them.
        .nest_service("/api/avatars/", ServeDir::new(&*AVATAR_DIR))
        .merge(upload_router)
        .layer(cors)
        .with_state(state)
        .split_for_parts();

    let app = Router::new()
        .merge(api_router)
        .merge(SwaggerUi::new("/docs").url("/api-docs/openapi.json", open_api))
        // Serve the client files from the `../client/dist` directory
        // We use a fallback `ServeDir` for this because we send all the requests to the same file and
        // react-router handles the routing on the client side.
        //
        // We need the first fallback to serve all of the static files for the server and we need
        // the second fallback to redirect all other requests to the index.html file for
        // react-router.
        .fallback_service(
            ServeDir::new("../client/dist").fallback(ServeFile::new("../client/dist/index.html")),
        )
        .layer(middleware);

    // run our app with hyper, listening globally on port 6969
    let listener = tokio::net::TcpListener::bind("0.0.0.0:6969").await.unwrap();

    // Start the cleaner task
    let cleaner_task = tokio::task::spawn({
        let pool = pool.clone();
        async move {
            loop {
                tokio::time::sleep(Duration::from_secs(300)).await;
                utils::clean_up(&pool).await;
            }
        }
    });

    info!("Server listening on port 6969");
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
    cleaner_task.abort();
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
