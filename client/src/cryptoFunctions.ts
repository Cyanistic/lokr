// 🔹 Generate AES-GCM Key (General Use, Not Password-Based)
export async function generateAESKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

// 🔹 Encrypt Data using AES-GCM (with a derived key)
export async function encryptData(key: CryptoKey, data: string): Promise<{ iv: Uint8Array; encrypted: ArrayBuffer }> {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM IV should always be 12 bytes
    const encodedData = new TextEncoder().encode(data); // Convert text to bytes

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encodedData
    );

    return { iv, encrypted };
}

// Used to encrypt the private key before sending it to the server
export async function encryptPrivateKey(privateKey: CryptoKey, masterKey: CryptoKey): Promise<{ iv: Uint8Array; encrypted: ArrayBuffer }> {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM IV should always be 12 bytes

    const encrypted = await crypto.subtle.wrapKey(
        "pkcs8",
        privateKey,
        masterKey,
        { name: "AES-GCM", iv },
    );

    return { iv, encrypted };
}

// 🔹 Decrypt Data using AES-GCM (with a derived key)
export async function decryptData(key: CryptoKey, iv: Uint8Array, encrypted: ArrayBuffer): Promise<string> {
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        encrypted
    );

    return new TextDecoder().decode(decrypted);
}

// 🔹 Derive AES Key from Password using PBKDF2
export async function deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    return await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt,
            iterations: 120000, // High iteration count for security
            hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 }, // Generate AES-GCM key
        true,
        ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
    );
}


export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 4096,
            publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // default according to the standard
            hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"]
    );
}
