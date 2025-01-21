use std::ops::ControlFlow;

use anyhow::anyhow;
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
use totp_rs::{Algorithm, Secret, TOTP};
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
#[derive(Serialize, Deserialize, ToSchema, Validate)]
#[serde(rename_all = "camelCase")]
pub struct LoginUser {
    #[validate(length(min = 3, max = 20), custom(function = "validate_username"))]
    username: Box<str>,
    #[validate(length(min = 8, max = 64), custom(function = "validate_password"))]
    password: Box<str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[validate(length(min = 6, max = 6))]
    totp_code: Option<String>,
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

    let password_hash = state
        .argon2
        .hash_password(new_user.password.as_bytes(), &salt)
        .map_err(|_| {
            AppError::UserError((StatusCode::BAD_REQUEST, "Unable to hash password".into()))
        })?
        .to_string();
    let uuid = Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO user (id, username, password_hash, email, iv, encrypted_private_key, public_key) VALUES (?, ?, ?, ?, ?, ?, ?)",
        uuid,
        new_user.username,
        password_hash,
        new_user.email,
        new_user.iv,
        new_user.encrypted_private_key,
        new_user.public_key
    )
    .execute(&state.pool)
    .await?;
    Ok((StatusCode::CREATED, success!("User successfully created!")).into_response())
}

