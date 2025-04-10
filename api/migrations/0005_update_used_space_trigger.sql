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
