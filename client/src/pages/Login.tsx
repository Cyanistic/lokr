import React, { useState } from "react";
import localforage from "localforage";
import { Button, TextField, Typography, Box, Paper, IconButton } from "@mui/material";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LoginUser, PublicUser } from "../types";
import {
  deriveKeyFromPassword,
  hashPassword,
  unwrapPrivateKey,
} from "../cryptoFunctions";
import { API } from "../utils";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { Lock } from "@mui/icons-material";

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
  const [searchParams] = useSearchParams();
  const [showTotp, setShowTotp] = useState<boolean>(false);
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

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
      const passwordSaltUint8Array = passwordSalt
        ? Uint8Array.from(atob(passwordSalt), (c) => c.charCodeAt(0))
        : null;
      const password = await hashPassword(
        user.password,
        passwordSaltUint8Array,
      );

      const loginResponse = await API.api.authenticateUser({
        username: user.username,
        password,
        totpCode: totpCode || undefined,
      });

      console.log("Login Response Status:", loginResponse.status);
      const responseData = await loginResponse.json();
      console.log("Server Response:", responseData);

      if (loginResponse.status === 307) {
        console.log("TOTP required, showing TOTP input field.");
        setErrorMessage("TOTP required.");
        return;
      }

      if (loginResponse.status === 401) {
        console.log("Invalid username or password.");
        setErrorMessage("Invalid username or password.");
        return;
      }

      if (loginResponse.status === 307) {
        setShowTotp(true);
        //showEr("TOTP is required. Please enter your totp code");
        return;
      }

      if (!loginResponse.ok) {
        console.log("Login failed:", responseData.message);
        setErrorMessage(
          `Login failed: ${responseData.message || "Unknown error"}`,
        );
        return;
      }

      // Save session data
      console.log("Login successful! Saving session data...");

      const masterKey = await deriveKeyFromPassword(
        user.password,
        responseData.salt,
      );
      const privateKey = await unwrapPrivateKey(
        responseData.encryptedPrivateKey,
        masterKey,
        responseData.iv,
      );
      localforage.setItem("iv", responseData.iv);
      localforage.setItem("publicKey", responseData.publicKey);
      localforage.setItem(
        "encryptedPrivateKey",
        responseData.encryptedPrivateKey,
      );
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

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
      <Paper elevation={3} sx={{ p: 4, maxWidth: 400, textAlign: "center" }}>
        <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" mb={2}>
          <Lock sx={{ fontSize: 50, mb: 1 }} />
          <Typography variant="h5" fontWeight="bold">
            Sign In
          </Typography>
        </Box>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          {errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}
        </Typography>
        <form onSubmit={handleLogin}>
          <TextField
            fullWidth
            label="Username"
            variant="outlined"
            margin="normal"
            value={user.username}
            onChange={(e) => setUser({ ...user, username: e.target.value })}
            required
          />
          <TextField
            fullWidth
            label="Password"
            variant="outlined"
            margin="normal"
            type={showPassword ? "text" : "password"}
            value={user.password}
            onChange={(e) => setUser({ ...user, password: e.target.value })}
            required
            InputProps={{
              endAdornment: (
                <IconButton onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              ),
            }}
          />
          {showTotp && (
            <TextField
              fullWidth
              label="TOTP Code"
              variant="outlined"
              margin="normal"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              required
            />
          )}
          <Button fullWidth variant="contained" type="submit" sx={{ mt: 2 }}>
            Sign in
          </Button>
        </form>
        <Typography variant="body2" mt={2}>
          Don't have an account? <Link to="/register">Create an account</Link>
        </Typography>
      </Paper>
    </Box>
    
  );
};

export default Login;
