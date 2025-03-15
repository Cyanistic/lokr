import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Select,
  MenuItem,
  Autocomplete,
  Box,
  IconButton,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
}

const ShareModal: React.FC<ShareModalProps> = ({ open, onClose }) => {
  const [file, setFile] = useState<File | null>(null);
  const [username, setUsername] = useState("");
  const [autocompleteOptions, setAutocompleteOptions] = useState<string[]>([]);
  const [permission, setPermission] = useState("viewer");
  const [generalAccess, setGeneralAccess] = useState<"restricted" | "anyone">("restricted");
  const [anyonePermission, setAnyonePermission] = useState<"viewer" | "editor">("viewer");
  const [password, setPassword] = useState("");
  const [expiration, setExpiration] = useState<string>("12 hours");
  const [sharedFiles, setSharedFiles] = useState([]);
  const [selectedActiveLink, setSelectedActiveLink] = useState("");

  // Fetch usernames for Autocomplete
  const fetchUsernames = async (query: string) => {
    try {
      const response = await fetch(`http://localhost:6969/api/users/search/${query}?limit=10&offset=0`);
      if (!response.ok) throw new Error("Failed to fetch usernames");
      const data = await response.json();
      setAutocompleteOptions(data.map((user: { username: string }) => user.username));
    } catch (error) {
      console.error("Error fetching usernames:", error);
      setAutocompleteOptions([]);
    }
  };

  // Handle Username Input Change
  const handleUsernameChange = async (event: any, value: string) => {
    setUsername(value);
    if (value.length >= 3) {
      await fetchUsernames(value);
    } else {
      setAutocompleteOptions([]);
    }
  };

  // Fetch Shared Files (active links)
  useEffect(() => {
    const fetchSharedFiles = async () => {
      try {
        const response = await fetch("http://localhost:6969/api/shared");
        if (!response.ok) throw new Error("Failed to fetch shared files");
        const data = await response.json();
        setSharedFiles(data);
      } catch (error) {
        console.error("Error fetching shared files:", error);
      }
    };

    if (open) fetchSharedFiles();
  }, [open]);

  // Handle Sharing a File
  const handleShare = async () => {
    if (!file) return alert("Please select a file to share.");
    if (!username) return alert("Please enter a username.");

    const shareData = {
      fileName: file.name,
      username,
      permission,
      generalAccess,
      anyonePermission: generalAccess === "anyone" ? anyonePermission : undefined,
      password: generalAccess === "restricted" ? password : undefined,
      expiration,
    };

    try {
      const response = await fetch("http://localhost:6969/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shareData),
      });

      if (!response.ok) throw new Error("Failed to share file");
      alert("File shared successfully!");
      onClose();
    } catch (error) {
      console.error("Error sharing file:", error);
    }
  };

  // Handle Deleting a Shared Link
  const handleDeleteLink = async (linkId: string) => {
    try {
      const response = await fetch(`http://localhost:6969/api/shared/link/${linkId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete shared link");
      alert("Shared link deleted successfully!");
      setSharedFiles(sharedFiles.filter((file: any) => file.linkId !== linkId));
    } catch (error) {
      console.error("Error deleting shared link:", error);
    }
  };

  // Handle Copying a Link
  const handleCopyLink = () => {
    const linkToShare = "http://localhost:3000/my-shared-file"; // Replace with dynamic link generation if needed
    navigator.clipboard.writeText(linkToShare).then(
      () => alert("Link copied to clipboard!"),
      (err) => console.error("Failed to copy link:", err)
    );
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <Box display="flex" alignItems="center" justifyContent="space-between" p={2}>
        <DialogTitle sx={{ padding: 0 }}>📁 File Sharing</DialogTitle>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent dividers>
        {/* File Selection & Autocomplete */}
        <Box mb={2}>
          <Typography variant="subtitle1">Select File</Typography>
          <input type="file" onChange={(e) => e.target.files && setFile(e.target.files[0])} />
        </Box>

        <Autocomplete
          freeSolo
          options={autocompleteOptions}
          inputValue={username}
          onInputChange={handleUsernameChange}
          renderInput={(params) => <TextField {...params} label="Add people or groups..." variant="outlined" fullWidth />}
        />

        <Box mt={2}>
          <Select value={permission} onChange={(e) => setPermission(e.target.value)} fullWidth>
            <MenuItem value="viewer">Viewer</MenuItem>
            <MenuItem value="editor">Editor</MenuItem>
          </Select>
        </Box>

        {/* People with Access Section above General Access */}
        <Box mt={3} p={2} border="1px solid #ddd" borderRadius="8px" bgcolor="#fafafa">
          <Typography variant="subtitle1">People with access</Typography>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            {/* Left Column: List of Names */}
            <Box>
              {sharedFiles && sharedFiles.length > 0 ? (
                sharedFiles.map((link: any) => (
                  <Typography key={link.linkId}>{link.username || "Unknown User"}</Typography>
                ))
              ) : (
                <Typography>No active links</Typography>
              )}
            </Box>
            {/* Right Column: Dropdown with Expiration Times */}
            <Box>
              <Select
                value={selectedActiveLink}
                onChange={(e) => setSelectedActiveLink(e.target.value)}
                displayEmpty
                sx={{ minWidth: 120 }}
              >
                {sharedFiles && sharedFiles.length > 0 ? (
                  sharedFiles.map((link: any) => (
                    <MenuItem key={link.linkId} value={link.linkId}>
                      {link.expiration}
                    </MenuItem>
                  ))
                ) : (
                  <MenuItem disabled value="">
                    No active links
                  </MenuItem>
                )}
              </Select>
            </Box>
          </Box>
        </Box>

        {/* General Access Section */}
        <Box mt={3} p={2} border="1px solid #ddd" borderRadius="8px" bgcolor="#fafafa">
          <Typography variant="subtitle1">General access</Typography>
          <Box display="flex" alignItems="center" gap={2} mb={2}>
            <Select value={generalAccess} onChange={(e) => setGeneralAccess(e.target.value as "restricted" | "anyone")}>
              <MenuItem value="restricted">Restricted</MenuItem>
              <MenuItem value="anyone">Anyone with the link</MenuItem>
            </Select>
            {generalAccess === "anyone" && (
              <Select value={anyonePermission} onChange={(e) => setAnyonePermission(e.target.value as "viewer" | "editor")}>
                <MenuItem value="viewer">Viewer</MenuItem>
                <MenuItem value="editor">Editor</MenuItem>
              </Select>
            )}
          </Box>

          {generalAccess === "restricted" && (
            <TextField
              label="Password (optional)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
            />
          )}

          <Typography variant="subtitle1">Link Expiration</Typography>
          <Select value={expiration} onChange={(e) => setExpiration(e.target.value as string)} fullWidth sx={{ mb: 2 }}>
            <MenuItem value="12 hours">12 hours</MenuItem>
            <MenuItem value="1 day">1 day</MenuItem>
            <MenuItem value="7 days">7 days</MenuItem>
          </Select>
          <Button variant="outlined" onClick={handleCopyLink} startIcon={<ContentCopyIcon />}>
            Copy link
          </Button>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="outlined">
          Cancel
        </Button>
        <Button onClick={handleShare} variant="contained">
          Share
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ShareModal;
