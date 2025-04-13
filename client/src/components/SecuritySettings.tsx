/*File contains code for displaying the Security Settings section on the Profile page*/

import {
  Typography,
  Box,
  Paper,
  Stack,
  Divider,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  IconButton,
} from "@mui/material";
import TwoFactorAuth from "./TotpDisplay";
import SessionManagement from "./SessionManagement";
import { useProfile } from "./ProfileProvider";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useState } from "react";

interface SecuritySettingsSectionProps {
  loading: boolean;
  editingField: string | null;
  updatedValue: string;
  setUpdatedValue: (value: string) => void;
  handleEdit: (field: string, currentValue: string | null) => void;
  handleSave: (field: "username" | "password" | "email") => Promise<void>;
  showTotpWarningModal: boolean;
  setShowTotpWarningModal: (show: boolean) => void;
  showTOTPSetup: boolean;
  totpInputCode: string;
  setTOTPInputCode: (code: string) => void;
  totpVerified: boolean;
  qrCode: string | null;
  handleRegenerateTOTP: () => Promise<void>;
  handleVerifyInline: () => Promise<void>;
  handleEnableTOTP: () => Promise<void>;
}

export default function SecuritySettingsSection({
  loading,
  editingField,
  updatedValue,
  setUpdatedValue,
  handleEdit,
  handleSave,
  showTotpWarningModal,
  setShowTotpWarningModal,
  showTOTPSetup,
  totpInputCode,
  setTOTPInputCode,
  totpVerified,
  qrCode,
  handleRegenerateTOTP,
  handleVerifyInline,
  handleEnableTOTP,
}: SecuritySettingsSectionProps) {
  const { profile } = useProfile();
  // const { showError } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Security and Privacy
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h5" gutterBottom>
        Security and Privacy
      </Typography>
      <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2, mb: 3 }}>
        <Stack spacing={{ xs: 2, sm: 3 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: "bold", mb: 1 }}>
              Password:
            </Typography>
            {editingField === "password" ? (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: { xs: "column", sm: "row" },
                  alignItems: { xs: "stretch", sm: "center" },
                  gap: 1,
                }}
              >
                <TextField
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter new password"
                  value={updatedValue}
                  onChange={(e) => setUpdatedValue(e.target.value)}
                  fullWidth
                  size="small"
                  InputProps={{
                    endAdornment: (
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        sx={{ mr: -1 }}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    ),
                  }}
                />
                <Button
                  variant="contained"
                  onClick={() => handleSave("password")}
                  sx={{
                    width: { xs: "100%", sm: "auto" },
                  }}
                >
                  Save
                </Button>
              </Box>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: { xs: "column", sm: "row" },
                  alignItems: { xs: "flex-start", sm: "center" },
                  gap: { xs: 1, sm: 0 },
                }}
              >
                <Typography variant="body1">••••••••</Typography>
                <Button
                  variant="outlined"
                  onClick={() => handleEdit("password", "")}
                  size="small"
                  sx={{
                    ml: { xs: 0, sm: 2 },
                    width: { xs: "100%", sm: "auto" },
                  }}
                >
                  Change Password
                </Button>
              </Box>
            )}
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: "bold", mb: 1 }}>
              Email:
            </Typography>
            {editingField === "email" ? (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: { xs: "column", sm: "row" },
                  alignItems: { xs: "stretch", sm: "center" },
                  gap: 1,
                }}
              >
                <TextField
                  type="email"
                  value={updatedValue}
                  onChange={(e) => setUpdatedValue(e.target.value)}
                  fullWidth
                  size="small"
                />
                <Button
                  variant="contained"
                  onClick={() => handleSave("email")}
                  sx={{
                    width: { xs: "100%", sm: "auto" },
                  }}
                >
                  Save
                </Button>
              </Box>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: { xs: "column", sm: "row" },
                  alignItems: { xs: "flex-start", sm: "center" },
                  gap: { xs: 1, sm: 0 },
                }}
              >
                <Typography variant="body1" sx={{ wordBreak: "break-word" }}>
                  {profile?.email || "No email provided"}
                </Typography>
                <Button
                  variant="outlined"
                  onClick={() => handleEdit("email", profile?.email || "")}
                  size="small"
                  sx={{
                    ml: { xs: 0, sm: 2 },
                    width: { xs: "100%", sm: "auto" },
                  }}
                >
                  Edit
                </Button>
              </Box>
            )}
          </Box>
        </Stack>
      </Paper>

      {/*Displays 2FA Section*/}
      <TwoFactorAuth
        profile={profile}
        showTOTPSetup={showTOTPSetup}
        totpInputCode={totpInputCode}
        setTOTPInputCode={setTOTPInputCode}
        totpVerified={totpVerified}
        qrCode={qrCode}
        onRegenerateTOTP={handleRegenerateTOTP}
        onVerifyTOTP={handleVerifyInline}
        onEnableTOTP={handleEnableTOTP}
      />

      {/* Warning popup after email change */}
      <Dialog
        open={showTotpWarningModal}
        onClose={() => setShowTotpWarningModal(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Important Notice</DialogTitle>
        <DialogContent>
          <Typography>
            You have updated your email, however, if you had TOTP enabled your
            authenticator app will still display your old email. Regenerate to
            update the email in your authenticator app.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => setShowTotpWarningModal(false)}
            autoFocus
          >
            Got it
          </Button>
        </DialogActions>
      </Dialog>

      {/* Device Session display */}
      <SessionManagement />
    </Box>
  );
}

