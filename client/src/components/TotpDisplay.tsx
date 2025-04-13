/*File contains code for displaying 2FA section on the Profile page*/

import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  TextField,
  Alert,
  List,
  ListItem,
  Stack,
  Collapse,
  Fade,
} from "@mui/material"

interface TwoFactorAuthProps {
  profile: {
    totpEnabled?: boolean
  } | null
  showTOTPSetup: boolean
  totpInputCode: string
  setTOTPInputCode: (code: string) => void
  totpVerified: boolean
  qrCode: string | null
  onRegenerateTOTP: () => void
  onVerifyTOTP: () => void
  onEnableTOTP: () => void
}

export default function TwoFactorAuth({
  profile,
  showTOTPSetup,
  totpInputCode,
  setTOTPInputCode,
  totpVerified,
  qrCode,
  onRegenerateTOTP,
  onVerifyTOTP,
  onEnableTOTP,
}: TwoFactorAuthProps) {
  return (
    <Paper
      elevation={1}
      sx={{
        p: { xs: 2, sm: 2.5 },
        mb: { xs: 2.5, sm: 3.75 },
        borderRadius: 1.25,
        bgcolor: (theme) => (theme.palette.mode === "dark" ? "background.paper" : "#f9f9f9"),
        border: 1,
        borderColor: (theme) => (theme.palette.mode === "dark" ? "#304b53" : "#e2e8f0"),
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
          mb: 1.875,
          gap: { xs: 1, sm: 0 },
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600, m: 0 }}>
          Two-Factor Authentication
        </Typography>
        <Chip
          label={profile?.totpEnabled ? "Enabled" : "Disabled"}
          color={profile?.totpEnabled ? "primary" : "default"}
          sx={{
            borderRadius: 5,
            bgcolor: profile?.totpEnabled
              ? "#81e6d9"
              : (theme) => (theme.palette.mode === "dark" ? "#2d3748" : "#e2e8f0"),
            color: profile?.totpEnabled
              ? "#151c29"
              : (theme) => (theme.palette.mode === "dark" ? "#a0aec0" : "#4a5568"),
            fontWeight: 500,
            px: 1.25,
            py: 0.5,
          }}
        />
      </Box>

      <Typography
        variant="body2"
        sx={{
          mb: 2.5,
          color: (theme) => (theme.palette.mode === "dark" ? "#a0aec0" : "#666"),
          lineHeight: 1.5,
        }}
      >
        Two-factor authentication adds an extra layer of security to your account by requiring a code from your
        authenticator app in addition to your password.
      </Typography>

      <Paper
        elevation={0}
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "flex-start", sm: "flex-start" },
          gap: 1.875,
          mb: 2.5,
          p: 1.875,
          bgcolor: (theme) => (theme.palette.mode === "dark" ? "#151c29" : "#fff"),
          border: 1,
          borderColor: (theme) => (theme.palette.mode === "dark" ? "#304b53" : "#e2e8f0"),
          borderRadius: 1,
        }}
      >
        <Box sx={{ flexShrink: 0, display: { xs: "flex", sm: "block" }, alignItems: "center", mb: { xs: 1, sm: 0 } }}>
          {profile?.totpEnabled ? (
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                bgcolor: "#81e6d9",
                position: "relative",
                "&::after": {
                  content: '""',
                  position: "absolute",
                  top: 6,
                  left: 6,
                  width: 12,
                  height: 12,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23151c29' strokeWidth='3' strokeLinecap='round' strokeLinejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E")`,
                  backgroundSize: "contain",
                  backgroundRepeat: "no-repeat",
                },
              }}
            />
          ) : (
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                bgcolor: (theme) => (theme.palette.mode === "dark" ? "#2d3748" : "#e2e8f0"),
                position: "relative",
                "&::after": {
                  content: '""',
                  position: "absolute",
                  top: 6,
                  left: 6,
                  width: 12,
                  height: 12,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234a5568' strokeWidth='3' strokeLinecap='round' strokeLinejoin='round'%3E%3Cline x1='18' y1='6' x2='6' y2='18'%3E%3C/line%3E%3Cline x1='6' y1='6' x2='18' y2='18'%3E%3C/line%3E%3C/svg%3E")`,
                  backgroundSize: "contain",
                  backgroundRepeat: "no-repeat",
                },
              }}
            />
          )}
          <Typography
            variant="body1"
            sx={{ ml: { xs: 2, sm: 0 }, display: { xs: "block", sm: "none" }, fontWeight: "bold" }}
          >
            Status:
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="body1" sx={{ mb: 1 }}>
            <strong>Status:</strong>{" "}
            {profile?.totpEnabled
              ? "Your account is protected with two-factor authentication."
              : "Two-factor authentication is not enabled."}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: (theme) => (theme.palette.mode === "dark" ? "#a0aec0" : "#666"),
            }}
          >
            {profile?.totpEnabled
              ? "When you sign in, you'll need to provide a code from your authenticator app."
              : "Enable two-factor authentication for additional account security."}
          </Typography>
        </Box>
      </Paper>

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.25}
        sx={{
          mb: 1.875,
          "& .MuiButton-root": {
            width: { xs: "100%", sm: "auto" },
          },
        }}
      >
        {profile?.totpEnabled ? (
          <>
            <Button
              variant="contained"
              onClick={onRegenerateTOTP}
              sx={{
                bgcolor: (theme) => theme.palette.secondary.main,
                "&:hover": {
                  bgcolor: (theme) => theme.palette.secondary.dark,
                },
              }}
            >
              Reconfigure TOTP
            </Button>
            <Button
              variant="outlined"
              onClick={onEnableTOTP}
              color="error"
              sx={{
                borderColor: "#e74c3c",
                color: "#e74c3c",
                "&:hover": {
                  bgcolor: "#e74c3c",
                  color: "white",
                  borderColor: "#e74c3c",
                },
              }}
            >
              Disable TOTP
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="contained"
              onClick={onRegenerateTOTP}
              sx={{
                bgcolor: (theme) => theme.palette.secondary.main,
                "&:hover": {
                  bgcolor: (theme) => theme.palette.secondary.dark,
                },
              }}
            >
              Set Up TOTP
            </Button>
            {totpVerified && (
              <Button
                variant="contained"
                onClick={onEnableTOTP}
                sx={{
                  bgcolor: (theme) => theme.palette.secondary.main,
                  "&:hover": {
                    bgcolor: (theme) => theme.palette.secondary.dark,
                  },
                }}
              >
                Enable TOTP
              </Button>
            )}
          </>
        )}
      </Stack>

      {/* TOTP Setup Modal with Slide Animation */}
      <Collapse in={showTOTPSetup} mountOnEnter unmountOnExit timeout={400}>
        <Paper
          elevation={0}
          sx={{
            mt: 2.5,
            p: { xs: 1.5, sm: 2.5 },
            border: 1,
            borderColor: (theme) => (theme.palette.mode === "dark" ? "#304b53" : "#e2e8f0"),
            borderRadius: 1,
            bgcolor: (theme) => (theme.palette.mode === "dark" ? "#151c29" : "#fff"),
            overflow: "hidden", // Ensures the animation stays within bounds
          }}
        >
          <Typography
            variant="h6"
            align="center"
            sx={{
              mb: 1.875,
              fontWeight: 600,
              fontSize: { xs: "1.1rem", sm: "1.25rem" },
            }}
          >
            Set Up Two-Factor Authentication
          </Typography>

          <List
            sx={{
              ml: { xs: 1, sm: 2.5 },
              mb: 2.5,
              p: 0,
              color: (theme) => (theme.palette.mode === "dark" ? theme.palette.text.primary : "#000"),
              fontSize: "0.875rem",
              lineHeight: 1.6,
              "& .MuiListItem-root": {
                mb: 1.25,
                pl: 0,
              },
            }}
          >
            <ListItem>
              Scan this QR code with your authenticator app (like Google Authenticator, Authy, or Microsoft
              Authenticator)
            </ListItem>
            <ListItem>Enter the 6-digit code shown in your app below</ListItem>
            <ListItem>Once verified, click "Enable TOTP" to activate two-factor authentication</ListItem>
          </List>

          {/* QR Code with Fade Animation */}
          <Fade in={Boolean(qrCode)} timeout={600}>
            <Box sx={{ display: "flex", justifyContent: "center", mb: 2.5 }}>
              <Box
                component="img"
                src={qrCode! || "/placeholder.svg"}
                alt="TOTP QR Code"
                sx={{
                  width: { xs: 150, sm: 200 },
                  height: { xs: 150, sm: 200 },
                  border: 1,
                  borderColor: (theme) => (theme.palette.mode === "dark" ? "#304b53" : "#e2e8f0"),
                  p: 1.25,
                  bgcolor: "white",
                  m: "0 auto 1.875px",
                  display: "block",
                  transition: "transform 0.3s ease-in-out",
                  "&:hover": {
                    transform: "scale(1.05)",
                  },
                }}
              />
            </Box>
          </Fade>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.25}
            alignItems="center"
            justifyContent="center"
            sx={{ mb: 1.875 }}
          >
            <TextField
              placeholder="Enter 6-digit code"
              value={totpInputCode}
              onChange={(e) => setTOTPInputCode(e.target.value)}
              inputProps={{ maxLength: 6 }}
              sx={{
                width: { xs: "100%", sm: 150 },
                "& .MuiInputBase-input": {
                  textAlign: "center",
                  letterSpacing: 2,
                  p: "10px 12px",
                  bgcolor: (theme) => (theme.palette.mode === "dark" ? "#1e293b" : "inherit"),
                  color: (theme) => (theme.palette.mode === "dark" ? "white" : "inherit"),
                },
              }}
            />
            <Button
              variant="contained"
              onClick={onVerifyTOTP}
              sx={{
                bgcolor: (theme) => theme.palette.secondary.main,
                "&:hover": {
                  bgcolor: (theme) => theme.palette.secondary.dark,
                },
                width: { xs: "100%", sm: "auto" },
              }}
            >
              Verify Code
            </Button>
          </Stack>

          {/* Verification Message with Slide Animation */}
          <Collapse in={totpVerified} mountOnEnter unmountOnExit>
            <Alert
              severity="success"
              sx={{
                mt: 1.875,
                textAlign: "center",
                bgcolor: (theme) => (theme.palette.mode === "dark" ? "rgba(56, 161, 105, 0.2)" : "#c6f6d5"),
                color: (theme) => (theme.palette.mode === "dark" ? "#9ae6b4" : "#2f855a"),
                "& .MuiAlert-icon": {
                  color: (theme) => (theme.palette.mode === "dark" ? "#9ae6b4" : "#2f855a"),
                },
              }}
            >
              Code verified successfully! Click "Enable TOTP" to activate two-factor authentication.
            </Alert>
          </Collapse>
        </Paper>
      </Collapse>
    </Paper>
  )
}


