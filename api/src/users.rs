use std::ops::ControlFlow;

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    PasswordHash, PasswordVerifier,
};
use axum::{
    extract::{Query, State},
    http::{header::SET_COOKIE, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use axum_macros::debug_handler;
use serde::{Deserialize, Serialize};
use sqlx::{QueryBuilder, Sqlite};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;
use validator::{Validate, ValidationError};

use crate::{
    auth::SessionAuth,
    error::{AppError, AppValidate, ErrorResponse},
    state::AppState,
    success, SuccessResponse,
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

#[utoipa::path(post, path = "/api/register", description = "Register a new user to the database", request_body(content = CreateUser, description = "User to register"), responses((status = CREATED, description = "User successfully created", body = SuccessResponse), (status = CONFLICT, description = "Username or email already in use", body = ErrorResponse),(status = BAD_REQUEST, description = "Invalid username, email, or password", body = ErrorResponse)))]
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
    let uuid = Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO user (id, username, password_hash, email, salt, iv, encrypted_private_key, public_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        uuid,
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
    Ok((StatusCode::CREATED, success!("User successfully created!")).into_response())
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
    let uuid = Uuid::new_v4();
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

#[derive(Deserialize, Validate, IntoParams)]
#[serde(rename_all = "camelCase")]
pub struct CheckUsage {
    #[validate(length(min = 3, max = 20), custom(function = "validate_username"))]
    username: Option<Box<str>>,
    #[validate(email)]
    email: Option<String>,
}

#[utoipa::path(get, path = "/api/check", description = "Check if a username or email (or both at once) is already in use", params(CheckUsage), responses((status = OK, description = "No conflicts found", body = SuccessResponse), (status = CONFLICT, description = "Username or email already in use", body = [ErrorResponse]), (status = BAD_REQUEST, description = "Invalid username or email", body = ErrorResponse)))]
#[debug_handler]
pub async fn check_usage(
    State(state): State<AppState>,
    user: Option<SessionAuth>,
    Query(params): Query<CheckUsage>,
) -> Result<Response, AppError> {
    params.app_validate()?;
    let mut errors: Vec<ErrorResponse> = Vec::new();
    // Only check for conflicts in the username if the user explicitly
    // provides one in the query
    if let Some(username) = params.username {
        // If the user is authenticated, check if the provided username
        // is just a different case of their own username and automatically
        // approve it if it is
        if !user
            .as_ref()
            .is_some_and(|user| user.0.username.eq_ignore_ascii_case(&username))
            && sqlx::query!("SELECT id FROM user WHERE username = ?", username)
                .fetch_optional(&state.pool)
                .await?
                .is_some()
        {
            errors.push(ErrorResponse {
                message: "Username already in use".into(),
                error_type: "Username".into(),
            });
        }
    }
    // Same thing here again, but slightly modified for emails
    if let Some(email) = params.email {
        if !user
            .as_ref()
            .and_then(|user| user.0.email.as_ref())
            .is_some_and(|user_email| user_email.eq_ignore_ascii_case(&email))
            && sqlx::query!("SELECT id FROM user WHERE email = ?", email)
                .fetch_optional(&state.pool)
                .await?
                .is_some()
        {
            errors.push(ErrorResponse {
                message: "Email already in use".into(),
                error_type: "Email".into(),
            });
        }
    }
    // If no errors were found, return a 200 OK response
    if errors.is_empty() {
        Ok((StatusCode::OK, success!("No conflicts found")).into_response())
    } else {
        // Otherwise, return a 409 CONFLICT response with the errors
        Ok((StatusCode::CONFLICT, Json(errors)).into_response())
    }
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SessionUser {
    username: Box<str>,
    email: Option<String>,
    iv: String,
    public_key: String,
    encrypted_private_key: String,
}

#[utoipa::path(get, path = "/api/profile", description = "Get the currently authenticated user", responses((status = OK, description = "User successfully retrieved", body = SessionUser), (status = UNAUTHORIZED, description = "No user is currently authenticated", body = ErrorResponse)))]
pub async fn get_logged_in_user(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
) -> Result<Response, AppError> {
    let uuid = Uuid::from_bytes(user.id);
    Ok(Json(
        sqlx::query_as!(
            SessionUser,
            "SELECT username, email, iv, public_key, encrypted_private_key FROM user WHERE id = ?",
            uuid
        )
        .fetch_one(&state.pool)
        .await?,
    )
    .into_response())
}

#[utoipa::path(
    put,
    path = "/api/profile",
    description = "Update the currently authenticated user",
    params(CheckUsage),
    responses((status = OK, description = "User successfully updated", body = SuccessResponse), (status = BAD_REQUEST, description = "Invalid username or email", body = ErrorResponse))
)]
pub async fn update_user(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    Query(params): Query<CheckUsage>,
) -> Result<Response, AppError> {
    params.app_validate()?;
    let mut builder: QueryBuilder<'_, Sqlite> = QueryBuilder::new("UPDATE user SET ");
    let mut separated = false;
    if let Some(username) = params.username {
        builder.push("username = ");
        builder.push_bind(username);
        separated = true;
    }
    if let Some(email) = params.email {
        // We only want to push a comma if we've already pushed a username
        // so we add a variable to check if we have
        if separated {
            builder.push(", ");
        }
        builder.push("email = ");
        builder.push_bind(email);
    }
    builder.push(" WHERE id = ");
    builder.push_bind(Uuid::from_bytes(user.id));
    builder.build().execute(&state.pool).await?;
    Ok((StatusCode::OK, success!("User updated successfully")).into_response())
}
