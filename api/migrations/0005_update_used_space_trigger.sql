-- Remove the old trigger because it had a bug
-- where the encrypted name was added twice to the used space
DROP TRIGGER update_user_used_space_update;

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
    IIF(NEW.parent_id IS NULL, 1, 16) +
    IIF(NEW.uploader_id IS NULL, 1, 16) +
    64 -- Size of constant fields
    WHERE id = NEW.owner_id;
END;

-- These update the owner of the file's used space
CREATE TRIGGER update_share_user_used_space_insert AFTER INSERT ON share_user
BEGIN
    UPDATE user
    SET used_space = used_space + (
        COALESCE(LENGTH(NEW.encrypted_key), 1) +
        1 + -- Boolean for edit_permission
        32 + -- Size of the primary key (file_id, user_id)
        16 -- Size of timestamps
    )
    WHERE id = (SELECT owner_id FROM file WHERE id = NEW.file_id);
END;

CREATE TRIGGER update_share_user_used_space_update AFTER UPDATE ON share_user
BEGIN
    UPDATE user
    SET used_space = used_space - (
        COALESCE(LENGTH(OLD.encrypted_key), 1) +
        1 + -- Boolean for edit_permission
        32 + -- Size of the primary key (file_id, user_id)
        16 -- Size of timestamps
    )
    WHERE id = (SELECT owner_id FROM file WHERE id = OLD.file_id);
    
    UPDATE user
    SET used_space = used_space + (
        COALESCE(LENGTH(NEW.encrypted_key), 1) +
        1 + -- Boolean for edit_permission
        32 + -- Size of the primary key (file_id, user_id)
        16 -- Size of timestamps
    )
    WHERE id = (SELECT owner_id FROM file WHERE id = NEW.file_id);
END;

CREATE TRIGGER update_share_user_used_space_delete AFTER DELETE ON share_user
BEGIN
    UPDATE user
    SET used_space = used_space - (
        COALESCE(LENGTH(OLD.encrypted_key), 1) +
        1 + -- Boolean for edit_permission
        32 + -- Size of the primary key (file_id, user_id)
        16 -- Size of timestamps
    )
    WHERE id = (SELECT owner_id FROM file WHERE id = OLD.file_id);
END;

-- Add triggers to update the used space for share_link table entries
-- These update the owner of the file's used space

CREATE TRIGGER update_share_link_used_space_insert AFTER INSERT ON share_link
BEGIN
    UPDATE user
    SET used_space = used_space + (
        16 + -- Size of id (UUIDv7)
        16 + -- Size of file_id
        COALESCE(LENGTH(NEW.password_hash), 1) +
        1 + -- Boolean for edit_permission
        16 + -- Size of timestamps
        IIF(NEW.expires_at IS NULL, 1, 8) -- Timestamp or NULL marker
    )
    WHERE id = (SELECT owner_id FROM file WHERE id = NEW.file_id);
END;

CREATE TRIGGER update_share_link_used_space_update AFTER UPDATE ON share_link
BEGIN
    UPDATE user
    SET used_space = used_space - (
        16 + -- Size of id (UUIDv7)
        16 + -- Size of file_id
        COALESCE(LENGTH(OLD.password_hash), 1) +
        1 + -- Boolean for edit_permission
        16 + -- Size of timestamps
        IIF(OLD.expires_at IS NULL, 1, 8) -- Timestamp or NULL marker
    )
    WHERE id = (SELECT owner_id FROM file WHERE id = OLD.file_id);
    
    UPDATE user
    SET used_space = used_space + (
        16 + -- Size of id (UUIDv7)
        16 + -- Size of file_id
        COALESCE(LENGTH(NEW.password_hash), 1) +
        1 + -- Boolean for edit_permission
        16 + -- Size of timestamps
        IIF(NEW.expires_at IS NULL, 1, 8) -- Timestamp or NULL marker
    )
    WHERE id = (SELECT owner_id FROM file WHERE id = NEW.file_id);
END;

CREATE TRIGGER update_share_link_used_space_delete AFTER DELETE ON share_link
BEGIN
    UPDATE user
    SET used_space = used_space - (
        16 + -- Size of id (UUIDv7)
        16 + -- Size of file_id
        COALESCE(LENGTH(OLD.password_hash), 1) +
        1 + -- Boolean for edit_permission
        16 + -- Size of timestamps
        IIF(OLD.expires_at IS NULL, 1, 8) -- Timestamp or NULL marker
    )
    WHERE id = (SELECT owner_id FROM file WHERE id = OLD.file_id);
END;
