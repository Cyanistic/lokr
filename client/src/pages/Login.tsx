import React, { useState } from "react";
import localforage from "localforage";
import { Button, useTheme } from '@mui/material';
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LoginUser, PublicUser } from "../types";
import { deriveKeyFromPassword, hashPassword, unwrapPrivateKey } from "../cryptoFunctions";
import { API } from "../utils";
import { useErrorToast } from "../components/ErrorToastProvider";

async function getPasswordSalt(username: string): Promise<string | null> {
  const response = await API.api.searchUsers(username, { limit: 1, offset: 0 });
  if (response.status >= 500) {
    throw new Error("Server error");
  } else if (response.status >= 400) {
    throw new Error("User does not exist");
  }
  const json: PublicUser[] = await response.json();
  if (json.length == 0) {
    throw new Error("User does not exist");
  }
  return json[0].passwordSalt || null;
}

const Login: React.FC = () => {
  const [user, setUser] = useState<LoginUser>({
    username: "",
    email: "",
    password: "",
  });
  const [totpCode, setTotpCode] = useState(""); // Optional for 2FA users
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchParams,] = useSearchParams();
  const [showTotp, setShowTotp] = useState<boolean>(false);
  const navigate = useNavigate();
  const { showError } = useErrorToast();

  // Handle login submission
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    try {
      console.log("Starting login process...");

      if (!user.username || !user.password) {
        setErrorMessage("Username and password are required.");
        console.log("Missing username or password.");
        return;
      }

      if (user.username.length < 3 || user.username.length > 20) {
        setErrorMessage("Username must be 3-20 characters long.");
        return;
      }

      if (user.password.length < 8) {
        setErrorMessage("Password must be at least 8 characters long.");
        return;
      }

      const passwordSalt = await getPasswordSalt(user.username);
      const passwordSaltUint8Array = passwordSalt ? Uint8Array.from(atob(passwordSalt), c => c.charCodeAt(0)) : null;
      const password = await hashPassword(user.password, passwordSaltUint8Array);

      const loginResponse = await API.api.authenticateUser({
        username: user.username,
        password,
        totpCode: totpCode || undefined
      });

      console.log("Login Response Status:", loginResponse.status);
      const responseData = await loginResponse.json();
      console.log("Server Response:", responseData);

      if (loginResponse.status === 401) {
        console.log("Invalid username or password.");
        setErrorMessage("Invalid username or password.");
        return;
      }

      if (loginResponse.status === 307) {
        setShowTotp(true);
        showError("TOTP is required. Please enter your totp code");
        return;
      }

      if (!loginResponse.ok) {
        console.log("Login failed:", responseData.message);
        setErrorMessage(`Login failed: ${responseData.message || "Unknown error"}`);
        return;
      }

      // Save session data
      console.log("Login successful! Saving session data...");

      const masterKey = await deriveKeyFromPassword(user.password, responseData.salt);
      const privateKey = await unwrapPrivateKey(responseData.encryptedPrivateKey, masterKey, responseData.iv);
      localforage.setItem("iv", responseData.iv);
      localforage.setItem("publicKey", responseData.publicKey);
      localforage.setItem("encryptedPrivateKey", responseData.encryptedPrivateKey);
      localforage.setItem("salt", responseData.salt);
      localforage.setItem("privateKey", privateKey);
      localforage.setItem("passwordSalt", passwordSaltUint8Array);

      // Navigate to the redirect URL or the files page if none exists
      navigate(searchParams.get("redirect") ?? "/files");
    } catch (error) {
      console.error("Login error:", error);
      setErrorMessage("Login failed. Please try again.");
    }
  };

  const theme = useTheme();

  return (
    <div style={{ textAlign: "center", padding: "20px" }}>
      <h2>Login</h2>
      {errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}

      <form onSubmit={handleLogin}>
        <input
          type="text"
          placeholder="Username"
          value={user.username ?? ""}
          onChange={(e) => setUser({ ...user, username: e.target.value })}
          required
          style={{ padding: "8px", width: "200px" }}
        />

        <br />

        <input
          type="password"
          placeholder="Password"
          value={user.password ?? ""}
          onChange={(e) => setUser({ ...user, password: e.target.value })}
          required
          style={{ padding: "8px", width: "200px", marginTop: "10px" }}
        />

        <br />

        {/* Show TOTP field only if needed */}
        {showTotp && (
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
        <Button type="submit" variant="contained" style={
          {
            marginTop: "10px",
            padding: "8px 20px",
            cursor: "pointer",
            backgroundColor: theme.palette.mode === 'dark' ? '#2f27ce' : '#3a31d8',
            color: theme.palette.mode === 'dark' ? '#050316' : '#eae9fc'
          }
        }>Login</Button>
      </form>

      <p>
        Don't have an account?{" "}
        <Link to="/register" /*style={/*{ color: theme.palette.mode === 'dark' ? '#2f27ce': '#3a31d8' }*/>
          Register here
        </Link>
      </p>
    </div>
  );
};

export default Login;
