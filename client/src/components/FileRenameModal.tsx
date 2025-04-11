import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from "@mui/material";
import { FileMetadata } from "../types";
import { useEffect, useState } from "react";

export interface RenameModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (name: string) => Promise<boolean>;
  file?: FileMetadata;
}

export function RenameModal({
  open,
  onClose,
  onConfirm,
  file,
}: RenameModalProps) {
  const [newName, setNewName] = useState<string>(file?.name ?? "");
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    setNewName(file?.name ?? "");
  }, [file?.name]);

  const handleSubmit = async () => {
    setLoading(true);
    if (await onConfirm(newName)) onClose();
    setLoading(false);
  };

  const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setNewName(event.target.value);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      sx={{ backdropFilter: "blur(5px)" }}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle title={file?.name || ""} noWrap>
        Renaming{file?.name ? `: ${file.name}` : ""}
      </DialogTitle>
      <DialogContent sx={{ mb: -2 }}>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          id="newName"
          label="New Name"
          type="text"
          value={newName}
          onChange={handleNameChange}
          variant="outlined"
          sx={{ mt: 1 }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && newName.trim()) {
              handleSubmit();
            }
          }}
        />
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
            <Button onClick={handleSubmit} variant="contained">
              Rename
            </Button>
          )}
        </Box>
      </DialogActions>
    </Dialog>
  );
}
