use std::{cmp::Ordering, fs::File, io::BufWriter, ops::ControlFlow};

use anyhow::anyhow;
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    PasswordHash, PasswordVerifier,
};
use axum::{
    body::{Body, HttpBody},
    extract::{Path, Query, State},
    http::{header::SET_COOKIE, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use base64::{engine::general_purpose, Engine};
use futures_util::StreamExt;
use image::{imageops::FilterType, DynamicImage, GenericImageView};
use serde::{Deserialize, Serialize};
use serde_inline_default::serde_inline_default;
use totp_rs::{Algorithm, Secret, TOTP};
use tracing::instrument;
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;
use validator::{Validate, ValidateEmail, ValidationError};

use crate::{
    auth::SessionAuth,
    error::{AppError, AppValidate, ErrorResponse},
    state::AppState,
    success,
    utils::levenshtien,
    SuccessResponse, AVATAR_DIR,
};

pub const MIN_PASSWORD_LENGTH: u64 = 8;
pub const MAX_PASSWORD_LENGTH: u64 = 64;
pub const MIN_USERNAME_LENGTH: u64 = 3;
pub const MAX_USERNAME_LENGTH: u64 = 20;
pub const PUBLIC_KEY_LENGTH: usize = 550; // Length I ended up with after encoding the public key

/// A struct representing a new user to be created
#[derive(Deserialize, ToSchema, Validate, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateUser {
    /// The name of the user to create
    #[validate(length(min = MIN_USERNAME_LENGTH, max = MAX_USERNAME_LENGTH), custom(function = "validate_username"))]
    // I would use the max and min constants here, but they are not allowed in the attribute
    #[schema(min_length = 3, max_length = 20, example = "sussyman")]
    username: String,
    /// The new user's password
    /// Should be hashed using Argon2 before being sent to the backend
    #[validate(length(min = MIN_PASSWORD_LENGTH, max = MAX_PASSWORD_LENGTH), custom(function = "validate_password"))]
    #[schema(
        min_length = 8,
        max_length = 64,
        example = "$argon2id$v=19$m=16,t=2,p=1$aUtKY1JKZjdmd3RPNmVzdA$/XFnfdBI9vbMEPNeCqlGbw"
    )]
    password: String,
    /// Optional email for the user
    #[validate(email)]
    #[schema(example = "sussyman@amogus.com")]
    email: Option<String>,
    /// The initialization vector for the AES encrypted user's private key
    #[schema(content_encoding = "base64", example = "l+EEL/mHKlkxlEG0")]
    iv: String,
    /// The user's public key
    #[schema(
        content_encoding = "base64",
        example = "d4Ogp+CI5mkdCCfXxDmmxor9FKMTQ5dq4gAvCECgcFs="
    )]
    public_key: String,
    /// The user's private key encrypted using their password
    #[schema(
        content_encoding = "base64",
        example = "38ZP4XEKLikREzyy9ttdaKLZ8WiWCd2i8ptTCwRwMlc="
    )]
    encrypted_private_key: String,
    /// The salt for the PBKDF2 key derivation function
    #[schema(content_encoding = "base64", example = "iKJcRJf7fwtO6est")]
    salt: String,
}

/// A struct representing a user logging in
#[derive(Serialize, Deserialize, ToSchema, Validate, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LoginUser {
    #[validate(length(min = 3, max = 20), custom(function = "validate_username"))]
    #[schema(example = "sussyman")]
    username: String,
    #[validate(length(min = 8, max = 64), custom(function = "validate_password"))]
    #[schema(
        example = "$argon2id$v=19$m=16,t=2,p=1$aUtKY1JKZjdmd3RPNmVzdA$/XFnfdBI9vbMEPNeCqlGbw"
    )]
    password: String,
    /// The totp code provided by the user. Should always be exactly 6 digits
    #[serde(skip_serializing_if = "Option::is_none")]
    #[validate(length(min = 6, max = 6))]
    #[schema(example = "696969")]
    totp_code: Option<String>,
}

/// A successful login response
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    /// The initialization vector for the AES encrypted user's private key
    #[schema(content_encoding = "base64", example = "BukSfO6yaQ")]
    iv: String,
    /// The user's public key
    #[schema(
        content_encoding = "base64",
        example = "QQe22k5wy-88PUFIW1P7MkgxoyMyalmjnffAuUNgMuE"
    )]
    public_key: String,
    /// The user's private key encrypted using their password
    #[schema(
        content_encoding = "base64",
        example = "9WNx5GS9CSaqesguryWS-jiY8Vb0VMMjMtV5JJECk9A"
    )]
    encrypted_private_key: String,
    /// The salt for the PBKDF2 key derivation function
    #[schema(content_encoding = "base64", example = "iKJcRJf7fwtO6est")]
    salt: String,
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

