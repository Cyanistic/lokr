import { argon2id } from "hash-wasm";
import localforage from "localforage";

//  Convert Base64 String to Uint8Array
function fromBase64(base64: string): Uint8Array {
    return new Uint8Array(atob(base64).split("").map(c => c.charCodeAt(0)));
}

//  Convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
    return fromBase64(base64).buffer;
}

//  Generate AES-GCM Key (General Use, Not Password-Based)
export async function generateAESKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

// Encrypt Data using AES-GCM
export async function encryptData(key: CryptoKey, data: string): Promise<{ iv: Uint8Array; encrypted: ArrayBuffer }> {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 12-byte IV for AES-GCM
    const encodedData = new TextEncoder().encode(data);

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encodedData
    );

    return { iv, encrypted };
}

// Encrypt Private Key using AES-GCM
export async function encryptPrivateKey(privateKey: CryptoKey, masterKey: CryptoKey, iv: Uint8Array | string | null = null): Promise<{ iv: Uint8Array; encrypted: ArrayBuffer }> {
    iv = typeof iv === "string" ? fromBase64(iv) : iv;
    if (!iv) {
        iv = crypto.getRandomValues(new Uint8Array(12));
    }

    const encrypted = await crypto.subtle.wrapKey(
        "pkcs8",
        privateKey,
        masterKey,
        { name: "AES-GCM", iv }
    );

    return { iv, encrypted };
}

// Derive AES Key from Password using PBKDF2
export async function deriveKeyFromPassword(password: string, salt: Uint8Array | string): Promise<CryptoKey> {
    const saltBuffer = typeof salt === "string" ? fromBase64(salt) : salt;

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
            salt: saltBuffer,
            iterations: 120000,
            hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
    );
}

// Generate RSA Key Pair for Encryption
export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 4096,
            publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
            hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
    );
}

/**
 * Unwraps (decrypts) the private key using AES-GCM.
 */
export async function unwrapPrivateKey(encryptedPrivateKey: ArrayBuffer | string, masterKey: CryptoKey, iv: Uint8Array | string) {
    try {
        const ivBuffer = typeof iv === "string" ? fromBase64(iv) : iv;
        const encryptedBuffer = typeof encryptedPrivateKey === "string" ? base64ToArrayBuffer(encryptedPrivateKey) : encryptedPrivateKey;

        return await crypto.subtle.unwrapKey(
            "pkcs8",
            encryptedBuffer,
            masterKey,
            { name: "AES-GCM", iv: ivBuffer },
            { name: "RSA-OAEP", hash: "SHA-256" },
            true,
            ["decrypt"]
        );
    } catch (error) {
        console.error("Error unwrapping private key:", error);
        return null;
    }
}

/**
 * Imports a base64-encoded public key into the Web Crypto API.
 */
export async function importPublicKey(publicKeyBase64: string) {
    try {
        const binaryKey = fromBase64(publicKeyBase64);
        return await crypto.subtle.importKey(
            "spki",
            binaryKey,
            { name: "RSA-OAEP", hash: "SHA-256" },
            true,
            ["encrypt"]
        );
    } catch (error) {
        console.error("Error importing public key:", error);
        return null;
    }
}

/**
 * Loads the user's stored keys from localForage.
 */
export async function loadKeys(password: string) {
    const encryptedPrivateKey = await localforage.getItem<string>("encryptedPrivateKey");
    const iv = await localforage.getItem<string>("iv");
    const publicKeyBase64 = await localforage.getItem<string>("publicKey");
    const salt = await localforage.getItem<string>("salt");

    if (!encryptedPrivateKey || !iv || !publicKeyBase64 || !salt) {
        console.error("Missing key data in storage!");
        return;
    }

    const masterKey = await deriveKeyFromPassword(password, salt);
    const privateKey = await unwrapPrivateKey(encryptedPrivateKey, masterKey, iv);
    const publicKey = await importPublicKey(publicKeyBase64);

    return { privateKey, publicKey };
}


// Helper function to safely Base64-encode an `ArrayBuffer`
export function bufferToBase64(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

// Helper function to hash a password for the backend
export async function hashPassword(password: string, salt: Uint8Array | null = null, generate: boolean = false): Promise<string> {
    if (generate) {
        salt = new Uint8Array(16);
        crypto.getRandomValues(salt);
    }
    return await argon2id({
        password,
        salt,
        parallelism: 1,
        iterations: 256,
        memorySize: 512, // use 512KB memory
        hashLength: 32, // output size = 32 bytes
        outputType: "encoded", // return standard encoded string containing parameters needed to verify the key
    })
}
