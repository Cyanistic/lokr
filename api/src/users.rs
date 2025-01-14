use std::ops::ControlFlow;

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use sqlx::SqlitePool;
use utoipa::ToSchema;
use validator::{Validate, ValidationError};

use crate::error::{AppError, AppValidate, ErrorResponse};

#[derive(Deserialize, ToSchema, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateUser {
    #[validate(length(min = 3, max = 20), custom(function = "validate_username"))]
    username: Box<str>,
    #[validate(length(min = 8, max = 64), custom(function = "validate_password"))]
    password: Box<str>,
    #[validate(email)]
    email: Option<String>,
}

/// Verify that the username only contains alphanumeric characters and underscores
pub fn validate_username(username: &str) -> Result<(), ValidationError> {
    match username
        .chars()
        .try_fold((0, 0), |(alphanumeric, underscore), c| {
            if c.is_alphanumeric() {
                ControlFlow::Continue((alphanumeric + 1, underscore))
            } else if c == '_' {
                ControlFlow::Continue((alphanumeric, underscore + 1))
            } else {
                ControlFlow::Break(ValidationError::new(
                    r#"must only contain alphanumeric characters and _"#,
                ))
            }
        }) {
        ControlFlow::Continue((a, u)) => {
            if a > u {
                Ok(())
            } else {
                // So we don't end up with usernames like "_a_" or "______"
                Err(ValidationError::new(
                    r#"must contain more alphanumeric characters than underscores"#,
                ))
            }
        }
        ControlFlow::Break(e) => Err(e),
    }
}

/// Verify that the password only contains ASCII characters
fn validate_password(password: &str) -> Result<(), ValidationError> {
    if !password.is_ascii() {
        Err(ValidationError::new(
            r#"must only contain alphanumeric characters and ASCII symbols"#,
        ))
    } else {
        Ok(())
    }
}

#[utoipa::path(post, path = "/register", request_body(content = CreateUser, description = "User to register"), responses((status = OK, description = "User successfully created", body = String), (status = CONFLICT, description = "Username or email already in use", body = ErrorResponse)))]
pub async fn create_user(
    State(pool): State<SqlitePool>,
    Json(new_user): Json<CreateUser>,
) -> Result<Response, AppError> {
    // New user has a valid email, username, and password
    new_user.app_validate()?;

    if sqlx::query!("SELECT * FROM user WHERE username = ?", new_user.username)
        .fetch_optional(&pool)
        .await?
        .is_some()
    {
        return Err(AppError::UserError((
            StatusCode::CONFLICT,
            "Username already in use".into(),
        )));
    }
    if let Some(email) = &new_user.email {
        if sqlx::query!("SELECT * FROM user WHERE email = ?", email)
            .fetch_optional(&pool)
            .await?
            .is_some()
        {
            return Err(AppError::UserError((
                StatusCode::CONFLICT,
                "Email already in use".into(),
            )));
        }
    }
    let password_hash = password_auth::generate_hash(new_user.password.as_bytes());
    sqlx::query!(
        "INSERT INTO user (username, password_hash, email) VALUES (?, ?, ?)",
        new_user.username,
        password_hash,
        new_user.email
    )
    .execute(&pool)
    .await?;
    Ok((StatusCode::OK, "User successfully created!").into_response())
}
