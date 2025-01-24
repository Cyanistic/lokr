-- SQLite Schema
CREATE TABLE file (
    id BLOB PRIMARY KEY,         -- UUIDv7
    owner_id INTEGER,   	 -- User ID of the file owner could be NULL for anonymous files
    encrypted_key BLOB NOT NULL, -- RSA-encrypted AES key
    nonce BLOB NOT NULL,         -- 12-byte AES-GCM nonce
    name BLOB NOT NULL,          -- Encrypted filename
    mime BLOB,                   -- Encrypted MIME type
    size INTEGER NOT NULL,       -- Encrypted size
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    modified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX idx_files_owner_id ON file(owner_id);
