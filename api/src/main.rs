use anyhow::{anyhow, Result};
use lokr_api::{init_db, start_server, utils::data_dir};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use url::Url;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                format!("{}=debug,tower_http=debug", env!("CARGO_CRATE_NAME")).into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();
    let url = Url::from_file_path(data_dir().join("api.db"))
        .map_err(|_| anyhow!("Invalid database URL"))?;
    let pool = init_db(url.as_str()).await?;
    start_server(pool).await?;
    Ok(())
}