#[utoipa::path(
    post,
    path = "/api/register",
    description = "Register a new user to the database",
    request_body(content = CreateUser, description = "User to register"),
    responses(
        (status = CREATED, description = "User successfully created", body = SuccessResponse),
        (status = CONFLICT, description = "Username or email already in use", body = ErrorResponse),
        (status = BAD_REQUEST, description = "Invalid username, email, or password", body = ErrorResponse)
    )
)]
#[instrument(err, skip(state))]
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

    let decoded_public_key = general_purpose::STANDARD
        .decode(&*new_user.public_key)
        .map_err(|_| {
            AppError::UserError((
                StatusCode::BAD_REQUEST,
                "Failed to decode public key".into(),
            ))
        })?;

    if decoded_public_key.len() != PUBLIC_KEY_LENGTH {
        return Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            format!("Public key must be {} bytes", PUBLIC_KEY_LENGTH).into(),
        )));
    }
    let decoded_iv = general_purpose::STANDARD
        .decode(&*new_user.iv)
        .map_err(|_| {
            AppError::UserError((StatusCode::BAD_REQUEST, "Failed to decode iv".into()))
        })?;
    // AES-GCM requires a 12 byte IV
    if decoded_iv.len() != 12 {
        return Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            "IV must be 12 bytes".into(),
        )));
    }
    general_purpose::STANDARD
        .decode(&*new_user.salt)
        .map_err(|_| {
            AppError::UserError((StatusCode::BAD_REQUEST, "Failed to decode salt".into()))
        })?;
    general_purpose::STANDARD
        .decode(&*new_user.encrypted_private_key)
        .map_err(|_| {
            AppError::UserError((
                StatusCode::BAD_REQUEST,
                "Failed to decode encrypted private key".into(),
            ))
        })?;
    // Salt used for password hashing on the backend, not the one used for the PBKDF2 key derivation function
    // The user provided salt is used for the PBKDF2 key derivation function
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = tokio::task::block_in_place(|| {
        state
            .argon2
            .hash_password(new_user.password.as_bytes(), &salt)
            .map_err(|_| {
                AppError::UserError((StatusCode::BAD_REQUEST, "Unable to hash password".into()))
            })
    })?
    .to_string();
    let uuid = Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO user (id, username, password_hash, email, iv, encrypted_private_key, public_key, salt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        uuid,
        new_user.username,
        password_hash,
        new_user.email,
        new_user.iv,
        new_user.encrypted_private_key,
        new_user.public_key,
        new_user.salt
    )
    .execute(&state.pool)
    .await?;
    Ok((StatusCode::CREATED, success!("User successfully created!")).into_response())
}

#[utoipa::path(
    post,
    path = "/api/login",
    description = "Authenticate a user with the backend",
    request_body(content = LoginUser, description = "User to authenticate"),
    responses(
        (status = OK, description = "User successfully authenticated", body = LoginResponse, headers(("Set-Cookie" = String, description = "`session` cookie containing the authenticated user's session id"))),
        (status = TEMPORARY_REDIRECT, description = "Username and password are correct, but TOTP is missing. Login parameters are returned to allow for easier reuse", body = LoginUser),
        (status = UNAUTHORIZED, description = "Invalid username or password", body = ErrorResponse)
    )
)]
#[instrument(err, skip(state))]
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
    sqlx::query!(
        "INSERT INTO session (id, user_id) VALUES (?, ?) RETURNING id",
        uuid,
        db_user.id
    )
    .fetch_one(&state.pool)
    .await?;

    let login_body = sqlx::query_as!(
        LoginResponse,
        "SELECT iv, public_key, encrypted_private_key, salt FROM user WHERE username = ?",
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

#[derive(Deserialize, Validate, IntoParams, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CheckUsage {
    #[validate(length(min = 3, max = 20), custom(function = "validate_username"))]
    username: Option<String>,
    #[validate(email)]
    email: Option<String>,
}

