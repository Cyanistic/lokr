CREATE TABLE user (
	id BLOB PRIMARY KEY NOT NULL,
	username TEXT NOT NULL UNIQUE COLLATE NOCASE,
	email TEXT UNIQUE COLLATE NOCASE,
	password_hash TEXT NOT NULL,
	public_key TEXT NOT NULL,
	encrypted_private_key TEXT NOT NULL,
	iv TEXT NOT NULL,
	salt TEXT NOT NULL,
	totp_secret BLOB,
	totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
	totp_verified BOOLEAN NOT NULL DEFAULT FALSE,
	avatar TEXT, -- The file extension of the avatar
	theme INTEGER NOT NULL DEFAULT 0,
	grid_view BOOLEAN NOT NULL DEFAULT TRUE,
	sort_order INTEGER NOT NULL DEFAULT 0,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_users_username ON user (username);

CREATE TRIGGER users_update_modified_at AFTER UPDATE ON user
BEGIN
    UPDATE user
    SET modified_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;
