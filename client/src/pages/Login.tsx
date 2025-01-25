import { useState } from "react";
import { decryptData, deriveKeyFromPassword } from "../cryptoFunctions";

export default function Login() {
    const [password, setPassword] = useState("");

    async function handleLogin() {
        // 🔹 Ensure the user entered a password
        if (!password) {
            console.error("Password is required!");
            return;
        }

        try {
            // 🔹 Fetch encrypted data from backend
            const response = await fetch("/api/login");
            if (!response.ok) {
                throw new Error("Failed to fetch encrypted data");
            }

            const { salt, iv, encryptedData } = await response.json();

            // 🔹 Convert received values to Uint8Array format
            const saltArray = new Uint8Array(salt);
            const ivArray = new Uint8Array(iv);
            const encryptedArray = new Uint8Array(encryptedData).buffer; // Convert to ArrayBuffer

            // 🔹 Derive the AES key from password using PBKDF2
            const key = await deriveKeyFromPassword(password, saltArray);

            // 🔹 Decrypt the data
            const decryptedText = await decryptData(key, ivArray, encryptedArray);

            console.log("✅ Decrypted Username:", decryptedText);
        } catch (error) {
            console.error("❌ Login failed:", error);
        }
    }

    return (
        <div>
            <h1>Login</h1>
            <input 
                type="password" 
                placeholder="Enter Password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
            />
            <button onClick={handleLogin}>Login</button>
        </div>
    );
}