#[utoipa::path(
    get,
    path = "/api/check",
    description = "Check if a username or email (or both at once) is already in use",
    params(CheckUsage),
    responses(
        (status = OK, description = "No conflicts found", body = SuccessResponse),
        (status = CONFLICT, description = "Username or email already in use", body = [ErrorResponse]),
        (status = BAD_REQUEST, description = "Invalid username or email", body = ErrorResponse)
    ),
    security(
        (),
        ("lokr_session_cookie" = [])
    )
)]
#[instrument(err, skip(state))]
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
/// A struct representing the currently logged in user
pub struct SessionUser {
    id: Uuid,
    /// The name of the user
    #[schema(example = "sussyman")]
    username: String,
    /// Optional email for the user
    #[schema(example = "sussyman@amogus.com")]
    email: Option<String>,
    /// The initialization vector for the AES encrypted user's private key
    #[schema(content_encoding = "base64", example = "BukSfO6yaQ")]
    iv: String,
    /// The user's public key
    #[schema(
        content_encoding = "base64",
        example = "QQe22k5wy-88PUFIW1P7MkgxoyMyalmjnffAuUNgMuE"
    )]
    public_key: String,
    /// The user's private key encrypted using their password
    #[schema(
        content_encoding = "base64",
        example = "9WNx5GS9CSaqesguryWS-jiY8Vb0VMMjMtV5JJECk9A"
    )]
    encrypted_private_key: String,
    /// The salt for the PBKDF2 key derivation function
    #[schema(content_encoding = "base64", example = "iKJcRJf7fwtO6est")]
    salt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// The file extension for the user's avatar
    avatar_extension: Option<String>,
    /// Whether the user has TOTP enabled
    totp_enabled: bool,
    /// Whether the user has verified their TOTP key
    totp_verified: bool,
}

#[utoipa::path(
    get,
    path = "/api/profile",
    description = "Get the currently authenticated user",
    responses(
        (status = OK, description = "User successfully retrieved", body = SessionUser),
        (status = UNAUTHORIZED, description = "No user is currently authenticated", body = ErrorResponse)
    ),
    security(
        ("lokr_session_cookie" = [])
    )
)]
#[instrument(err, skip(state))]
pub async fn get_logged_in_user(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
) -> Result<Response, AppError> {
    let query = sqlx::query_as!(
        SessionUser,
        r#"SELECT id AS "id: _", username, email,
            iv, public_key, encrypted_private_key, salt,
            avatar AS avatar_extension, totp_enabled, totp_verified
            FROM user WHERE id = ?"#,
        user.id
    )
    .fetch_one(&state.pool)
    .await?;
    Ok(Json(query).into_response())
}

/// Update the currently authenticated user's profile
#[derive(Deserialize, ToSchema, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserUpdate {
    /// The field to update
    #[serde(flatten)]
    field: UserUpdateField,
    /// The new value for the field
    #[schema(example = "sussyman2")]
    new_value: String,
    /// The user's current password to prevent accidental or
    /// malicious updates
    #[schema(
        example = "$argon2id$v=19$m=16,t=2,p=1$aUtKY1JKZjdmd3RPNmVzdA$/XFnfdBI9vbMEPNeCqlGbw"
    )]
    password: String,
}

#[derive(Deserialize, ToSchema, Debug)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum UserUpdateField {
    Username,
    Email,
    /// Update the user's password
    /// Requires a new encrypted private key to be provided since
    /// the password is used to derive the key for the AES encryption
    #[serde(rename_all = "camelCase")]
    Password {
        encrypted_private_key: String,
    },
}

