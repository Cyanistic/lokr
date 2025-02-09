import { useState } from "react";
import { Link } from "react-router-dom"; // Import Link

export default function Login() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [totpCode, setTotpCode] = useState(""); // Optional for 2FA users
    const [message, setMessage] = useState("");

    async function handleLogin() {
        try {
            setMessage("");
            console.log("Starting login process...");
    
            if (!username || !password) {
                setMessage("Username and password are required.");
                console.log("Missing username or password.");
                return;
            }
    
            // **Step 1: Check if the username exists in the backend**
            console.log("Checking username:", username);
            const checkResponse = await fetch(`http://localhost:6969/api/check?username=${username}`, {
                method: "GET",
                headers: { "Content-Type": "application/json" }
            });
    
            console.log("Username check response:", checkResponse.status);
    
            if (checkResponse.status === 409) { 
                console.log("Username exists, proceeding to login...");
            } else if (checkResponse.status === 200) { 
                console.log("Username does not exist.");
                setMessage("Username does not exist.");
                return;
            } else {
                throw new Error("Failed to check username availability.");
            }
    
            // **Step 2: Proceed with login request if username exists**
            console.log("Sending login request...");
            const loginResponse = await fetch("http://localhost:6969/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password, totpCode: totpCode || undefined })
            });
    
            console.log("Login Response Status:", loginResponse.status);
            const responseData = await loginResponse.json();
            console.log("Server Response:", responseData);
    
            if (loginResponse.status === 401) {
                console.log("Invalid username or password.");
                setMessage("Invalid username or password.");
                return;
            }
    
            if (!loginResponse.ok) {
                console.log("Login failed:", responseData.message);
                setMessage(`Login failed: ${responseData.message || "Unknown error"}`);
                return;
            }
    
            // **If successful, save session**
            console.log("Login successful! Saving session data...");
            localStorage.setItem("iv", responseData.iv);
            localStorage.setItem("publicKey", responseData.publicKey);
            localStorage.setItem("encryptedPrivateKey", responseData.encryptedPrivateKey);
            localStorage.setItem("salt", responseData.salt);
    
            setMessage("Login successful!");
            alert("Login successful!");
        } catch (error) {
            console.error("Login error:", error);
            setMessage("Login failed. Please try again.");
        }
    }

    return (
        <div>
            <h1>Login</h1>
            {message && <p>{message}</p>}
            <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
            
            {/* Show TOTP field only if needed */}
            {message.includes("TOTP") && (
                <input type="text" placeholder="TOTP Code" value={totpCode} onChange={e => setTotpCode(e.target.value)} />
            )}
            
            <button onClick={handleLogin}>Login</button>
            
            {/*ADD BACK THE REGISTER LINK */}
            <p>Don't have an account? <Link to="/register">Register here</Link></p>
        </div>
    );
}
