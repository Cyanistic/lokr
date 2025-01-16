use std::ops::ControlFlow;

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    PasswordHash, PasswordVerifier,
};
use axum::{
    extract::State,
    http::{header::SET_COOKIE, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use axum_macros::debug_handler;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use validator::{Validate, ValidationError};

use crate::{
    auth::{SessionAuth, User},
    error::{AppError, AppValidate, ErrorResponse},
    state::AppState,
};

/// A struct representing a new user to be created
#[derive(Deserialize, ToSchema, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateUser {
    /// The name of the user to create
    #[validate(length(min = 3, max = 20), custom(function = "validate_username"))]
    username: Box<str>,
    /// The new user's password
    #[validate(length(min = 8, max = 64), custom(function = "validate_password"))]
    password: Box<str>,
    #[validate(email)]
    email: Option<String>,
    /// The initialization vector for the user's private key
    #[schema(content_encoding = "base64")]
    iv: String,
    /// The user's public key
    #[schema(content_encoding = "base64")]
    public_key: String,
    /// The user's private key encrypted using their password
    #[schema(content_encoding = "base64")]
    encrypted_private_key: String,
}

/// A struct representing a user logging in
#[derive(Deserialize, ToSchema, Validate)]
#[serde(rename_all = "camelCase")]
pub struct LoginUser {
    #[validate(length(min = 3, max = 20), custom(function = "validate_username"))]
    username: Box<str>,
    #[validate(length(min = 8, max = 64), custom(function = "validate_password"))]
    password: Box<str>,
}

/// A successful login response
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    iv: String,
    public_key: String,
    encrypted_private_key: String,
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

#[utoipa::path(post, path = "/api/register", description = "Register a new user to the database", request_body(content = CreateUser, description = "User to register"), responses((status = CREATED, description = "User successfully created", body = String), (status = CONFLICT, description = "Username or email already in use", body = ErrorResponse),(status = BAD_REQUEST, description = "Invalid username, email, or password", body = ErrorResponse)))]
pub async fn create_user(
    State(state): State<AppState>,
    Json(new_user): Json<CreateUser>,
) -> Result<Response, AppError> {
    // New user has a valid email, username, and password
    new_user.app_validate()?;

    if sqlx::query!("SELECT * FROM user WHERE username = ?", new_user.username)
        .fetch_optional(&state.pool)
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
            .fetch_optional(&state.pool)
            .await?
            .is_some()
        {
            return Err(AppError::UserError((
                StatusCode::CONFLICT,
                "Email already in use".into(),
            )));
        }
    }

    let salt = SaltString::generate(&mut OsRng);
    let salt_string = salt.to_string();

    let password_hash = state
        .argon2
        .hash_password(new_user.password.as_bytes(), &salt)
        .map_err(|_| {
            AppError::UserError((StatusCode::BAD_REQUEST, "Unable to hash password".into()))
        })?
        .to_string();
    sqlx::query!(
        "INSERT INTO user (username, password_hash, email, salt, iv, encrypted_private_key, public_key) VALUES (?, ?, ?, ?, ?, ?, ?)",
        new_user.username,
        password_hash,
        new_user.email,
        salt_string,
        new_user.iv,
        new_user.encrypted_private_key,
        new_user.public_key
    )
    .execute(&state.pool)
    .await?;
    Ok((StatusCode::CREATED, "User successfully created!").into_response())
}

#[utoipa::path(post, path = "/api/login", description = "Authenticate a user with the backend", request_body(content = LoginUser, description = "User to authenticate"), responses((status = OK, description = "User successfully authenticated", body = LoginResponse, headers(("Set-Cookie" = String, description = "`session` cookie containing the authenticated user's session id"))), (status = UNAUTHORIZED, description = "Invalid username or password", body = ErrorResponse)))]
pub async fn authenticate_user(
    State(state): State<AppState>,
    Json(user): Json<LoginUser>,
) -> Result<Response, AppError> {
    user.app_validate()?;
    let Some(db_user) = sqlx::query!("SELECT * FROM user WHERE username = ?", user.username)
        .fetch_optional(&state.pool)
        .await?
    else {
        return Err(AppError::UserError((
            StatusCode::UNAUTHORIZED,
            "Invalid username or password".into(),
        )));
    };

    state
        .argon2
        .verify_password(
            user.password.as_bytes(),
            &PasswordHash::new(&db_user.password_hash).map_err(|_| {
                AppError::UserError((
                    StatusCode::UNAUTHORIZED,
                    "Invalid username or password".into(),
                ))
            })?,
        )
        .map_err(|_| {
            AppError::UserError((
                StatusCode::UNAUTHORIZED,
                "Invalid username or password".into(),
            ))
        })?;
    let uuid = Uuid::new_v4().to_string();
    let expires_at = chrono::Utc::now() + chrono::Duration::hours(1);
    sqlx::query!(
        "INSERT INTO session (id, user_id, expires_at) VALUES (?, ?, ?) RETURNING id",
        uuid,
        db_user.id,
        expires_at
    )
    .fetch_one(&state.pool)
    .await?;

    let login_body = sqlx::query_as!(
        LoginResponse,
        "SELECT iv, public_key, encrypted_private_key FROM user WHERE username = ?",
        user.username
    )
    .fetch_one(&state.pool)
    .await?;
    Ok((
        StatusCode::OK,
        [(SET_COOKIE, format!("session={uuid}; HttpOnly"))],
        Json(login_body),
    )
        .into_response())
}

#[utoipa::path(get, path = "/api/test", description = "Test the user's session", responses((status = OK, description = "User is logged in", body = String), (status = UNAUTHORIZED, description = "User is not logged in", body = ErrorResponse)))]
#[debug_handler]
pub async fn test(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
) -> Result<Response, AppError> {
    Ok((StatusCode::OK, "You are logged in!").into_response())
}
