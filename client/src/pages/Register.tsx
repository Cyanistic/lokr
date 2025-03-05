import React, { useState } from "react";
import {
    deriveKeyFromPassword,
    encryptPrivateKey,
    generateRSAKeyPair
} from "../cryptoFunctions";
import {Button, useTheme} from '@mui/material';
import { LoginUser } from "../types";
import { useDebouncedCallback } from "use-debounce";
import { BASE_URL, validateEmail } from "../utils";

// Helper function to convert Uint8Array to Base64 safely
function toBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
}

// Helper function to safely Base64-encode an `ArrayBuffer`
function bufferToBase64(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

export default function Register() {
    const [user, setUser] = useState<LoginUser>({
        username: "",
        email: "",
        password: ""
    });
    const [error, setError] = useState<LoginUser>({
        username: "",
        email: "",
        password: ""
    });

    const [message, setMessage] = useState("");

    // Only debounce server side checks
    const debounceCheck = useDebouncedCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        switch (event.target.name) {
            case "username":
                const usernameRes = await fetch(`${BASE_URL}/api/check?username=${event.target.value}`);
                if (usernameRes.ok) {
                    setError({ ...error, username: null });
                } else {
                    setError({ ...error, username: "Username is already in use!" });
                }
                break;

            case "email":
                const emailRes = await fetch(`${BASE_URL}/api/check?email=${event.target.value}`);
                if (emailRes.ok) {
                    setError({ ...error, email: null });
                } else {
                    setError({ ...error, email: "Email is already in use!" });
                }
                break;
        }
    }, 700);

    function localCheck(key: string, value: string): boolean {
        switch (key) {
            case "username":
                if (!value) {
                    setError({ ...error, username: "" });
                    return false;
                }
                if (value.length < 3 || value.length > 20) {
                    setError({ ...error, username: "Username must be 3-20 characters long." });
                    return false;
                }
                break;

            case "email":
                if (!value) {
                    setError({ ...error, email: null });
                    return true;
                }
                if (!validateEmail(value)) {
                    setError({ ...error, email: "Invalid email!" });
                    return false;
                }
                break;
            case "password":
                if (!value) {
                    setError({ ...error, password: "" });
                    return false;
                }
                if (value.length < 8) {
                    setError({ ...error, password: "Password must be at least 8 characters long." });
                    return false
                }
                setError({ ...error, password: null });
        }
        return true;
    }
    async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
        setUser({ ...user, [event.target.name]: event.target.value });
        if (!localCheck(event.target.name, event.target.value)) {
            debounceCheck.cancel();
            return;
        }
        debounceCheck(event);
    }

    async function handleRegister(event?: React.FormEvent<HTMLFormElement>) {
        if (event) event.preventDefault(); // Prevent page reload
        try {
            setMessage("");
            if (!user.username) {
                setError({ ...error, username: "Username is required" });
                return;
            }

            if (!user.password) {
                setError({ ...error, password: "Password is required" });
                return;
            }

            // Check the proper invariants
            let valid = true;
            for (const [key, value] of Object.entries(user)) {
                valid &&= localCheck(key, value);
            }

            if (!valid) {
                return;
            }

            // Step 1: Generate Salt for PBKDF2
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const masterKey = await deriveKeyFromPassword(user.password, salt);

            // Step 2: Generate Ed25519 Key Pair
            const { publicKey, privateKey } = await generateRSAKeyPair();

            // Step 3: Encrypt Private Key using AES-GCM
            const { iv, encrypted } = await encryptPrivateKey(privateKey, masterKey);

            // Convert all binary data to Base64 for JSON transmission
            const saltBase64 = toBase64(salt);
            const ivBase64 = toBase64(iv);
            const encryptedPrivateKeyBase64 = bufferToBase64(encrypted);
            const exportedPublicKey = await crypto.subtle.exportKey("spki", publicKey);
            const publicKeyBase64 = bufferToBase64(exportedPublicKey);

            // 🔍 Log the encrypted private key after encryption
            console.log("Encrypted Private Key (Base64):", encryptedPrivateKeyBase64);

            // Prepare Request Data
            const body = JSON.stringify({
                username: user.username,
                email: user.email?.length === 0 ? null : user.email,
                password: user.password, // 🔹 Backend requires this field
                salt: saltBase64,
                encryptedPrivateKey: encryptedPrivateKeyBase64, // Encrypted private key
                iv: ivBase64, // IV for decryption
                publicKey: publicKeyBase64 // Public key (plaintext)
            });

            console.log("Sending payload:", body);

            // Send request to backend
            const response = await fetch(`${BASE_URL}/api/register`, {
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
    const theme = useTheme();

    return (
        <div style={{ textAlign: "center", padding: "20px"}}>
            <h1>Register</h1>
            <p>{message}</p>
            {Object.entries(error).filter(([_, value]) => Boolean(value)).map(([k, value]) => {
                return <p key={`error.${k}`}><b>{k}:</b> {value}</p>
            })}
            <form onSubmit={handleRegister}>
<<<<<<< HEAD
                <div style={{ position: "relative", display: "inline-block" }}>
                    <input 
                        type="text" 
                        placeholder="Username" 
                        value={username} 
                        onChange={e => setUsername(e.target.value)} 
                        required
                        style={{ padding: "8px", width: "200px" }}
                    />
                    <br />
                    <input 
                        type="email" 
                        placeholder="Email" 
                        value={email} 
                        onChange={e => setEmail(e.target.value)} 
                        style={{ padding: "8px", width: "200px", marginTop: "10px" }}
                    />
                    <br />
                    <input 
                        type="password" 
                        placeholder="Password" 
                        value={password} 
                        onChange={e => setPassword(e.target.value)} 
                        required
                        style={{ padding: "8px", width: "200px", marginTop: "10px" }}
                    />
                    <br />
                    <br />
                    {/*<button type="submit">Register</button>*/}
                    <Button type="submit" variant="contained" style={
                        {  
                            textTransform: 'none', 
                            backgroundColor: theme.palette.mode === 'dark' ? '#2f27ce': '#3a31d8', 
                            color: theme.palette.mode === 'dark' ? '#050316' : '#eae9fc' 
                        }
                    }>Register</Button>

                </div>
=======
                <input
                    type="text"
                    placeholder="Username"
                    name="username"
                    value={user.username ?? ""}
                    onChange={handleChange}
                    required
                />
                <input
                    type="email"
                    name="email"
                    placeholder="Email"
                    value={user.email ?? ""}
                    onChange={handleChange}
                />
                <input
                    type="password"
                    placeholder="Password"
                    name="password"
                    value={user.password ?? ""}
                    onChange={handleChange}
                    required
                />
                <button type="submit">Register</button>
>>>>>>> f1f271e (improved register page to report errors on change)
            </form>
        </div>
    );
}
