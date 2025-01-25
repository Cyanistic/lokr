import { useState } from "react";
import { deriveKeyFromPassword, encryptData } from "../cryptoFunctions";

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
                setMessage("❌ Username and password are required.");
                return;
            }

            if (username.length < 3 || username.length > 20) {
                setMessage("❌ Username must be 3-20 characters long.");
                return;
            }

            if (password.length < 8) {
                setMessage("❌ Password must be at least 8 characters long.");
                return;
            }

            // Generate salt for PBKDF2
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const key = await deriveKeyFromPassword(password, salt);
            const { iv, encrypted } = await encryptData(key, username);

            // Convert data to Base64
            const saltBase64 = btoa(String.fromCharCode(...salt));
            const ivBase64 = btoa(String.fromCharCode(...iv));
            const encryptedBase64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
            const body = JSON.stringify({

                username,
                email: email || null,
                salt: saltBase64,
                encryptedPrivateKey: "c3RyaW5n", //encrypt
                iv: ivBase64,
                password: saltBase64, // Hash with Arg2 instead 
                publicKey: "c3RyaW5n" //encode dont encrypt
            
            })


            // Send request to backend with correct field names
            const response = await fetch("http://localhost:6969/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body
            });
            
            console.log(body);
            const responseData = await response.json();

            if (!response.ok) {
                setMessage(`❌ ${responseData.message || "Registration failed."}`);
                return;
            }

            setMessage("✅ Registration successful!");
        } catch (error) {
            console.error("❌ Registration error:", error);
            setMessage("❌ Registration failed. Please try again.");
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
