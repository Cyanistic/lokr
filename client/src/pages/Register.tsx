import { useState } from "react";
import {
    deriveKeyFromPassword,
    encryptData,
    generateEd25519KeyPair
} from "../cryptoFunctions";

// Helper function to convert Uint8Array to Base64 safely
function toBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
}

// Helper function to safely Base64-encode an `ArrayBuffer`
function bufferToBase64(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

export default function Register() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");

    async function handleRegister() {
        try {
            setMessage("");

            // Validation checks
            if (!username || !password) {
                setMessage("Username and password are required.");
                return;
            }

            if (username.length < 3 || username.length > 20) {
                setMessage("Username must be 3-20 characters long.");
                return;
            }

            if (password.length < 8) {
                setMessage("Password must be at least 8 characters long.");
                return;
            }

            // Step 1: Generate Salt for PBKDF2
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const masterKey = await deriveKeyFromPassword(password, salt);

            // Step 2: Generate Ed25519 Key Pair
            const { publicKey, privateKey } = await generateEd25519KeyPair();

            // 🔍 Log the original private key before encryption
            const privateKeyBase64 = toBase64(privateKey);
            console.log("Original Private Key (Base64):", privateKeyBase64);

            // Step 3: Encrypt Private Key using AES-GCM
            const { iv, encrypted } = await encryptData(masterKey, privateKeyBase64);

            // Convert all binary data to Base64 for JSON transmission
            const saltBase64 = toBase64(salt);
            const ivBase64 = toBase64(iv);
            const encryptedPrivateKeyBase64 = bufferToBase64(encrypted);
            const publicKeyBase64 = toBase64(publicKey);

            // 🔍 Log the encrypted private key after encryption
            console.log("Encrypted Private Key (Base64):", encryptedPrivateKeyBase64);

            // Prepare Request Data
            const body = JSON.stringify({
                username,
                email: email || null,
                password, // 🔹 Backend requires this field
                salt: saltBase64,
                encryptedPrivateKey: encryptedPrivateKeyBase64, // Encrypted private key
                iv: ivBase64, // IV for decryption
                publicKey: publicKeyBase64 // Public key (plaintext)
            });

            console.log("Sending payload:", body);

            // Send request to backend
            const response = await fetch("http://localhost:6969/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body
            });

            const responseText = await response.text();
            console.log("Server Response:", responseText);

            if (!response.ok) {
                throw new Error(`Server Error: ${responseText}`);
            }

            setMessage("Registration successful!");
        } catch (error: unknown) {
            console.error("Registration error:", error);

            if (error instanceof Error) {
                setMessage(`Registration failed: ${error.message}`);
            } else {
                setMessage("Registration failed due to an unknown error.");
            }
        }
    }

    return (
        <div>
            <h1>Register</h1>
            {message && <p>{message}</p>}
            <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
            <button onClick={handleRegister}>Register</button>
        </div>
    );
}
