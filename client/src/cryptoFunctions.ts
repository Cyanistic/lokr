// 🔹 Generate AES-GCM Key (For General Use, Not Password-Based)
export async function generateAESKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

// 🔹 Encrypt Data using AES-GCM (with a derived key)
export async function encryptData(key: CryptoKey, data: string): Promise<{ iv: Uint8Array; encrypted: ArrayBuffer }> {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // Generate a random IV (12 bytes for AES-GCM)
    const encodedData = new TextEncoder().encode(data); // Convert text to bytes

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encodedData
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
            iterations: 100000, // High iteration count for security
            hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 }, // Generate AES-GCM key
        true,
        ["encrypt", "decrypt"]
    );
}
