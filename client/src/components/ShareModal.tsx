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
  Tabs,
  Tab,
  Stack,
  Collapse,
  Avatar,
  FormControl,
  InputLabel,
  Snackbar,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { AccountCircle, Link } from "@mui/icons-material";
import { FileMetadata, PublicUser, ShareLink } from "../types";
import { bufferToBase64, importPublicKey, shareFileKey } from "../cryptoFunctions";
import DefaultProfile from "/default-profile.webp";
import { API, BASE_URL } from "../utils";
import { useErrorToast } from "./ErrorToastProvider";

interface ShareModalProps {
  open: boolean;
  file?: FileMetadata | null;
  onClose: () => void;
}

const ShareModal: React.FC<ShareModalProps> = ({ open, onClose, file }) => {
  const [username, setUsername] = useState("");
  const [autocompleteOptions, setAutocompleteOptions] = useState<PublicUser[]>([]);
  const [permission, setPermission] = useState("viewer");
  const [anyonePermission, setAnyonePermission] = useState<"viewer" | "editor">("viewer");
  const [password, setPassword] = useState("");
  const availableDurationUnits = ["never", "hours", "days", "weeks"] as const;
  const [durationUnits, setExpiration] = useState<typeof availableDurationUnits[number]>("hours");
  const [tab, setTab] = useState<number>(0);
  const [fields, setFields] = useState<{ users: { [id: string]: PublicUser }, links: { [id: string]: ShareLink } }>({ users: {}, links: {} })
  const [duration, setDuration] = useState<number>(1);
  const [copyToast, setCopyToast] = useState(false);
  const { showError } = useErrorToast();

  // Fetch usernames for Autocomplete
  const fetchUsernames = async (query: string) => {
    try {
      const response = await API.api.searchUsers(query, {
        limit: 10,
        offset: 0
      });
      if (!response.ok) throw response.error;
      const data = await response.json();
      setAutocompleteOptions(data);
    } catch (error) {
      showError("Error fetching usernames.", error);
      setAutocompleteOptions([]);
    }
  };

  // Handle Username Input Change
  const handleUsernameChange = async (_: any, value: string | PublicUser) => {
    if (typeof value !== "string") {
      // This is the case where the use selected a value
      value.edit = permission === "editor";
      handleShare(value);
      setFields({ ...fields, users: { ...fields.users, [value.id]: value } });
      setUsername("");
      return;
    }
    setUsername(value);
    if (value.length >= 3) {
      await fetchUsernames(value);
    } else {
      setAutocompleteOptions([]);
    }
  };

  const handlePermissionChange = async (userId: string, newPermission: string) => {
    console.log(userId, newPermission)
  }

  const handlePasswordChange = async (linkId: string, newPermission: string) => {
    console.log(linkId, newPermission)
  }

  const handleRevokePermission = async (item: PublicUser | ShareLink) => {
    switch (item.type) {
      case "user":
        try {
          const response = await API.api.deleteSharePermission({
            type: "user",
            fileId: file?.id as string,
            userId: item.id
          });
          if (!response.ok) throw response.error;
          delete fields.users[item.id];
          setFields(fields);
        } catch (error) {
          showError(`Failed to revoke permissions for ${item.username}`, error);
        }
        break;
      case "link":
        try {
          if (!item.id) {
            return;
          }
          const response = await API.api.deleteSharePermission({
            type: "link",
            linkId: item.id
          });
          if (!response.ok) throw response.error;
          delete fields.links[item.id];
          setFields(fields);
        } catch (error) {
          showError(`Failed to revoke permissions for ${item.id}`, error);
        }
    }
  }

  const fetchActiveField = async (field: "users" | "links") => {
    try {
      let response;
      if (field == "users") {
        response = await API.api.getSharedUsers(file?.id as string);
      } else {
        response = await API.api.getSharedLinks(file?.id as string);

      }
      if (!response.ok) throw response.error;
      const data = await response.json();
      setFields({ ...fields, [field]: data });
    } catch (error) {
      showError(`Failed to fetch active ${field}`, error);
    }
  };

  // Fetch Shared Files (active links)
  useEffect(() => {
    if (open) {
      fetchActiveField("users");
      fetchActiveField("links");
    }
  }, [open]);

  // Handle Sharing a File
  const handleShare = async (item: PublicUser | { type: "link" }) => {
    switch (item.type) {
      case "user":
        if (!file?.key) {
          return showError("No decrypted file key");
        };
        const publicKey = await importPublicKey(item.publicKey);
        if (!publicKey) {
          return showError("Error importing user's public key");
        }
        try {
          const response = await API.api.shareFile({
            type: "user",
            id: file.id,
            userId: username,
            encryptedKey: bufferToBase64(await shareFileKey(file.key, publicKey)),
            edit: permission === "editor"
          });

          if (!response.ok) throw response.error;
          showError("File shared successfully!");
        } catch (error) {
          showError("Error sharing file. Please try again.", error);
        }
        break;

      case "link":
        let expires;
        switch (durationUnits) {
          case "hours":
            expires = duration * 60 * 60;
            break;
          case "days":
            expires = duration * 60 * 60 * 24;
            break;
          case "weeks":
            expires = duration * 60 * 60 * 24 * 7;
            break;
          default:
            expires = 0;
        }
        try {
          const response = await API.api.shareFile({
            type: "link",
            id: file?.id || "0195A1C4CECF778288E548881A2CB1B0",
            expires: Math.round(expires),
            password: password || null,
            edit: permission === "editor"
          });

          if (!response.ok) throw response.error;
          let linkData = await response.json();
          linkData.createdAt = new Date(linkData.createdAt);
          linkData.modifiedAt = new Date(linkData.modifiedAt);
          linkData.id = linkData.linkId;
          setFields({ ...fields, links: { ...fields.links, [linkData.id]: linkData } })
        } catch (error) {
          showError("Error sharing file. Please try again.", error);
        }
        break;
    }

  };

  // Handle Copying a Link
  const handleCopyLink = (linkId: string) => {
    const linkToShare = `${window.location.protocol}//${window.location.host}/share?linkId=${linkId}`; // Replace with dynamic link generation if needed
    navigator.clipboard.writeText(linkToShare).then(
      () => setCopyToast(true),
      (err) => showError("Failed to copy link. Please try again.", err)
    );
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <Box display="flex" alignItems="center" justifyContent="center" p={2}>
        <DialogTitle sx={{ padding: 0, textAlign: "center" }}>📁 File Sharing</DialogTitle>
        <IconButton sx={{ marginLeft: "auto" }} onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent dividers>
        <Tabs value={tab} onChange={(_, e) => setTab(e)} variant="fullWidth">
          <Tab icon={<AccountCircle />} label="Users" />
          <Tab icon={<Link />} label="Links" />
        </Tabs>

        {tab == 0 && (
          <>
            <Box mt={3} display="flex" flexWrap="wrap" alignItems="center" gap={2}>
              <Autocomplete
                freeSolo
                autoHighlight
                value={username}
                options={autocompleteOptions}
                getOptionLabel={(option) => {
                  if (typeof option === "string") {
                    return option;
                  } else {
                    return option.username;
                  }
                }}
                onChange={(e, value) => handleUsernameChange(e, value ?? "")}
                sx={{ flexGrow: 1, minWidth: 200 }}
                slotProps={{ listbox: { sx: { maxHeight: 200, overflow: "auto" } } }}
                renderOption={(props, option) => {
                  const { key, ...optionProps } = props;
                  return (
                    <Collapse in>
                      <Box
                        key={key}
                        component="li"
                        sx={{ '& > img': { mr: 2, flexShrink: 0 } }}
                        {...optionProps}>
                        <Avatar
                          sx={{ mr: 2 }}
                          src={option.avatarExtension ? `${BASE_URL}/api/avatars/${option.id}.${option.avatarExtension}` : DefaultProfile}
                          alt={`${option.username} avatar`}
                        />
                        {option.username}
                      </Box>
                    </Collapse>
                  )
                }
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Add people or groups..."
                    variant="outlined"
                    onChange={(e) => handleUsernameChange(e, e.target.value)}
                    slotProps={{ htmlInput: { ...params.inputProps, autoComplete: "new-password" } }}
                    fullWidth />)}
              />

              <FormControl variant="outlined" sx={{ width: 150 }}>
                <InputLabel>Permissions</InputLabel>
                <Select label="Permissions"
                  value={permission} onChange={(e) => setPermission(e.target.value)} sx={{ width: 150 }}>
                  <MenuItem value="viewer">Viewer</MenuItem>
                  <MenuItem value="editor">Editor</MenuItem>
                </Select>
              </FormControl>
            </Box>
            {/* People with Access Section above General Access */}
            <Box mt={3} p={2} border="1px solid #ddd" borderRadius="8px" bgcolor="#fafafa">
              <Typography variant="subtitle1">People with access</Typography>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                {/* Left Column: List of Names */}
                <Box mt={1} sx={{ width: "100%" }}>
                  <Stack spacing={2} sx={{ width: "100%", maxHeight: 200, overflow: "auto" }}>
                    {Object.keys(fields.users).length ? (
                      Object.entries(fields.users).map(([_, user]) => (
                        <>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexGrow: 1, minWidth: 0 }}>
                            <Avatar
                              src={user.avatarExtension ? `${BASE_URL}/api/avatars/${user.id}.${user.avatarExtension}` : DefaultProfile}
                              alt={user.username || "Unknown User"}
                              sx={{ width: 40, height: 40 }}
                            />
                            <Box>
                              <Typography noWrap>{user.username || "Unknown User"}</Typography>
                              <Typography variant="body2" color="textSecondary" noWrap>
                                {user.email || "No Email"}
                              </Typography>
                            </Box>
                            <Box sx={{ marginLeft: 'auto' }}>
                              <Select
                                value={user.edit ? "editor" : "viewer"}
                                onChange={(e) => handlePermissionChange(user.id, e.target.value)}
                                sx={{ minWidth: 100 }}
                              >
                                <MenuItem value="viewer">Viewer</MenuItem>
                                <MenuItem value="editor">Editor</MenuItem>
                              </Select>
                              <IconButton onClick={() => handleRevokePermission(user)}>
                                <CloseIcon />
                              </IconButton>
                            </Box>
                          </Box>
                        </>
                      ))
                    ) : (
                      <Typography>This file is not being shared with other users</Typography>
                    )}
                  </Stack>
                </Box>
              </Box>
            </Box>
          </>
        )
        }
        {tab == 1 && (
          <>
            {/* General Access Section */}
            <Box mt={3} p={2} border="1px solid #ddd" borderRadius="8px" bgcolor="#fafafa">
              <Typography variant="subtitle1">General access</Typography>
              <Box display="flex" flexWrap="wrap" alignItems="center" gap={2} mt={2}>
                <TextField
                  label="Password (optional)"
                  type="password"
                  sx={{ flexGrow: 1 }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <FormControl variant="outlined" sx={{ minWidth: 100 }}>
                  <InputLabel>Permissions</InputLabel>
                  <Select
                    label="Permissions"
                    value={anyonePermission}
                    onChange={(e) => setAnyonePermission(e.target.value as "viewer" | "editor")}
                  >
                    <MenuItem value="viewer">Viewer</MenuItem>
                    <MenuItem value="editor">Editor</MenuItem>
                  </Select>
                </FormControl>
              </Box>


              <Typography variant="subtitle1" sx={{ mt: 2 }}>Link Expiration</Typography>
              <Box display="flex" flexWrap="wrap" alignItems="center" gap={2} mt={2}>
                <TextField
                  label="Amount"
                  type="number"
                  sx={{ flexGrow: 1 }}
                  slotProps={{ htmlInput: { min: 1 } }}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  disabled={durationUnits === "never"}
                />
                <FormControl variant="outlined" sx={{ minWidth: 100 }}>
                  <InputLabel>Unit</InputLabel>
                  <Select
                    label="Unit"
                    value={durationUnits}
                    onChange={(e) => setExpiration(e.target.value as typeof availableDurationUnits[number])}
                  >
                    <MenuItem value="never">Never</MenuItem>
                    <MenuItem value="hours">Hours</MenuItem>
                    <MenuItem value="days">Days</MenuItem>
                    <MenuItem value="weeks">Weeks</MenuItem>
                  </Select>
                </FormControl>
                <Button onClick={() => handleShare({ type: "link" })} sx={{ height: "100%" }} variant="contained">
                  Share
                </Button>
              </Box>

            </Box>


            <Box mt={3} p={2} border="1px solid #ddd" borderRadius="8px" bgcolor="#fafafa">
              <Typography variant="subtitle1">Active Links</Typography>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                {/* Left Column: List of Names */}
                <Box>
                  <Stack spacing={2} sx={{ width: "100%" }}>
                    {Object.keys(fields.links).length ? (
                      Object.entries(fields.links).map(([_, link]) => (
                        <>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexGrow: 1, minWidth: 0 }}>
                            <Avatar
                              sx={{ width: 40, height: 40 }}
                            >
                              <Link />
                            </Avatar>
                            <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                              <TextField
                                fullWidth
                                variant="outlined"
                                value={`${window.location.protocol}//${window.location.host}/share?linkId=${link.id}`}
                                slotProps={{
                                  input: {
                                    readOnly: true,
                                    endAdornment: (
                                      <IconButton onClick={() => handleCopyLink(link.id)}>
                                        <ContentCopyIcon />
                                      </IconButton>
                                    ),
                                  }
                                }}
                                sx={{ mt: 1, '& .MuiInputBase-root': { height: 36 } }}
                              />
                              <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
                                Created on: {new Date(link.createdAt).toLocaleTimeString()}
                              </Typography>
                            </Box>
                            <TextField
                              fullWidth
                              variant="outlined"
                              label="Update Password"
                              type="password"
                              value={link.password || ""}
                              onChange={(e) => handlePasswordChange(link.id, e.target.value)}
                              sx={{ mt: 1, h: 4 }}
                            />
                            <Box sx={{ marginLeft: 'auto', mt: 2 }}>
                              <Select
                                value={link.edit ? "editor" : "viewer"}
                                onChange={(e) => handlePermissionChange(link.id, e.target.value)}
                                sx={{ minWidth: 100 }}
                              >
                                <MenuItem value="viewer">Viewer</MenuItem>
                                <MenuItem value="editor">Editor</MenuItem>
                              </Select>
                              <IconButton onClick={() => handleRevokePermission(link)}>
                                <CloseIcon />
                              </IconButton>
                            </Box>
                          </Box>
                        </>
                      ))
                    ) : (
                      <Typography>This file is not being shared with other users</Typography>
                    )}
                  </Stack>
                </Box>
              </Box>
            </Box>
          </>
        )}

      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </DialogActions>

      <Snackbar
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        open={copyToast}
        onClose={() => setCopyToast(false)}
        message="Link Copied!"
        sx={{ textAlign: "center" }}
        action={(<IconButton size="small" onClick={() => setCopyToast(false)}><CloseIcon fontSize="small" /></IconButton>)}
      />
    </Dialog >
  );
};

export default ShareModal;
