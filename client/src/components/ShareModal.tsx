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
  CircularProgress,
  ListItem,
  Paper,
  Divider,
  InputAdornment,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import {
  AccountCircle,
  Add,
  ContentCopy,
  Delete,
  Link,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import { FileMetadata, PublicUser, ShareLink } from "../types";
import { PublicUser as ApiPublicUser, SessionUser } from "../myApi";
import {
  bufferToBase64,
  importPublicKey,
  shareFileKey,
} from "../cryptoFunctions";
import DefaultProfile from "/default-profile.webp";
import { API, BASE_URL } from "../utils";
import { useErrorToast } from "./ErrorToastProvider";
import { ShareResponse } from "../myApi";

interface ShareModalProps {
  open: boolean;
  file?: FileMetadata;
  currentUser?: SessionUser;
  onClose: () => void;
}

const ShareModal: React.FC<ShareModalProps> = ({
  open,
  onClose,
  currentUser,
  file,
}) => {
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  useEffect(() => {
    async function exportKey() {
      if (!file?.key) return;
      setEncryptionKey(
        bufferToBase64(await crypto.subtle.exportKey("raw", file.key)),
      );
    }
    exportKey();
  }, [file]);
  const [username, setUsername] = useState("");
  const [autocompleteOptions, setAutocompleteOptions] = useState<
    ApiPublicUser[]
  >([]);
  const [permission, setPermission] = useState("viewer");
  const [anyonePermission, setAnyonePermission] = useState<"viewer" | "editor">(
    "viewer",
  );
  const [password, setPassword] = useState("");
  const availableDurationUnits = ["never", "hours", "days", "weeks"] as const;
  const [durationUnits, setExpiration] =
    useState<(typeof availableDurationUnits)[number]>("hours");
  const [tab, setTab] = useState<number>(0);
  const [users, setUsers] = useState<Record<string, ApiPublicUser>>({});
  const [fields, setFields] = useState<{
    users: ShareResponse[];
    links: ShareResponse[];
  }>({ users: [], links: [] });
  const [duration, setDuration] = useState<number>(1);
  const [copyToast, setCopyToast] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
  // Update the state management to include the new fields
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [passwordValues, setPasswordValues] = useState<Record<string, string>>(
    {},
  );
  const [passwordEditMode, setPasswordEditMode] = useState<
    Record<string, boolean>
  >({});

  const togglePasswordVisibility = (linkId: string) => {
    setShowPassword((prev) => ({
      ...prev,
      [linkId]: !prev[linkId],
    }));
  };
  // Add a function to toggle password edit mode
  const togglePasswordEditMode = (linkId: string) => {
    setPasswordEditMode((prev) => ({
      ...prev,
      [linkId]: !prev[linkId],
    }));
  };

  const handleLocalPasswordChange = (linkId: string, value: string) => {
    setPasswordValues((prev) => ({
      ...prev,
      [linkId]: value,
    }));
  };

  const { showError } = useErrorToast();

  // Fetch usernames for Autocomplete
  const fetchUsernames = async (query: string) => {
    try {
      const response = await API.api.searchUsers(query, {
        limit: 10,
        offset: 0,
      });
      if (!response.ok) throw response.error;
      const data = response.data;
      setAutocompleteOptions(data.filter((d) => d.id !== currentUser?.id));
    } catch (error) {
      showError("Error fetching usernames.", error);
      setAutocompleteOptions([]);
    }
  };

  // Handle Username Input Change
  const handleUsernameChange = async (
    _: any,
    value: string | ApiPublicUser,
  ) => {
    if (typeof value !== "string") {
      // This is the case where the use selected a value
      const newUser = {
        type: "user",
        ...value,
      } as PublicUser;
      await handleShare(newUser);
      setUsername("");
      await fetchActiveField("users");
      return;
    }
    setUsername(value);
    if (value.length >= 3) {
      await fetchUsernames(value);
    } else {
      setAutocompleteOptions([]);
    }
  };

  const handlePermissionChange = async (
    item: PublicUser | ShareLink,
    newPermission: string,
  ) => {
    try {
      switch (item.type) {
        case "user": {
          const response = await API.api.updateSharePermission({
            type: "user",
            fileId: file!.id!,
            userId: item.id,
            edit: newPermission === "editor",
          });
          if (!response.ok) throw response.error;
          fetchActiveField("users");
          break;
        }
        case "link": {
          const response = await API.api.updateSharePermission({
            type: "link",
            linkId: item.id,
            edit: newPermission === "editor",
            password: null,
          });
          if (!response.ok) throw response.error;
          fetchActiveField("links");
          break;
        }
      }
    } catch (error) {
      showError("Error updating share permissions.", error);
    }
  };

  const handlePasswordChange = async (link: ShareLink, newPassword: string) => {
    try {
      const response = await API.api.updateSharePermission({
        type: "link",
        linkId: link.id,
        password: newPassword,
        edit: link.editPermission,
      });
      if (!response.ok) throw response.error;
      await fetchActiveField("links");
    } catch (error) {
      showError("Error updating link password", error);
    }
  };

  const handleRevokePermission = async (item: PublicUser | ShareLink) => {
    switch (item.type) {
      case "user":
        try {
          const response = await API.api.deleteSharePermission({
            type: "user",
            fileId: file?.id as string,
            userId: item.id,
          });
          if (!response.ok) throw response.error;
          await fetchActiveField("users");
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
            linkId: item.id,
          });
          if (!response.ok) throw response.error;
          await fetchActiveField("links");
        } catch (error) {
          showError(`Failed to revoke permissions for ${item.id}`, error);
        }
    }
  };

  async function fetchActiveField(field: "users" | "links") {
    setLoading(true);
    try {
      let response;
      if (field == "users") {
        response = await API.api.getSharedUsers(file?.id as string);
        if (!response.ok) throw response.error;
        setFields({ ...fields, users: response.data.access });
        setUsers({
          ...users,
          ...response.data.users,
        });
      } else {
        response = await API.api.getSharedLinks(file?.id as string);
        if (!response.ok) throw response.error;
        setFields({ ...fields, links: response.data });
      }
    } catch (error) {
      showError(`Failed to fetch active ${field}`, error);
    } finally {
      setLoading(false);
    }
  }

  // Fetch Shared Files (active links)
  useEffect(() => {
    if (!open) return;
    if (tab == 0) {
      fetchActiveField("users");
    } else {
      fetchActiveField("links");
    }
  }, [open, tab]);

  // Handle Sharing a File
  const handleShare = async (item: PublicUser | { type: "link" }) => {
    if (!file?.id) return;
    switch (item.type) {
      case "user": {
        if (!file?.key) {
          return showError("No decrypted file key");
        }
        const publicKey = await importPublicKey(item.publicKey);
        if (!publicKey) {
          return showError("Error importing user's public key");
        }
        try {
          const response = await API.api.shareFile({
            type: "user",
            id: file.id,
            userId: item.id,
            encryptedKey: bufferToBase64(
              await shareFileKey(file.key, publicKey),
            ),
            edit: permission === "editor",
          });
          if (!response.ok) throw response.error;
        } catch (error) {
          showError("Error sharing file. Please try again.", error);
        }
        break;
      }

      case "link": {
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
            id: file.id,
            expires: Math.round(expires),
            password: password || null,
            edit: permission === "editor",
          });

          if (!response.ok) throw response.error;
          const data: ShareResponse = response.data;
          // This should never happen but typescript complains if
          // I don't write this here
          if (data.type !== "link") return;
          await fetchActiveField("links");
        } catch (error) {
          showError("Error sharing file. Please try again.", error);
        }
        break;
      }
    }
  };

  // Handle Copying a Link
  const handleCopyLink = (linkId: string) => {
    const linkToShare = `${window.location.protocol}//${window.location.host}/share?linkId=${linkId}${encryptionKey ? `#${encryptionKey}` : ""}`; // Replace with dynamic link generation if needed
    navigator.clipboard.writeText(linkToShare).then(
      () => setCopyToast(true),
      (err) => showError("Failed to copy link. Please try again.", err),
    );
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <Box display="flex" alignItems="center" justifyContent="center" p={2}>
        <DialogTitle
          title={file?.name || ""}
          sx={{ padding: 0, overflow: "hidden", maxWidth: "calc(100% - 48px)" }}
          noWrap
        >
          Sharing File{file?.name && `: "${file.name}"`}
        </DialogTitle>
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
            <Box
              mt={3}
              display="flex"
              flexWrap="wrap"
              alignItems="center"
              gap={2}
            >
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
                slotProps={{
                  listbox: { sx: { maxHeight: 200, overflow: "auto" } },
                }}
                renderOption={(props, option) => {
                  const { key, ...optionProps } = props;
                  return (
                    <Collapse in key={key}>
                      <Box
                        component="li"
                        sx={{ "& > img": { mr: 2, flexShrink: 0 } }}
                        {...optionProps}
                      >
                        <Avatar
                          sx={{ mr: 2 }}
                          src={
                            option.avatarExtension
                              ? `${BASE_URL}/api/avatars/${option.id}.${option.avatarExtension}`
                              : DefaultProfile
                          }
                          alt={`${option.username} avatar`}
                        />
                        <Box>
                          <Typography variant="body1">
                            {option.username}
                          </Typography>
                          {option.email && (
                            <Typography variant="body2" color="text.secondary">
                              {option.email}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </Collapse>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Add users..."
                    variant="outlined"
                    onChange={(e) => handleUsernameChange(e, e.target.value)}
                    slotProps={{
                      htmlInput: {
                        ...params.inputProps,
                        autoComplete: "new-password",
                      },
                    }}
                    fullWidth
                  />
                )}
              />

              <FormControl variant="outlined" sx={{ width: 150 }}>
                <InputLabel>Permissions</InputLabel>
                <Select
                  label="Permissions"
                  value={permission}
                  onChange={(e) => setPermission(e.target.value)}
                  sx={{ width: 150 }}
                >
                  <MenuItem value="viewer">Viewer</MenuItem>
                  <MenuItem value="editor">Editor</MenuItem>
                </Select>
              </FormControl>
            </Box>
            {/* People with Access Section above General Access */}
            <Box
              mt={3}
              p={2}
              border="1px solid #ddd"
              borderRadius="8px"
              bgcolor="#fafafa"
            >
              <Typography variant="subtitle1">People with access</Typography>
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
              >
                {/* Left Column: List of Names */}
                <Box mt={1} sx={{ width: "100%" }}>
                  <Stack
                    spacing={2}
                    sx={{ width: "100%", maxHeight: 200, overflow: "auto" }}
                  >
                    {loading ? (
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          minHeight: "100px",
                          width: "100%",
                        }}
                      >
                        <CircularProgress size={40} />
                      </Box>
                    ) : Object.keys(fields.users).length ? (
                      Object.entries(fields.users).map(([id, access]) => {
                        if (access.type !== "user") return;
                        const user: PublicUser = {
                          type: "user",
                          ...users[access.userId],
                        } as PublicUser;
                        return (
                          <Box
                            key={id}
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 2,
                              flexGrow: 1,
                              minWidth: 0,
                            }}
                          >
                            <Avatar
                              src={
                                user.avatarExtension
                                  ? `${BASE_URL}/api/avatars/${user.id}.${user.avatarExtension}`
                                  : DefaultProfile
                              }
                              alt={user.username || "Unknown User"}
                              sx={{ width: 40, height: 40 }}
                            />
                            <Box>
                              <Typography
                                noWrap
                                title={user.username || "Unknown User"}
                              >
                                {user.username || "Unknown User"}
                              </Typography>
                              <Typography
                                variant="body2"
                                color="textSecondary"
                                title={user.email || "No Email"}
                                noWrap
                              >
                                {user.email || "No Email"}
                              </Typography>
                            </Box>
                            <Box sx={{ marginLeft: "auto" }}>
                              <Select
                                value={
                                  access.editPermission ? "editor" : "viewer"
                                }
                                onChange={(e) =>
                                  handlePermissionChange(user, e.target.value)
                                }
                                sx={{ minWidth: 50 }}
                              >
                                <MenuItem value="viewer">Viewer</MenuItem>
                                <MenuItem value="editor">Editor</MenuItem>
                              </Select>
                              <IconButton
                                onClick={() => handleRevokePermission(user)}
                              >
                                <CloseIcon />
                              </IconButton>
                            </Box>
                          </Box>
                        );
                      })
                    ) : (
                      <Typography>
                        This file is not being shared with other users
                      </Typography>
                    )}
                  </Stack>
                </Box>
              </Box>
            </Box>
          </>
        )}
        {tab == 1 && (
          <>
            {/* General Access Section */}
            <Box
              mt={3}
              p={2}
              border="1px solid #ddd"
              borderRadius="8px"
              bgcolor="#fafafa"
            >
              <Typography variant="subtitle1">General access</Typography>
              <Box
                display="flex"
                flexWrap="wrap"
                alignItems="center"
                gap={2}
                mt={2}
              >
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
                    onChange={(e) =>
                      setAnyonePermission(e.target.value as "viewer" | "editor")
                    }
                  >
                    <MenuItem value="viewer">Viewer</MenuItem>
                    <MenuItem value="editor">Editor</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Typography variant="subtitle1" sx={{ mt: 2 }}>
                Link Expiration
              </Typography>
              <Box
                display="flex"
                flexWrap="wrap"
                alignItems="center"
                gap={2}
                mt={2}
              >
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
                    onChange={(e) =>
                      setExpiration(
                        e.target
                          .value as (typeof availableDurationUnits)[number],
                      )
                    }
                  >
                    <MenuItem value="never">Never</MenuItem>
                    <MenuItem value="hours">Hours</MenuItem>
                    <MenuItem value="days">Days</MenuItem>
                    <MenuItem value="weeks">Weeks</MenuItem>
                  </Select>
                </FormControl>
                <Button
                  onClick={() => handleShare({ type: "link" })}
                  sx={{ height: "100%" }}
                  variant="contained"
                >
                  Share
                </Button>
              </Box>
            </Box>

            <Box
              mt={3}
              p={2}
              border="1px solid #ddd"
              borderRadius="8px"
              bgcolor="#fafafa"
            >
              <Typography variant="subtitle1">Active Links</Typography>
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
              >
                {/* Left Column: List of Names */}
                <Box mt={1} sx={{ width: "100%" }}>
                  <Stack
                    spacing={2}
                    sx={{ width: "100%", maxHeight: 200, overflow: "auto" }}
                  >
                    {loading ? (
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          minHeight: "100px",
                          width: "100%",
                        }}
                      >
                        <CircularProgress size={40} />
                      </Box>
                    ) : Object.keys(fields.links).length ? (
                      Object.entries(fields.links).map(([index, access]) => {
                        if (access.type !== "link") return;
                        const link = {
                          ...access,
                          id: access.linkId,
                          createdAt: new Date(access.createdAt),
                          modifiedAt: new Date(access.modifiedAt),
                        } as ShareLink;
                        return (
                          <Paper
                            key={index}
                            elevation={0}
                            sx={{
                              mb: 2,
                              p: 2,
                              border: "1px solid",
                              borderColor: "divider",
                              borderRadius: 1,
                            }}
                          >
                            <ListItem
                              disablePadding
                              sx={{
                                display: "flex",
                                flexDirection: { xs: "column", sm: "row" },
                                alignItems: { xs: "flex-start", sm: "center" },
                                p: 0,
                                gap: 1,
                                mb: 1,
                              }}
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  width: { xs: "100%", sm: "auto" },
                                  flexGrow: 1,
                                }}
                              >
                                <Link color="action" sx={{ mr: 1 }} />
                                <TextField
                                  fullWidth
                                  size="small"
                                  value={`${window.location.protocol}//${window.location.host}/share?linkId=${link.id}${encryptionKey ? `#${encryptionKey}` : ""}`}
                                  slotProps={{
                                    input: {
                                      readOnly: true,
                                    },
                                  }}
                                />
                                <IconButton
                                  onClick={() => handleCopyLink(link.id)}
                                  sx={{ ml: 1 }}
                                >
                                  <ContentCopy fontSize="small" />
                                </IconButton>
                              </Box>
                              <IconButton
                                onClick={() => handleRevokePermission(link)}
                                color="error"
                                sx={{ ml: { xs: 0, sm: 1 } }}
                              >
                                <Delete fontSize="small" />
                              </IconButton>
                            </ListItem>

                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                my: 1,
                              }}
                            >
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Created: {link.createdAt.toLocaleString()}
                              </Typography>

                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                }}
                              >
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  Permission:
                                </Typography>
                                <Select
                                  size="small"
                                  value={
                                    link.editPermission ? "editor" : "viewer"
                                  }
                                  onChange={(e) =>
                                    handlePermissionChange(link, e.target.value)
                                  }
                                  sx={{ minWidth: 100, height: 30 }}
                                >
                                  <MenuItem value="viewer">Viewer</MenuItem>
                                  <MenuItem value="editor">Editor</MenuItem>
                                </Select>
                              </Box>
                            </Box>

                            <Divider sx={{ my: 1 }} />

                            <Box sx={{ mt: 1 }}>
                              {!passwordEditMode[link.id] ? (
                                <Button
                                  variant="text"
                                  size="small"
                                  onClick={() =>
                                    togglePasswordEditMode(link.id)
                                  }
                                  startIcon={
                                    link.passwordProtected ? <Visibility /> : <Add />
                                  }
                                  sx={{ textTransform: "none" }}
                                >
                                  {link.passwordProtected
                                    ? "Change Password"
                                    : "Set Password"}
                                </Button>
                              ) : (
                                <Box
                                  sx={{
                                    display: "flex",
                                    flexDirection: { xs: "column", sm: "row" },
                                    alignItems: {
                                      xs: "flex-start",
                                      sm: "center",
                                    },
                                    gap: 1,
                                  }}
                                >
                                  <TextField
                                    size="small"
                                    label={
                                      link.passwordProtected
                                        ? "Change Password"
                                        : "Set Password"
                                    }
                                    type={
                                      showPassword[link.id]
                                        ? "text"
                                        : "password"
                                    }
                                    value={passwordValues[link.id] || ""}
                                    onChange={(e) =>
                                      handleLocalPasswordChange(
                                        link.id,
                                        e.target.value,
                                      )
                                    }
                                    placeholder={
                                      link.passwordProtected
                                        ? "••••••••"
                                        : "Enter password"
                                    }
                                    sx={{ flexGrow: 1 }}
                                    autoFocus
                                    InputProps={{
                                      endAdornment: (
                                        <InputAdornment position="end">
                                          <IconButton
                                            onClick={() =>
                                              togglePasswordVisibility(link.id)
                                            }
                                            edge="end"
                                          >
                                            {showPassword[link.id] ? (
                                              <VisibilityOff />
                                            ) : (
                                              <Visibility />
                                            )}
                                          </IconButton>
                                        </InputAdornment>
                                      ),
                                    }}
                                  />
                                  <Box sx={{ display: "flex", gap: 1 }}>
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      color="primary"
                                      onClick={async () => {
                                        await handlePasswordChange(
                                          link,
                                          passwordValues[link.id],
                                        );
                                        togglePasswordEditMode(link.id);
                                      }}
                                      sx={{ whiteSpace: "nowrap" }}
                                    >
                                      {link.passwordProtected
                                        ? passwordValues[link.id]
                                          ? "Update"
                                          : "Remove"
                                        : "Set"}
                                    </Button>
                                    <Button
                                      variant="text"
                                      size="small"
                                      onClick={() =>
                                        togglePasswordEditMode(link.id)
                                      }
                                      sx={{ whiteSpace: "nowrap" }}
                                    >
                                      Cancel
                                    </Button>
                                  </Box>
                                </Box>
                              )}
                            </Box>
                          </Paper>
                        );
                      })
                    ) : (
                      <Typography>
                        This file is not being shared with other users
                      </Typography>
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
        action={
          <IconButton size="small" onClick={() => setCopyToast(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      />
    </Dialog>
  );
};

export default ShareModal;
