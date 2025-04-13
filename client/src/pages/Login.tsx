import React, { useState } from "react";
import localforage from "localforage";
import {
  Button,
  TextField,
  Typography,
  Box,
  IconButton,
  Card,
  CardContent,
  CircularProgress,
} from "@mui/material";
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
import { LoginResponse } from "../myApi";
import { useToast } from "../components/ToastProvider";

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
  const [errorMessage, setErrorMessage] = useState<string>(" ");
  const [searchParams] = useSearchParams();
  const [loginStep, setLoginStep] = useState<"login" | "totp">("login");
  const [savedCredentials, setSavedCredentials] = useState<{
    username: string;
    password: string;
  } | null>(null);
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { showError, showSuccess } = useToast();

  // Handle login submission
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (loginStep === "login") {
        if (!user.username || !user.password) {
          setErrorMessage("Username and password are required.");
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

        // Only set loading state once the input is validated
        setLoading(true);
        // Use an empty space instead of an empty string to avoid flickering
        setErrorMessage(" ");
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
        });

        const responseData = await loginResponse.json();

        if (loginResponse.status === 307) {
          setSavedCredentials({ username: user.username, password });
          setLoginStep("totp");
          return;
        }

        if (loginResponse.status === 401) {
          setErrorMessage("Invalid username or password.");
          return;
        }

        if (!loginResponse.ok) throw loginResponse.error;

        await completeLogin(
          user.password,
          responseData,
          passwordSaltUint8Array,
        );
      }

      //TOTP Step
      else if (loginStep === "totp" && savedCredentials) {
        const loginResponse = await API.api.authenticateUser({
          username: savedCredentials.username,
          password: savedCredentials.password,
          totpCode,
        });

        if (!loginResponse.ok) throw loginResponse.error;

        const responseData = loginResponse.data;

        const passwordSalt = (await localforage.getItem(
          "passwordSalt",
        )) as Uint8Array | null;

        if (user.password && responseData && passwordSalt) {
          await completeLogin(user.password, responseData, passwordSalt);
        } else {
          setErrorMessage("Missing login information. Please try again.");
          return;
        }
      }
    } catch (error) {
      showError(
        `Login failed. ${error instanceof Error ? error?.message : "Unknown error"}`,
        error,
      );
    } finally {
      setLoading(false);
    }
  };

  // Function to complete the login process after authentication
  async function completeLogin(
    password: string,
    responseData: LoginResponse,
    passwordSaltUint8Array: Uint8Array | null,
  ) {
    try {
      // Save session data
      const masterKey = await deriveKeyFromPassword(
        password,
        responseData.salt,
      );
      const privateKey = await unwrapPrivateKey(
        responseData.encryptedPrivateKey,
        masterKey,
        responseData.iv,
      );

      await Promise.all([
        localforage.setItem("iv", responseData.iv),
        localforage.setItem("publicKey", responseData.publicKey),
        localforage.setItem(
          "encryptedPrivateKey",
          responseData.encryptedPrivateKey,
        ),
        localforage.setItem("salt", responseData.salt),
        localforage.setItem("privateKey", privateKey),
        localforage.setItem("passwordSalt", passwordSaltUint8Array),
      ]);

      // Navigate to the redirect URL or the files page if none exists
      showSuccess("Login successful! Redirecting...");
      setTimeout(() => {
        navigate(searchParams.get("redirect") ?? "/files");
      }, 100);
    } catch (error) {
      showError("Login failed. Please try again.", error);
    }
  }

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="80vh"
    >
      <Card
        elevation={3}
        sx={{ width: 400, p: 3, borderRadius: 3, boxShadow: 5 }}
      >
        <CardContent>
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            mb={0.5}
          >
            <Lock sx={{ fontSize: 50, mb: 1 }} />
            <Typography variant="h5" fontWeight="bold">
              Sign In
            </Typography>
          </Box>
          <Typography
            variant="body2"
            sx={{
              display: errorMessage ? "inline-block" : "hidden",
              color: "error.main",
              textAlign: "center",
              justifyContent: "center",
            }}
          >
            {errorMessage || " "}
          </Typography>
          <form onSubmit={handleLogin}>
            {loginStep === "login" && (
              <>
                <TextField
                  fullWidth
                  label="Username"
                  variant="outlined"
                  margin="normal"
                  sx={{ mt: 1.5 }}
                  value={user.username}
                  onChange={(e) =>
                    setUser({ ...user, username: e.target.value })
                  }
                  autoFocus
                  required
                />
                <TextField
                  fullWidth
                  label="Password"
                  variant="outlined"
                  margin="normal"
                  type={showPassword ? "text" : "password"}
                  value={user.password}
                  onChange={(e) =>
                    setUser({ ...user, password: e.target.value })
                  }
                  required
                  InputProps={{
                    endAdornment: (
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    ),
                  }}
                />
              </>
            )}

            {loginStep === "totp" && (
              <>
                <Typography variant="body2" fontWeight="bold">
                  Enter the TOTP code from your authenticator app
                </Typography>
                <TextField
                  fullWidth
                  label="TOTP Code"
                  variant="outlined"
                  margin="normal"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  required
                />
              </>
            )}

            {loading ? (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  mt: 2,
                  py: 1.5,
                }}
              >
                <CircularProgress size={24} />
              </Box>
            ) : (
              <Button
                fullWidth
                variant="contained"
                type="submit"
                sx={{ py: 1.5, mt: 2 }}
              >
                {loginStep === "totp" ? "Verify TOTP" : "Sign In"}
              </Button>
            )}
          </form>

          <Typography variant="body2" mt={2}>
            Don't have an account? <Link to="/register">Create an account</Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Login;