#[utoipa::path(post, path = "/api/login", description = "Authenticate a user with the backend", request_body(content = LoginUser, description = "User to authenticate"), responses((status = OK, description = "User successfully authenticated", body = LoginResponse, headers(("Set-Cookie" = String, description = "`session` cookie containing the authenticated user's session id"))), (status = TEMPORARY_REDIRECT, description = "Username and password are correct, but TOTP is missing. Login parameters are returned to allow for easier reuse", body = LoginUser), (status = UNAUTHORIZED, description = "Invalid username or password", body = ErrorResponse)))]
pub async fn authenticate_user(
    State(state): State<AppState>,
    Json(user): Json<LoginUser>,
) -> Result<Response, AppError> {
    user.app_validate()?;
    let Some(db_user) = sqlx::query!(
        "SELECT id, email, password_hash, totp_enabled, totp_secret FROM user WHERE username = ?",
        user.username
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        return Err(AppError::UserError((
            StatusCode::UNAUTHORIZED,
            "Invalid username or password".into(),
        )));
    };

    verify_password(&state, &user.password, &db_user.password_hash)?;

    // If the user has TOTP enabled, verify the TOTP code
    if db_user.totp_enabled {
        let Some(totp_code) = user.totp_code else {
            // Alert the frontend that they need to provide a TOTP code
            // Return the user object with a redirect to the frontend to
            // prompt the user for a TOTP code and reuse the same username and password
            return Ok((StatusCode::TEMPORARY_REDIRECT, Json(user)).into_response());
        };
        let secret = Secret::Raw(db_user.totp_secret.ok_or(AppError::UserError((
            StatusCode::UNAUTHORIZED,
            "Invalid username or password".into(),
        )))?);
        let totp = TOTP::new_unchecked(
            Algorithm::SHA1,
            6,
            1,
            30,
            secret.to_bytes()?,
            Some("Lokr".to_string()),
            db_user
                .email
                .clone()
                .unwrap_or_else(|| "placeholder@lokr.com".to_string()),
        );
        if !totp.check_current(&totp_code)? {
            return Err(AppError::UserError((
                StatusCode::UNAUTHORIZED,
                "Invalid TOTP code".into(),
            )));
        }
    }

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

#[derive(Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", tag = "type")]
/// Request an update to the currently authenticated user's TOTP settings
pub enum TOTPRequest {
    /// Enable or disable TOTP for the currently authenticated user
    Enable { enable: bool, password: Box<str> },
    /// Regenerate the currently authenticated user's TOTP secret
    Regenerate { password: Box<str> },
    /// Verify the currently authenticated user's TOTP
    /// using the provided TOTP code
    Verify { code: Box<str> },
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TOTPResponse {
    /// The base64 encoded QR code for the TOTP secret.
    /// Encoded as a PNG image to allow for easy presentation to the user.
    #[schema(content_encoding = "base64")]
    qr_code: String,
}

#[utoipa::path(
    put,
    path = "/api/totp",
    description = "Update the currently authenticated user's TOTP settings",
    request_body(content = TOTPRequest, description = "TOTP settings to update"),
    responses((status = OK, description = "TOTP settings successfully updated. Returned when successfully enabling, disabling, or, verifing TOTP.", body = SuccessResponse), (status = CREATED, description = "A new TOTP has been regenerated. Returned upon a successful regeneration request", body = TOTPResponse), (status = BAD_REQUEST, description = "Invalid TOTP request", body = ErrorResponse))
)]
pub async fn update_totp(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    Json(totp_req): Json<TOTPRequest>,
) -> Result<Response, AppError> {
    let uuid = Uuid::from_bytes(user.id);
    match totp_req {
        TOTPRequest::Enable { enable, password } => {
            // Query the database to see if the user has both generated a TOTP secret
            // and verified it to prevent them from being locked out of their account
            let db_user = sqlx::query!(
                "SELECT password_hash, totp_secret, totp_verified FROM user WHERE id = ?",
                uuid
            )
            .fetch_one(&state.pool)
            .await?;
            // Verify the password against the hash in the database
            verify_password(&state, &password, &db_user.password_hash)?;

            if !db_user.totp_verified {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    "You must verify your TOTP before enabling it".into(),
                )));
            } else if db_user.totp_secret.is_none() {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    "You must generate a TOTP before enabling it".into(),
                )));
            }

            // Assume the user has TOTP enabled
            sqlx::query!(
                "UPDATE user SET totp_enabled = ? WHERE id = ? RETURNING totp_secret",
                enable,
                uuid
            )
            .fetch_one(&state.pool)
            .await?;

            Ok((
                StatusCode::OK,
                success!(format!(
                    "TOTP {} successfully!",
                    if enable { "enabled" } else { "disabled" }
                )),
            )
                .into_response())
        }
        TOTPRequest::Regenerate { password } => {
            let db_user = sqlx::query!("SELECT password_hash FROM user WHERE id = ?", uuid)
                .fetch_one(&state.pool)
                .await
                .map_err(|_| {
                    AppError::UserError((StatusCode::UNAUTHORIZED, "Invalid password".into()))
                })?;
            // Verify the password against the hash in the database
            verify_password(&state, &password, &db_user.password_hash)?;
            // Generate a totp secret if the user enables TOTP for the first time or
            // the user has requested a regeneration
            let secret = Secret::generate_secret();
            let totp = TOTP::new_unchecked(
                Algorithm::SHA1,
                6,
                1,
                30,
                secret.to_bytes()?,
                Some("Lokr".to_string()),
                user.email
                    .clone()
                    .unwrap_or_else(|| "placeholder@lokr.com".to_string()),
            );
            sqlx::query!(
                "UPDATE user SET totp_secret = ?, totp_verified = false WHERE id = ?",
                totp.secret,
                uuid
            )
            .execute(&state.pool)
            .await?;
            Ok((
                StatusCode::CREATED,
                Json(TOTPResponse {
                    qr_code: totp.get_qr_base64().map_err(|e| {
                        anyhow!("Could not generate QR code from TOTP struct: {}", e)
                    })?,
                }),
            )
                .into_response())
        }
        TOTPRequest::Verify { code } => {
            let secret: Secret = Secret::Raw(
                sqlx::query!("SELECT totp_secret FROM user WHERE id = ?", uuid)
                    .fetch_one(&state.pool)
                    .await?
                    .totp_secret
                    .ok_or(AppError::UserError((
                        StatusCode::BAD_REQUEST,
                        "No TOTP secret found".into(),
                    )))?,
            );
            let totp = TOTP::new_unchecked(
                Algorithm::SHA1,
                6,
                1,
                30,
                secret.to_bytes()?,
                Some("Lokr".to_string()),
                user.email
                    .clone()
                    .unwrap_or_else(|| "placeholder@lokr.com".to_string()),
            );
            // Check the TOTP code provided by the user at the current time
            if !totp.check_current(&code)? {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    "Invalid TOTP code".into(),
                )));
            }
            sqlx::query!("UPDATE user SET totp_verified = true WHERE id = ?", uuid)
                .execute(&state.pool)
                .await?;
            Ok((StatusCode::OK, success!("TOTP verified successfully!")).into_response())
        }
    }
}

// Verify the password against the hash in the database
fn verify_password(state: &AppState, password: &str, password_hash: &str) -> Result<(), AppError> {
    // Alert the tokio runtime that there will be a computationally expensive
    // blocking operation. This will allow the runtime to schedule other tasks
    // while waiting for this operation to complete
    tokio::task::block_in_place(|| {
        // Verify the password against the hash in the database
        state
            .argon2
            .verify_password(
                password.as_bytes(),
                &PasswordHash::new(password_hash)
                    .map_err(|_| anyhow!("Invalid password hash in database"))?,
            )
            .map_err(|_| AppError::UserError((StatusCode::UNAUTHORIZED, "Invalid password".into())))
    })
}
