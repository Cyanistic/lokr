import React, { useState } from "react";
import {
  bufferToBase64,
  deriveKeyFromPassword,
  encryptPrivateKey,
  generateRSAKeyPair,
  hashPassword,
} from "../cryptoFunctions";
import {
  TextField,
  Button,
  Card,
  CardContent,
  Typography,
  Box,
  InputAdornment,
  IconButton,
} from "@mui/material";
import {
  Lock as LockIcon,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import { LoginUser } from "../types";
import { DebouncedState, useDebouncedCallback } from "use-debounce";
import { API, validateEmail } from "../utils";

// Helper function to convert Uint8Array to Base64 safely
function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export default function Register() {
  const [user, setUser] = useState<LoginUser>({
    username: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState<LoginUser>({
    username: "",
    email: "",
    password: "",
  });

  const [message, setMessage] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  // Only debounce server side checks
  // Use a different callback function for each input field so that they fire independently
  // of each other.
  const debounceCheck: {
    [key in keyof LoginUser]: DebouncedState<
      (value: string) => Promise<void>
    > | null;
  } = {
    username: useDebouncedCallback(async (value: string) => {
      const usernameRes = await API.api.checkUsage({
        username: value,
      });
      if (usernameRes.ok) {
        setError({ ...error, username: null });
      } else {
        setError({ ...error, username: "Username is already in use!" });
      }
    }, 700),
    password: null,
    email: useDebouncedCallback(async (value: string) => {
      const emailRes = await API.api.checkUsage({
        email: value,
      });
      if (emailRes.ok) {
        setError({ ...error, email: null });
      } else {
        setError({ ...error, email: "Email is already in use!" });
      }
    }, 700),
  };

  function localCheck(key: string, value: string): boolean {
    switch (key) {
      case "username":
        if (!value) {
          setError({ ...error, username: "" });
          return false;
        }
        if (value.length < 3 || value.length > 20) {
          setError({
            ...error,
            username: "Username must be 3-20 characters long.",
          });
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
          setError({
            ...error,
            password: "Password must be at least 8 characters long.",
          });
          return false;
        }
        setError({ ...error, password: null });
    }
    return true;
  }
  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    setUser({ ...user, [event.target.name]: event.target.value || null });

    const check: DebouncedState<(value: string) => Promise<void>> | null =
      debounceCheck[event.target.name as keyof LoginUser];
    if (!localCheck(event.target.name, event.target.value)) {
      check?.cancel();
      return;
    }
    if (check) {
      setError({...error, [event.target.name]: `Checking if ${event.target.name} already exists`})
      check(event.target.value);
    } else {
      setError({...error, [event.target.name]: null})
    }
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

      // Step 2: Generate promises for deriving the master key,
      // generating the RSA key pair, and hashing the password
      const masterKeyPromise = deriveKeyFromPassword(user.password, salt);
      const keyPairPromise = generateRSAKeyPair();
      const hashedPasswordPromise = hashPassword(user.password, null, true);

      // Run all promises in parallel to speed up registration
      const [masterKey, { publicKey, privateKey }, hashedPassword] =
        await Promise.all([
          masterKeyPromise,
          keyPairPromise,
          hashedPasswordPromise,
        ]);

      // Step 3: Encrypt Private Key using AES-GCM
      const { iv, encrypted } = await encryptPrivateKey(privateKey, masterKey);

      // Convert all binary data to Base64 for JSON transmission
      const saltBase64 = toBase64(salt);
      const ivBase64 = toBase64(iv);
      const encryptedPrivateKeyBase64 = bufferToBase64(encrypted);
      const exportedPublicKey = await crypto.subtle.exportKey(
        "spki",
        publicKey,
      );
      const publicKeyBase64 = bufferToBase64(exportedPublicKey);

      // 🔍 Log the encrypted private key after encryption
      console.log("Encrypted Private Key (Base64):", encryptedPrivateKeyBase64);

      // Prepare Request Data
      const body = {
        username: user.username,
        email: user.email || null,
        password: hashedPassword,
        salt: saltBase64,
        encryptedPrivateKey: encryptedPrivateKeyBase64, // Encrypted private key
        iv: ivBase64, // IV for decryption
        publicKey: publicKeyBase64, // Public key (plaintext)
      };
      console.log(body);

      console.log("Sending payload:", body);

      // Send request to backend
      const response = await API.api.createUser(body);

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

    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      height="80vh"
    >
      <Card sx={{ width: 400, p: 3, borderRadius: 3, boxShadow: 5 }}>
        <CardContent>
          <Box textAlign="center" mb={3}>
            <LockIcon fontSize="large" color="primary" />
            <Typography variant="h5" fontWeight="bold" mt={1}>
              Create an account
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Enter your details to create your account
            </Typography>
            <Typography color="error" textAlign="center">{message}</Typography>
            {Object.entries(error)
              .filter(([_, value]) => Boolean(value))
              .map(([k, value]) => (
                <Typography key={`error.${k}`} color="error" textAlign="center">
                  <b>{k}:</b> {value}
                </Typography>
              ))
            }
          </Box>

          <form onSubmit={handleRegister}>
            <TextField
              fullWidth
              label="Username"
              name="username"
              value={user.username}
              onChange={handleChange}
              margin="normal"
            />

            <TextField
              fullWidth
              label="Email"
              name="email"
              type="email"
              value={user.email}
              onChange={handleChange}
              margin="normal"
            />

            <TextField
              fullWidth
              label="Password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={user.password}
              onChange={handleChange}
              margin="normal"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            {/*<TextField
              fullWidth
              label="Confirm Password"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              onChange={handleChange}
              margin="normal"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                    >
                      {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />*/}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{
                mt: 3,
                py: 1.5,
                fontWeight: "bold",
                textTransform: "none",
              }}
            >
              Create account
            </Button>
          </form>

          <Box textAlign="center" mt={2}>
            <Typography
              component="a"
              href="/login"
              sx={{
                color: "text.secondary",
                textDecoration: "none",
                cursor: "pointer",
                "&:hover": { textDecoration: "underline" },
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              ← Back to login
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
    
  );
}
