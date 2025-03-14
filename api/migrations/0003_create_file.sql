CREATE TABLE file (
    id BLOB PRIMARY KEY NOT NULL,         -- UUIDv7
    owner_id BLOB,   	 -- User ID of the file owner could be NULL for anonymous files
    uploader_id BLOB,	 -- User ID of the person who uploaded the file
    parent_id BLOB,              -- UUIDv7 of the parent directory, NULL for root
    encrypted_key TEXT NOT NULL, -- Ed25519-encrypted AES key
    nonce TEXT NOT NULL,         -- 12-byte AES-GCM nonce
    encrypted_name TEXT NOT NULL,          -- Encrypted filename
    mime TEXT,                   -- Encrypted MIME type
    size INTEGER NOT NULL DEFAULT 0 CHECK(size >= 0),      -- Encrypted size, should be 0 for directories
    is_directory BOOLEAN NOT NULL DEFAULT 0, -- 1 if the file is a directory
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES file(id) ON DELETE CASCADE
);

CREATE INDEX idx_files_owner_id ON file(owner_id);
CREATE INDEX idx_files_parent_id ON file(parent_id);

CREATE TRIGGER file_update_modified_at AFTER UPDATE ON file
BEGIN
    UPDATE file
    SET modified_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- Add triggers to update the used space on owner fields
-- so we can easily keep track of how much space each user
-- is using

CREATE TRIGGER update_user_used_space_insert AFTER INSERT ON file
BEGIN
    UPDATE user
    SET used_space = used_space +
    NEW.size + 
    -- NULL values consume a single byte
    COALESCE(LENGTH(NEW.encrypted_key), 1) +
    COALESCE(LENGTH(NEW.nonce), 1) +
    COALESCE(LENGTH(NEW.encrypted_name), 1) +
    COALESCE(LENGTH(NEW.mime), 1) +
    IIF(NEW.parent_id IS NULL, 1, 16) +
    IIF(NEW.uploader_id IS NULL, 1, 16) +
    64 -- Size of constant fields
    WHERE id = NEW.owner_id;
END;

CREATE TRIGGER update_user_used_space_delete AFTER DELETE ON file
BEGIN
    UPDATE user
    SET used_space = used_space - (
	OLD.size + 
	-- NULL values consume a single byte
	COALESCE(LENGTH(OLD.encrypted_key), 1) +
	COALESCE(LENGTH(OLD.nonce), 1) +
	COALESCE(LENGTH(OLD.encrypted_name), 1) +
	COALESCE(LENGTH(OLD.mime), 1) +
	IIF(OLD.parent_id IS NULL, 1, 16) +
	IIF(OLD.uploader_id IS NULL, 1, 16) +
	64 -- Size of constant fields
    )
    WHERE id = OLD.owner_id;
END;

CREATE TRIGGER update_user_used_space_update AFTER UPDATE ON file
BEGIN
    UPDATE user
    SET used_space = used_space - (
	OLD.size + 
	-- NULL values consume a single byte
	COALESCE(LENGTH(OLD.encrypted_key), 1) +
	COALESCE(LENGTH(OLD.nonce), 1) +
	COALESCE(LENGTH(OLD.encrypted_name), 1) +
	COALESCE(LENGTH(OLD.mime), 1) +
	IIF(OLD.parent_id IS NULL, 1, 16) +
	IIF(OLD.uploader_id IS NULL, 1, 16) +
	64 -- Size of constant fields
    )
    WHERE id = OLD.owner_id;
    UPDATE user
    SET used_space = used_space +
    NEW.size + 
    -- NULL values consume a single byte
    COALESCE(LENGTH(NEW.encrypted_key), 1) +
    COALESCE(LENGTH(NEW.nonce), 1) +
    COALESCE(LENGTH(NEW.encrypted_name), 1) +
    COALESCE(LENGTH(NEW.mime), 1) +
    IIF(NEW.parent_id IS NULL, 1, 16) +
    IIF(NEW.uploader_id IS NULL, 1, 16) +
    64 -- Size of constant fields
    WHERE id = NEW.owner_id;
END;
