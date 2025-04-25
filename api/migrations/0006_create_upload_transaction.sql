-- Add chunk_size column to file table
ALTER TABLE file ADD COLUMN chunk_size INTEGER DEFAULT NULL;

-- Update the used space of existing users to account for the additional 1 byte per file
-- This only applies to files that were uploaded before this migration

-- Add 1 byte to used_space for each file a user owns
UPDATE user
SET used_space = used_space + (
    SELECT COUNT(*)  -- Count 1 byte per file
    FROM file
    WHERE file.owner_id = user.id
);

CREATE TABLE upload_transaction (
    id BLOB PRIMARY KEY NOT NULL,         -- UUIDv7
    owner_id BLOB,   	 -- User ID of the file owner could be NULL for anonymous files
    uploader_id BLOB,	 -- User ID of the person who uploaded the file
    parent_id BLOB,              -- UUIDv7 of the parent directory, NULL for root
    encrypted_key TEXT NOT NULL, -- Ed25519-encrypted AES key
    key_nonce TEXT CHECK(key_nonce IS NOT NULL OR parent_id IS NULL), -- 12-byte AES-GCM nonce may be null it the file is in the root directory
    name_nonce TEXT NOT NULL,         -- 12-byte AES-GCM nonce
    mime_type_nonce TEXT CHECK((mime_type_nonce IS NULL) = (mime IS NULL)), -- 12-byte AES-GCM nonce
    encrypted_name TEXT NOT NULL,          -- Encrypted filename
    mime TEXT,                   -- Encrypted MIME type
    expected_size INTEGER NOT NULL DEFAULT 0 CHECK(expected_size > 0),
    total_chunks INTEGER NOT NULL DEFAULT 0 CHECK(total_chunks >= 0), -- Total number of chunks expected
    current_chunks INTEGER NOT NULL DEFAULT 0, -- Number of chunks processed 
    chunk_size INTEGER NOT NULL DEFAULT 524288, -- Expected size of each chunk
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (uploader_id) REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES file(id) ON DELETE CASCADE
);

-- Create index for faster queries by user
CREATE INDEX idx_upload_transaction_uploader_id ON upload_transaction(uploader_id);

-- Create index for faster lookup by owner
CREATE INDEX idx_upload_transaction_owner_id ON upload_transaction(owner_id);

-- Add triggers to update the used space on upload_transaction operations

-- When a new upload transaction is created
CREATE TRIGGER update_upload_transaction_used_space_insert AFTER INSERT ON upload_transaction
BEGIN
    UPDATE user
    SET used_space = used_space + (
        NEW.expected_size + 
        COALESCE(LENGTH(NEW.encrypted_key), 0) +
        COALESCE(LENGTH(NEW.key_nonce), 0) +
        COALESCE(LENGTH(NEW.name_nonce), 0) +
        COALESCE(LENGTH(NEW.mime_type_nonce), 0) +
        COALESCE(LENGTH(NEW.encrypted_name), 0) +
        COALESCE(LENGTH(NEW.mime), 0) +
        IIF(NEW.parent_id IS NULL, 0, 16) +
        IIF(NEW.owner_id IS NULL, 0, 16) + -- owner_id
        IIF(NEW.uploader_id IS NULL, 0, 16) + -- uploader_id
        16 + -- id
        8 + -- expected_size field (integer)
        8 + -- total_chunks field (integer)
        8 + -- current_chunks field (integer)
        8 + -- chunk_size field (integer)
        16 + -- timestamps (2 * 8)
        32  -- Additional overhead for other fields
    )
    WHERE id = NEW.owner_id AND NEW.owner_id IS NOT NULL;
END;

-- When an upload transaction is updated - Full recalculation for same owner
CREATE TRIGGER update_upload_transaction_used_space_update_full 
AFTER UPDATE ON upload_transaction
WHEN (OLD.owner_id IS NOT NULL AND OLD.owner_id = NEW.owner_id AND
     (OLD.expected_size = NEW.expected_size OR
      OLD.encrypted_key != NEW.encrypted_key OR
      OLD.key_nonce != NEW.key_nonce OR
      OLD.name_nonce != NEW.name_nonce OR
      OLD.mime_type_nonce != NEW.mime_type_nonce OR
      OLD.encrypted_name != NEW.encrypted_name OR
      OLD.mime != NEW.mime))
