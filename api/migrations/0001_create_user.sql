CREATE TABLE user (
	id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
	username TEXT NOT NULL UNIQUE COLLATE NOCASE,
	email TEXT UNIQUE COLLATE NOCASE,
	password_hash TEXT NOT NULL,
	public_key TEXT NOT NULL,
	encrypted_private_key TEXT NOT NULL,
	iv TEXT NOT NULL,
	salt TEXT NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_users_username ON user (username);

CREATE TRIGGER users_update_modified_at AFTER UPDATE ON user
BEGIN
    UPDATE users
    SET modified_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;
