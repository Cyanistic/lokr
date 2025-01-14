use anyhow::anyhow;
use lokr_api::{init_db, start_server, utils::data_dir};
use url::Url;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let url = Url::from_file_path(data_dir().join("api.db"))
        .map_err(|_| anyhow!("Invalid database URL"))?;
    let pool = init_db(url.as_str()).await?;
    start_server().await;
    Ok(())
}