BEGIN
    -- Full recalculation needed
    UPDATE user
    SET used_space = used_space - (
        OLD.expected_size + 
        COALESCE(LENGTH(OLD.encrypted_key), 0) +
        COALESCE(LENGTH(OLD.key_nonce), 0) +
        COALESCE(LENGTH(OLD.name_nonce), 0) +
        COALESCE(LENGTH(OLD.mime_type_nonce), 0) +
        COALESCE(LENGTH(OLD.encrypted_name), 0) +
        COALESCE(LENGTH(OLD.mime), 0) +
        IIF(OLD.parent_id IS NULL, 0, 16) +
        IIF(OLD.owner_id IS NULL, 0, 16) + -- owner_id
        IIF(OLD.uploader_id IS NULL, 0, 16) + -- uploader_id
        16 + -- id
        8 + -- expected_size field (integer)
        8 + -- total_chunks field (integer)
        8 + -- current_chunks field (integer)
        8 + -- chunk_size field (integer)
        16 + -- timestamps (2 * 8)
        32  -- Additional overhead for other fields
    )
    WHERE id = OLD.owner_id;
    
    UPDATE user
    SET used_space = used_space + (
        NEW.expected_size + 
        COALESCE(LENGTH(NEW.encrypted_key), 0) +
        COALESCE(LENGTH(NEW.key_nonce), 0) +
        COALESCE(LENGTH(NEW.name_nonce), 0) +
        COALESCE(LENGTH(NEW.mime_type_nonce), 0) +
        COALESCE(LENGTH(NEW.encrypted_name), 0) +
        COALESCE(LENGTH(NEW.mime), 0) +
        IIF(NEW.parent_id IS NULL, 0, 16) +
        IIF(NEW.owner_id IS NULL, 0, 16) + -- owner_id
        IIF(NEW.uploader_id IS NULL, 0, 16) + -- uploader_id
        16 + -- id
        8 + -- expected_size field (integer)
        8 + -- total_chunks field (integer)
        8 + -- current_chunks field (integer)
        8 + -- chunk_size field (integer)
        16 + -- timestamps (2 * 8)
        32  -- Additional overhead for other fields
    )
    WHERE id = NEW.owner_id;
END;

-- When an upload transaction's owner is changed - Remove from old owner
CREATE TRIGGER update_upload_transaction_used_space_update_old_owner 
AFTER UPDATE ON upload_transaction
WHEN (OLD.owner_id IS NOT NULL AND 
     (OLD.owner_id != NEW.owner_id OR NEW.owner_id IS NULL))
BEGIN
    UPDATE user
    SET used_space = used_space - (
        OLD.expected_size + 
        COALESCE(LENGTH(OLD.encrypted_key), 0) +
        COALESCE(LENGTH(OLD.key_nonce), 0) +
        COALESCE(LENGTH(OLD.name_nonce), 0) +
        COALESCE(LENGTH(OLD.mime_type_nonce), 0) +
        COALESCE(LENGTH(OLD.encrypted_name), 0) +
        COALESCE(LENGTH(OLD.mime), 0) +
        IIF(OLD.parent_id IS NULL, 0, 16) +
        IIF(OLD.owner_id IS NULL, 0, 16) + -- owner_id
        IIF(OLD.uploader_id IS NULL, 0, 16) + -- uploader_id
        16 + -- id
        8 + -- expected_size field (integer)
        8 + -- total_chunks field (integer)
        8 + -- current_chunks field (integer)
        8 + -- chunk_size field (integer)
        16 + -- timestamps (2 * 8)
        32  -- Additional overhead for other fields
    )
    WHERE id = OLD.owner_id;
END;

-- When an upload transaction's owner is changed - Add to new owner
CREATE TRIGGER update_upload_transaction_used_space_update_new_owner 
AFTER UPDATE ON upload_transaction
WHEN (NEW.owner_id IS NOT NULL AND 
     (OLD.owner_id != NEW.owner_id OR OLD.owner_id IS NULL))
BEGIN
    UPDATE user
    SET used_space = used_space + (
        NEW.expected_size + 
        COALESCE(LENGTH(NEW.encrypted_key), 0) +
        COALESCE(LENGTH(NEW.key_nonce), 0) +
        COALESCE(LENGTH(NEW.name_nonce), 0) +
        COALESCE(LENGTH(NEW.mime_type_nonce), 0) +
        COALESCE(LENGTH(NEW.encrypted_name), 0) +
        COALESCE(LENGTH(NEW.mime), 0) +
        IIF(NEW.parent_id IS NULL, 0, 16) +
        IIF(NEW.owner_id IS NULL, 0, 16) + -- owner_id
        IIF(NEW.uploader_id IS NULL, 0, 16) + -- uploader_id
        16 + -- id
        8 + -- expected_size field (integer)
        8 + -- total_chunks field (integer)
        8 + -- current_chunks field (integer)
        8 + -- chunk_size field (integer)
        16 + -- timestamps (2 * 8)
        32  -- Additional overhead for other fields
    )
    WHERE id = NEW.owner_id;
END;

-- When an upload transaction is deleted
CREATE TRIGGER update_upload_transaction_used_space_delete AFTER DELETE ON upload_transaction
BEGIN
    UPDATE user
    SET used_space = used_space - (
        OLD.expected_size + 
        COALESCE(LENGTH(OLD.encrypted_key), 0) +
        COALESCE(LENGTH(OLD.key_nonce), 0) +
        COALESCE(LENGTH(OLD.name_nonce), 0) +
        COALESCE(LENGTH(OLD.mime_type_nonce), 0) +
        COALESCE(LENGTH(OLD.encrypted_name), 0) +
        COALESCE(LENGTH(OLD.mime), 0) +
        IIF(OLD.parent_id IS NULL, 0, 16) +
        IIF(OLD.owner_id IS NULL, 0, 16) + -- owner_id
        IIF(OLD.uploader_id IS NULL, 0, 16) + -- uploader_id
        16 + -- id
        8 + -- expected_size field (integer)
        8 + -- total_chunks field (integer)
        8 + -- current_chunks field (integer)
        8 + -- chunk_size field (integer)
        16 + -- timestamps (2 * 8)
        32  -- Additional overhead for other fields
    )
    WHERE id = OLD.owner_id AND OLD.owner_id IS NOT NULL;