#[utoipa::path(
    put,
    path = "/api/profile",
    description = "Update the currently authenticated user",
    request_body(content = UserUpdate, description = "The user data to update"),
    responses(
        (status = OK, description = "User successfully updated", body = SuccessResponse),
        (status = BAD_REQUEST, description = "Invalid username or email", body = ErrorResponse),
        (status = UNAUTHORIZED, description = "No user is currently authenticated or incorrect password", body = ErrorResponse)
    ),
    security(
        ("lokr_session_cookie" = [])
    )
)]
#[instrument(err, skip(state))]
pub async fn update_user(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    Json(update): Json<UserUpdate>,
) -> Result<Response, AppError> {
    let password_hash = sqlx::query!("SELECT password_hash FROM user WHERE id = ?", user.id)
        .fetch_one(&state.pool)
        .await?
        .password_hash;
    verify_password(&state, &update.password, &password_hash)?;

    match update.field {
        UserUpdateField::Username => {
            if update.new_value.len() < MIN_USERNAME_LENGTH as usize
                || update.new_value.len() > MAX_USERNAME_LENGTH as usize
            {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    format!(
                        "Username must be between {} and {} characters",
                        MIN_USERNAME_LENGTH, MAX_USERNAME_LENGTH
                    )
                    .into(),
                )));
            }
            if validate_username(&update.new_value).is_err() {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    "Invalid username".into(),
                )));
            }
            // Check that the new username is not already in use
            // unless the new username is the same as the old one just
            // with different case
            if !user.username.eq_ignore_ascii_case(&update.new_value)
                && sqlx::query!("SELECT id FROM user WHERE username = ?", update.new_value)
                    .fetch_optional(&state.pool)
                    .await?
                    .is_some()
            {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    "Username already in use".into(),
                )));
            }

            sqlx::query!(
                "UPDATE user SET username = ? WHERE id = ?",
                update.new_value,
                user.id
            )
            .execute(&state.pool)
            .await?;
        }
        UserUpdateField::Email => {
            if !(&*update.new_value).validate_email() {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    "Invalid email".into(),
                )));
            }

            // Check that the new email is not already in use
            // unless the new email is the same as the old one just
            // with different case
            if !user
                .email
                .is_some_and(|email| email.eq_ignore_ascii_case(&update.new_value))
                && sqlx::query!("SELECT id FROM user WHERE email = ?", update.new_value)
                    .fetch_optional(&state.pool)
                    .await?
                    .is_some()
            {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    "Email already in use".into(),
                )));
            }

            sqlx::query!(
                "UPDATE user SET email = ? WHERE id = ?",
                update.new_value,
                user.id
            )
            .execute(&state.pool)
            .await?;
        }
        UserUpdateField::Password {
            encrypted_private_key,
        } => {
            if update.new_value.len() < MIN_PASSWORD_LENGTH as usize
                || update.new_value.len() > MAX_PASSWORD_LENGTH as usize
            {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    format!(
                        "Password must be between {} and {} characters",
                        MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH
                    )
                    .into(),
                )));
            }
            if validate_password(&update.new_value).is_err() {
                return Err(AppError::UserError((
                    StatusCode::BAD_REQUEST,
                    "Invalid password".into(),
                )));
            }

            general_purpose::STANDARD
                .decode(&*encrypted_private_key)
                .map_err(|_| {
                    AppError::UserError((
                        StatusCode::BAD_REQUEST,
                        "Failed to decode encrypted private key".into(),
                    ))
                })?;

            // Hash the new password and store the new hash in the database
            let salt = SaltString::generate(&mut OsRng);
            let password_hash = tokio::task::block_in_place(|| {
                state
                    .argon2
                    .hash_password(update.new_value.as_bytes(), &salt)
                    .map_err(|_| {
                        AppError::UserError((
                            StatusCode::BAD_REQUEST,
                            "Unable to hash password".into(),
                        ))
                    })
            })?
            .to_string();

            sqlx::query!(
                "UPDATE user SET password_hash = ?, encrypted_private_key = ? WHERE id = ?",
                password_hash,
                encrypted_private_key,
                user.id
            )
            .execute(&state.pool)
            .await?;
        }
    }

    Ok((StatusCode::OK, success!("User updated successfully")).into_response())
}

#[derive(Deserialize, ToSchema, Debug)]
#[serde(rename_all = "camelCase", tag = "type")]
/// Request an update to the currently authenticated user's TOTP settings
pub enum TOTPRequest {
    /// Enable or disable TOTP for the currently authenticated user
    Enable {
        enable: bool,

        #[schema(
            example = "$argon2id$v=19$m=16,t=2,p=1$aUtKY1JKZjdmd3RPNmVzdA$/XFnfdBI9vbMEPNeCqlGbw"
        )]
        password: String,
    },
    /// Regenerate the currently authenticated user's TOTP secret
    Regenerate {
        #[schema(
            example = "$argon2id$v=19$m=16,t=2,p=1$aUtKY1JKZjdmd3RPNmVzdA$/XFnfdBI9vbMEPNeCqlGbw"
        )]
        password: String,
    },
    /// Verify the currently authenticated user's TOTP
    /// using the provided TOTP code
    Verify {
        #[schema(example = "696969")]
        code: String,
    },
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TOTPResponse {
    /// The base64 encoded QR code for the TOTP secret.
    /// Encoded as a PNG image to allow for easy presentation to the user.
    #[schema(
        content_encoding = "base64",
        example = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0N"
    )]
    qr_code: String,
}

