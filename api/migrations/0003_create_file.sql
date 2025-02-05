CREATE TABLE file (
    id BLOB PRIMARY KEY NOT NULL,         -- UUIDv7
    owner_id BLOB,   	 -- User ID of the file owner could be NULL for anonymous files
    parent_id BLOB,              -- UUIDv7 of the parent directory, NULL for root
    encrypted_key TEXT NOT NULL, -- Ed25519-encrypted AES key
    nonce TEXT NOT NULL,         -- 12-byte AES-GCM nonce
    encrypted_name TEXT NOT NULL,          -- Encrypted filename
    mime TEXT,                   -- Encrypted MIME type
    size INTEGER DEFAULT 0,      -- Encrypted size, should be 0 for directories
    is_directory BOOLEAN DEFAULT 0, -- 1 if the file is a directory
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
