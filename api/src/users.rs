use axum::response::{IntoResponse, Response};
use serde::Serialize;
use utoipa::ToSchema;

use crate::error::AppError;

#[derive(Serialize, ToSchema)]
struct CreateUser {
    username: Box<str>,
    password: Box<str>,
    email: Box<str>,
}

#[utoipa::path(post, path = "/register", responses((status = OK, body = CreateUser)))]
pub async fn create_user() -> Result<Response, AppError> {
    Ok(().into_response())
}