#[utoipa::path(
    put,
    path = "/api/totp",
    description = "Update the currently authenticated user's TOTP settings",
    request_body(content = TOTPRequest, description = "TOTP settings to update"),
    responses(
        (status = OK, description = "TOTP settings successfully updated. Returned when successfully enabling, disabling, or, verifing TOTP.", body = SuccessResponse),
        (status = CREATED, description = "A new TOTP has been regenerated. Returned upon a successful regeneration request", body = TOTPResponse), 
        (status = BAD_REQUEST, description = "Invalid TOTP request", body = ErrorResponse)
    ),
    security(
        ("lokr_session_cookie" = [])
    )
)]
#[instrument(err, skip(state))]
pub async fn update_totp(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    Json(totp_req): Json<TOTPRequest>,
) -> Result<Response, AppError> {
    match totp_req {
        TOTPRequest::Enable { enable, password } => {
            // Query the database to see if the user has both generated a TOTP secret
            // and verified it to prevent them from being locked out of their account
            let db_user = sqlx::query!(
                "SELECT password_hash, totp_secret, totp_verified FROM user WHERE id = ?",
                user.id
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
                user.id
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
            let db_user = sqlx::query!("SELECT password_hash FROM user WHERE id = ?", user.id)
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
                user.id
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
                sqlx::query!("SELECT totp_secret FROM user WHERE id = ?", user.id)
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
            sqlx::query!("UPDATE user SET totp_verified = true WHERE id = ?", user.id)
                .execute(&state.pool)
                .await?;
            Ok((StatusCode::OK, success!("TOTP verified successfully!")).into_response())
        }
    }
}

#[derive(Deserialize, IntoParams, Debug)]
#[into_params(
    parameter_in = Query
)]
#[serde_inline_default]
pub struct UserSearch {
    #[serde(default)]
    #[param(inline)]
    sort: SortOrder,
    #[serde_inline_default(10)]
    limit: u32,
    #[serde_inline_default(0)]
    offset: u32,
}

#[derive(Deserialize, ToSchema, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub enum SortOrder {
    #[default]
    BestMatch,
    Alphabetical,
    Shortest,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicUser {
    /// The id of the user
    id: Uuid,
    /// The name of the user
    #[schema(example = "sussyman")]
    username: String,
    /// Optional email for the user
    #[schema(example = "sussyman@amogus.com")]
    email: Option<String>,
    /// The user's public key
    #[schema(
        content_encoding = "base64",
        example = "QQe22k5wy-88PUFIW1P7MkgxoyMyalmjnffAuUNgMuE"
    )]
    public_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    /// The file extension for the user's avatar
    avatar_extension: Option<String>,
}

#[utoipa::path(
    get,
    path = "/api/users/search/{query}",
    description = "Search for users",
    params(UserSearch, ("query" = String, Path, description = "The query to search for")),
    responses(
        (status = OK, description = "Users found", body = [PublicUser]),
        (status = BAD_REQUEST, description = "Invalid query values", body = ErrorResponse),
        (status = NOT_FOUND, description = "No users found", body = ErrorResponse)
    )
)]
#[instrument(err, skip(state))]
pub async fn search_users(
    State(state): State<AppState>,
    Query(params): Query<UserSearch>,
    Path(query): Path<String>,
) -> Result<Response, AppError> {
    // Don't allow queries that are too short or too long
    if query.len() < MIN_USERNAME_LENGTH as usize {
        return Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            format!("Query must be at least {} characters", MIN_USERNAME_LENGTH).into(),
        )));
    } else if query.len() > MAX_USERNAME_LENGTH as usize {
        return Err(AppError::UserError((
            StatusCode::BAD_REQUEST,
            format!("Query must be at most {} characters", MAX_USERNAME_LENGTH).into(),
        )));
    }
    let mut all_users = sqlx::query_as!(
        PublicUser,
        r#"SELECT id AS "id: _", username, email, public_key, avatar AS avatar_extension FROM user"#
    )
    .fetch_all(&state.pool)
    .await?;
    // Find the best matches for the query using the Levenshtein distance
    all_users.sort_by_cached_key(|user| levenshtien(&query, &user.username));
    let mut best_matches = all_users
        .into_iter()
        .skip(params.offset as usize * params.limit as usize)
        .take(10)
        .collect::<Vec<_>>();
    // Sort the best matches based on the sort order
    match params.sort {
        SortOrder::Alphabetical => {
            best_matches.sort_by(|user1, user2| user1.username.cmp(&user2.username));
        }
        SortOrder::Shortest => {
            best_matches.sort_by_key(|user| user.username.len());
        }
        // Already sorted by best match
        SortOrder::BestMatch => {}
    }

    Ok((StatusCode::OK, Json(best_matches)).into_response())
}

