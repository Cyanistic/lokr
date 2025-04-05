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

interface DeleteModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  file?: FileMetadata;
  loading?: boolean;
}

export function DeleteModal({
  open,
  onClose,
  onConfirm,
  file,
  loading = false,
}: DeleteModalProps) {
  const handleConfirm = async () => {
    await onConfirm();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      sx={{ backdropFilter: "blur(5px)" }}
    >
      <DialogTitle>Confirm Deletion</DialogTitle>
      <DialogContent sx={{ mb: -2 }}>
        <Typography variant="body1" sx={{ mb: 1 }}>
          Are you sure you want to delete{" "}
          {file?.name ? (
            <strong>{file.name}</strong>
          ) : (
            <strong>this file</strong>
          )}
          ?
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