END;

-- Add trigger to automatically update the modified_at timestamp
CREATE TRIGGER update_upload_transaction_timestamp AFTER UPDATE ON upload_transaction
BEGIN
    UPDATE upload_transaction
    SET modified_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- Drop and recreate file triggers to account for the new chunk_size column
DROP TRIGGER IF EXISTS update_user_used_space_insert;
DROP TRIGGER IF EXISTS update_user_used_space_delete;
DROP TRIGGER IF EXISTS update_user_used_space_update;

-- New insert trigger for file table that includes chunk_size
CREATE TRIGGER update_user_used_space_insert AFTER INSERT ON file
BEGIN
    UPDATE user
    SET used_space = used_space +
    NEW.size + 
    -- NULL values consume a single byte
    COALESCE(LENGTH(NEW.encrypted_key), 1) +
    COALESCE(LENGTH(NEW.file_nonce), 1) +
    COALESCE(LENGTH(NEW.key_nonce), 1) +
    COALESCE(LENGTH(NEW.name_nonce), 1) +
    COALESCE(LENGTH(NEW.mime_type_nonce), 1) +
    COALESCE(LENGTH(NEW.encrypted_name), 1) +
    COALESCE(LENGTH(NEW.mime), 1) +
    -- Account for chunk_size (8 bytes if not NULL, 1 byte if NULL)
    IIF(NEW.chunk_size IS NULL, 1, 8) +
    IIF(NEW.parent_id IS NULL, 1, 16) +
    IIF(NEW.uploader_id IS NULL, 1, 16) +
    64 -- Size of constant fields
    WHERE id = NEW.owner_id;
END;

-- New delete trigger for file table that includes chunk_size
CREATE TRIGGER update_user_used_space_delete AFTER DELETE ON file
BEGIN
    UPDATE user
    SET used_space = used_space - (
	OLD.size + 
	-- NULL values consume a single byte
	COALESCE(LENGTH(OLD.encrypted_key), 1) +
	COALESCE(LENGTH(OLD.file_nonce), 1) +
	COALESCE(LENGTH(OLD.key_nonce), 1) +
	COALESCE(LENGTH(OLD.name_nonce), 1) +
	COALESCE(LENGTH(OLD.mime_type_nonce), 1) +
	COALESCE(LENGTH(OLD.encrypted_name), 1) +
	COALESCE(LENGTH(OLD.mime), 1) +
    -- Account for chunk_size (8 bytes if not NULL, 1 byte if NULL)
    IIF(OLD.chunk_size IS NULL, 1, 8) +
	IIF(OLD.parent_id IS NULL, 1, 16) +
	IIF(OLD.uploader_id IS NULL, 1, 16) +
	64 -- Size of constant fields
    )
    WHERE id = OLD.owner_id;
END;

-- New update trigger for file table that includes chunk_size and fixes the duplicated encrypted_name
CREATE TRIGGER update_user_used_space_update AFTER UPDATE ON file
BEGIN
    UPDATE user
    SET used_space = used_space - (
	OLD.size + 
	-- NULL values consume a single byte
	COALESCE(LENGTH(OLD.encrypted_key), 1) +
	COALESCE(LENGTH(OLD.file_nonce), 1) +
	COALESCE(LENGTH(OLD.key_nonce), 1) +
	COALESCE(LENGTH(OLD.name_nonce), 1) +
	COALESCE(LENGTH(OLD.mime_type_nonce), 1) +
	COALESCE(LENGTH(OLD.encrypted_name), 1) +
	COALESCE(LENGTH(OLD.mime), 1) +
    -- Account for chunk_size (8 bytes if not NULL, 1 byte if NULL)
    IIF(OLD.chunk_size IS NULL, 1, 8) +
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
    COALESCE(LENGTH(NEW.file_nonce), 1) +
    COALESCE(LENGTH(NEW.key_nonce), 1) +
    COALESCE(LENGTH(NEW.name_nonce), 1) +
    COALESCE(LENGTH(NEW.mime_type_nonce), 1) +
    COALESCE(LENGTH(NEW.encrypted_name), 1) +
    COALESCE(LENGTH(NEW.mime), 1) +
    -- Account for chunk_size (8 bytes if not NULL, 1 byte if NULL)
    IIF(NEW.chunk_size IS NULL, 1, 8) +
    IIF(NEW.parent_id IS NULL, 1, 16) +
    IIF(NEW.uploader_id IS NULL, 1, 16) +
    64 -- Size of constant fields
    WHERE id = NEW.owner_id;
END;