#[utoipa::path(
    get,
    path = "/api/user/{id}",
    description = "Get information about a specific user",
    responses(
        (status = OK, description = "User found", body = PublicUser),
        (status = BAD_REQUEST, description = "Invalid user id", body = ErrorResponse),
        (status = NOT_FOUND, description = "No users found", body = ErrorResponse)
    ),
    security(
        ()
    )
)]
#[instrument(err, skip(state))]
pub async fn get_user(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Response, AppError> {
    let Some(query) = sqlx::query_as!(
        PublicUser,
        r#"SELECT id AS "id: _", username, email, public_key, avatar AS avatar_extension FROM user WHERE id = ?"#,
        id
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        return Err(AppError::UserError((
            StatusCode::NOT_FOUND,
            "User not found".into(),
        )));
    };
    Ok((StatusCode::OK, Json(query)).into_response())
}

#[derive(Serialize, ToSchema)]
pub struct AvatarResponse {
    extension: String,
}

#[utoipa::path(
    put,
    path = "/api/profile/upload",
    description = "Upload a profile image",
    request_body(content = String, description = "The image to upload", content_type = "application/octet-stream"),
    responses(
        (status = OK, description = "Image uploaded successfully", body = AvatarResponse),
        (status = BAD_REQUEST, description = "Invalid image", body = ErrorResponse)
    ),
    security(
        ("lokr_session_cookie" = [])
    )
)]
#[instrument(err, skip(state))]
pub async fn upload_avatar(
    State(state): State<AppState>,
    SessionAuth(user): SessionAuth,
    image_body: Body,
) -> Result<Response, AppError> {
    let mut image_stream = image_body.into_data_stream();
    let mut image_data = Vec::with_capacity(image_stream.size_hint().lower() as usize);
    while let Some(chunk) = image_stream.next().await {
        image_data.extend_from_slice(&chunk?);
    }
    let image_type = image::guess_format(&image_data).map_err(|e| {
        AppError::UserError((StatusCode::BAD_REQUEST, format!("Invalid file data: {}", e)))
    })?;
    let file_extension = image_type
        .extensions_str()
        .first()
        .ok_or(AppError::UserError((
            StatusCode::BAD_REQUEST,
            "Image type does not have a valid file extension".into(),
        )))?;
    let original_image = image::load_from_memory_with_format(&image_data, image_type)?;
    let cropped_image = crop_square(&original_image).resize(256, 256, FilterType::Lanczos3);
    tokio::task::block_in_place(|| -> Result<(), AppError> {
        let mut file = File::create(&*AVATAR_DIR.join(format!("{}.{}", user.id, file_extension)))?;
        let mut writer = BufWriter::new(&mut file);
        cropped_image.write_to(&mut writer, image_type)?;
        Ok(())
    })?;
    sqlx::query!(
        "UPDATE user SET avatar = ? WHERE id = ?",
        file_extension,
        user.id
    )
    .execute(&state.pool)
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(AvatarResponse {
            extension: (*file_extension).into(),
        }),
    )
        .into_response())
}

// Crop an image into a square using the center as the anchor point
fn crop_square(image: &DynamicImage) -> DynamicImage {
    let (iwidth, iheight) = image.dimensions();
    let min_dim = iwidth.min(iheight);
    let (x, y) = match iwidth.cmp(&iheight) {
        Ordering::Less => (0, (iheight - min_dim) / 2),
        Ordering::Greater => ((iwidth - min_dim) / 2, 0),
        Ordering::Equal => (0, 0),
    };
    // This function from the image crate crops the image with the top left corner as the anchor point
    // So translate the center to the top left corner
    image.crop_imm(x, y, min_dim, min_dim)
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

#[utoipa::path(
    get,
    path = "/api/avatars/{id}.{ext}",
    description = "Get the avatar of a user from their id. For now, all uploaded images are converted into 256x256.",
    params(
            ("id" = Uuid, Path, description = "The id of the file to get"),
            ("ext" = String, Path, description = "The file's extension"),
        ),
    responses(
        (status = OK, description = "The file was retrieved successfully", content_type = "application/octet-stream"),
        (status = NOT_FOUND, description = "File was not found"),
    ),
)]
// Dummy function to avoid generate documentation for this path
#[allow(unused)]
async fn get_avatar() {}
