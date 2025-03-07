import React, { useState, useEffect, useRef } from "react";
import localforage from "localforage";
import { Link } from "react-router-dom";
import Button from '@mui/material/Button';

const Login: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState(""); // Optional for 2FA users
  const [userSuggestions, setUserSuggestions] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch user suggestions when username changes
  useEffect(() => {
    if (username.length >= 3) {
      fetchUsernames(username);
    } else {
      setUserSuggestions([]); // Clear dropdown if input is too short
    }
  }, [username]);

  // Close dropdown if clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setUserSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch usernames from the API
  const fetchUsernames = async (query: string) => {
    try {
      const response = await fetch(`http://localhost:6969/api/users/search/${query}?limit=10&offset=0`);
      if (!response.ok) throw new Error(`Failed to fetch usernames: ${await response.text()}`);

      const data = await response.json();
      setUserSuggestions(data.length > 0 ? data.map((user: { username: string }) => user.username) : []);
    } catch (error: any) {
      console.error("Error fetching usernames:", error.message);
      setErrorMessage(error.message);
    }
  };

  // Handle username selection
  const handleSelectUsername = (selectedUsername: string) => {
    setUsername(selectedUsername);
    setUserSuggestions([]); // Close dropdown immediately
  };

  // Handle login submission
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    try {
      console.log("Starting login process...");

      if (!username || !password) {
        setErrorMessage("Username and password are required.");
        console.log("Missing username or password.");
        return;
      }

      // Check if the username exists
      console.log("Checking username:", username);
      const checkResponse = await fetch(`http://localhost:6969/api/check?username=${username}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      console.log("Username check response:", checkResponse.status);

      if (checkResponse.status === 409) {
        console.log("Username exists, proceeding to login...");
      } else if (checkResponse.status === 200) {
        console.log("Username does not exist.");
        setErrorMessage("Username does not exist.");
        return;
      } else {
        throw new Error("Failed to check username availability.");
      }

      // Proceed with login request if username exists
      console.log("Sending login request...");
      const loginResponse = await fetch("http://localhost:6969/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, totpCode: totpCode || undefined }),
      });

      console.log("Login Response Status:", loginResponse.status);
      const responseData = await loginResponse.json();
      console.log("Server Response:", responseData);

      if (loginResponse.status === 401) {
        console.log("Invalid username or password.");
        setErrorMessage("Invalid username or password.");
        return;
      }

      if (!loginResponse.ok) {
        console.log("Login failed:", responseData.message);
        setErrorMessage(`Login failed: ${responseData.message || "Unknown error"}`);
        return;
      }

      // Save session data
      console.log("Login successful! Saving session data...");
      localforage.setItem("iv", responseData.iv);
      localforage.setItem("publicKey", responseData.publicKey);
      localforage.setItem("encryptedPrivateKey", responseData.encryptedPrivateKey);
      localforage.setItem("salt", responseData.salt);

      setErrorMessage("Login successful!");
      alert("Login successful!");
      window.location.href = "/home"; // Redirect after login
    } catch (error) {
      console.error("Login error:", error);
      setErrorMessage("Login failed. Please try again.");
    }
  };

  return (
    <div style={{ textAlign: "center", padding: "20px", color: "white" }}>
      <h2>Login</h2>
      {errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}

      <form onSubmit={handleLogin}>
        {/* Username Input with Dropdown */}
        <div ref={dropdownRef} style={{ position: "relative", display: "inline-block" }}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={{ padding: "8px", width: "200px" }}
          />
          {userSuggestions.length > 0 && (
            <ul
              style={{
                position: "absolute",
                backgroundColor: "white",
                color: "black",
                listStyle: "none",
                padding: 0,
                margin: 0,
                border: "1px solid gray",
                width: "200px",
                maxHeight: "150px",
                overflowY: "auto",
                zIndex: 10,
              }}
            >
              {userSuggestions.map((user, index) => (
                <li
                  key={index}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevents input from losing focus
                    handleSelectUsername(user);
                  }}
                  style={{
                    padding: "8px",
                    cursor: "pointer",
                    borderBottom: "1px solid #ddd",
                  }}
                >
                  {user}
                </li>
              ))}
            </ul>
          )}
        </div>

        <br />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ padding: "8px", width: "200px", marginTop: "10px" }}
        />

        <br />

        {/* Show TOTP field only if needed */}
        {errorMessage?.includes("TOTP") && (
          <input
            type="text"
            placeholder="TOTP Code"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            required
            style={{ padding: "8px", width: "200px", marginTop: "10px" }}
          />
        )}

        <br />

        {/*<button type="submit" style={{ marginTop: "10px", padding: "8px 20px", cursor: "pointer" }}>
          Login
        </button>*/}
        <Button type="submit" variant="contained" style={{ marginTop: "10px", padding: "8px 20px", cursor: "pointer", backgroundColor: 'black', color: 'white' }}>Login</Button>
      </form>

      <p>
        Don't have an account?{" "}
        <Link to="/register" style={{ color: "#ccc" }}>
          Register here
        </Link>
      </p>
    </div>
  );
};

export default Login;
