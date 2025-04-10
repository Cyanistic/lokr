import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  CircularProgress,
  Box,
} from "@mui/material";
import { FileMetadata } from "../types";
import { useState } from "react";

interface DeleteModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  file?: FileMetadata;
}

export function DeleteModal({
  open,
  onClose,
  onConfirm,
  file,
}: DeleteModalProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm();
    onClose();
    setLoading(false);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      sx={{ backdropFilter: "blur(5px)" }}
    >
      <DialogTitle title={file?.name || ""} noWrap>
        Confirm Deletion
        {file?.name ? `: ${file.name}` : ""}
      </DialogTitle>
      <DialogContent sx={{ mb: -2 }}>
        <Typography variant="body1" sx={{ mb: 1, display: "flex" }}>
          <Box
            component="span"
            sx={{ whiteSpace: "nowrap", wordBreak: "break-word" }}
          >
            Are you sure you want to delete this file?
          </Box>
        </Typography>
        <Typography variant="body1" sx={{ mb: 2 }} color="text.secondary">
          This action cannot be undone.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Box
          sx={{ position: "relative", display: "inline-block", minWidth: 80 }}
        >
          {loading ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: 36,
              }}
            >
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Button onClick={handleConfirm} variant="contained" color="error">
              Delete
            </Button>
          )}
        </Box>
      </DialogActions>
    </Dialog>
  );
}
