import React, { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  CircularProgress,
  Box,
} from "@mui/material";

interface PasswordModalProps {
  open: boolean;
  onClose?: () => void;
  onSubmit: (password: string) => void;
  customText?: string;
  error?: string;
  loading?: boolean;
}

export function PasswordModal({
  open,
  onClose,
  onSubmit,
  customText,
  error,
  loading,
}: PasswordModalProps) {
  const [password, setPassword] = useState("");

  const handlePasswordChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value);
  };

  const handleSubmit = async () => {
    onSubmit(password.trim());
    if (onClose) {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (onClose) {
          onClose();
        }
      }}
      fullWidth
      maxWidth="xs"
      sx={{ backdropFilter: "blur(5px)" }}
    >
      <DialogTitle>Enter Password</DialogTitle>
      <DialogContent sx={{ mb: -2 }}>
        {customText && (
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            {customText}
          </Typography>
        )}
        <TextField
          autoFocus
          margin="none"
          id="password"
          label="Password"
          type="password"
          fullWidth
          variant="outlined"
          value={password}
          onChange={handlePasswordChange}
          error={Boolean(error)}
          helperText={error || " "}
          sx={{ mt: 1 }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && password.trim()) {
              handleSubmit();
            }
          }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {onClose && (
          <Button onClick={onClose} color="inherit">
            Cancel
          </Button>
        )}
        <Box
          sx={{ position: "relative", display: "inline-block", minWidth: 80 }}
        >
          {loading ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: 36, // Approximately the height of the button
              }}
            >
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Button
              onClick={handleSubmit}
              variant="contained"
              color="primary"
              disabled={!password.trim()}
            >
              Submit
            </Button>
          )}
        </Box>
      </DialogActions>
    </Dialog>
  );
}
