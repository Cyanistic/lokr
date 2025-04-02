import type React from "react";

import { useEffect, useRef, useState } from "react";
import { useWindowSize } from "./hooks/useWindowSize";

import {
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Fab,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import FolderIcon from "@mui/icons-material/Folder";
import DeleteIcon from "@mui/icons-material/Delete";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import { ChevronLeft, Logout, Settings } from "@mui/icons-material";
import DefaultProfile from "/default-profile.webp";
import { BASE_URL, formatBytes, logout } from "../utils";
import { SessionUser } from "../myApi";
import { Link } from "react-router-dom";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";

interface SidebarProps {
  user?: SessionUser;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  onCreateFolder: (name: string) => Promise<void>;
  current: "files" | "shared" | "link";
  editor?: boolean;
}

export function FileSidebar({
  user,
  collapsed,
  setCollapsed,
  onCreateFolder,
  current,
  editor,
}: SidebarProps) {
  const { width } = useWindowSize();
  const isMobile = width < 768;
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Used for keeping query params across page navigations
  const searchParams = new URLSearchParams(location.search);
  const viewParam = searchParams.get("view");

  // New folder dialog state
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // New folder dialog handlers
  const handleOpenNewFolderDialog = () => {
    setNewFolderName("");
    setNewFolderDialogOpen(true);
  };

  const handleCloseNewFolderDialog = () => {
    setNewFolderDialogOpen(false);
  };

  const handleNewFolderNameChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setNewFolderName(event.target.value);
  };

  const handleCreateFolder = async () => {
    await onCreateFolder(newFolderName.trim());
    handleCloseNewFolderDialog();
  };

  const navItems = [
    { icon: FolderIcon, label: "My Files", link: "/files" },
    { icon: PeopleAltIcon, label: "Shared with me", link: "/shared" },
    { icon: DeleteIcon, label: "Trash", link: "/recent" },
  ];

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  // Handle click outside to close sidebar on mobile
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isMobile &&
        !collapsed &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        setCollapsed(true);
      }
    }

    // Add event listener only when sidebar is open on mobile
    if (isMobile && !collapsed) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMobile, collapsed, setCollapsed]);

  return (
    <>
      {/* Overlay for mobile when sidebar is open */}
      {isMobile && !collapsed && (
        <Box
          onClick={() => setCollapsed(true)}
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: "rgba(0, 0, 0, 0.5)",
            zIndex: 10,
            transition: "opacity 0.3s ease",
          }}
        />
      )}
      <Box
        ref={sidebarRef}
        sx={{
          position: "fixed",
          top: 0,
          bottom: 0,
          left: 0,
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          transition: "all 0.3s ease",
          width: collapsed ? "70px" : "250px",
          transform:
            isMobile && collapsed ? "translateX(-100%)" : "translateX(0)",
          boxShadow:
            isMobile && !collapsed ? "0 4px 20px rgba(0,0,0,0.15)" : "none",
          borderRadius: collapsed ? "0" : "0 24px 24px 0",
        }}
      >
        <Box
          sx={{
            display: "flex",
            height: "64px",
            alignItems: "center",
            justifyContent: "space-between",
            transition: "all 0.3s ease",
            borderBottom: "1px solid",
            borderColor: "divider",
            px: 2,
          }}
        >
          {!collapsed && (
            <>
              <Typography variant="h5" sx={{ fontWeight: 700, ml: 10 }}>
                Lokr
              </Typography>
            </>
          )}
          <IconButton
            onClick={() => setCollapsed(!collapsed)}
            sx={{ ml: collapsed ? "auto" : 0 }}
          >
            <ChevronLeft
              sx={{
                height: 20,
                width: 20,
                transition: "transform 0.3s ease",
                transform: collapsed ? "rotate(180deg)" : "none",
              }}
            />
          </IconButton>
        </Box>

        <Box sx={{ flexGrow: 1, overflow: "auto", py: 2 }}>
          <List sx={{ px: 1 }}>
            {/* New Folder Button */}
            <Box
              sx={{
                pb: 2,
                display: "flex",
                justifyContent: "center",
                px: 1,
                width: "100%",
              }}
            >
              {collapsed ? (
                <Tooltip
                  title={
                    !editor && current !== "files"
                      ? "You don't have permission to create folders here"
                      : "New Folder"
                  }
                >
                  <span>
                    <Fab
                      color="primary"
                      size="small"
                      onClick={handleOpenNewFolderDialog}
                      sx={{ boxShadow: 2 }}
                      disabled={!editor && current !== "files"}
                    >
                      <CreateNewFolderIcon sx={{ fontSize: 20 }} />
                    </Fab>
                  </span>
                </Tooltip>
              ) : (
                <Tooltip
                  title={
                    !editor && current !== "files"
                      ? "You don't have permission to create folders here"
                      : ""
                  }
                >
                  <span style={{ width: "100%" }}>
                    <Button
                      variant="contained"
                      startIcon={<CreateNewFolderIcon sx={{ fontSize: 18 }} />}
                      onClick={handleOpenNewFolderDialog}
                      fullWidth
                      sx={{
                        boxShadow: 2,
                        textTransform: "none",
                        fontWeight: 500,
                      }}
                      disabled={!editor && current !== "files"}
                    >
                      New Folder
                    </Button>
                  </span>
                </Tooltip>
              )}
            </Box>
            {navItems.map((item, index) => (
              <Link
                key={index}
                to={`${item.link}${viewParam ? `?view=${viewParam}` : ""}`}
              >
                <ListItem disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    sx={{
                      borderRadius: 1,
                      bgcolor: item.link.endsWith(current)
                        ? "action.selected"
                        : "transparent",
                      justifyContent: collapsed ? "center" : "flex-start",
                      px: collapsed ? 1 : 2,
                      py: 1,
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: collapsed ? 0 : 36,
                        color: item.link.endsWith(current)
                          ? "primary.main"
                          : "text.secondary",
                        mr: collapsed ? 0 : 1,
                      }}
                    >
                      <item.icon style={{ height: 20, width: 20 }} />
                    </ListItemIcon>
                    {!collapsed && (
                      <ListItemText
                        primary={item.label}
                        sx={{
                          m: 0,
                          "& .MuiTypography-root": {
                            fontWeight: item.link.endsWith(current) ? 500 : 400,
                          },
                        }}
                      />
                    )}
                  </ListItemButton>
                </ListItem>
              </Link>
            ))}
          </List>
        </Box>
        <Divider sx={{ my: 2 }} />

        <Box sx={{ px: 2, pb: 2 }}>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              mb: 1,
              px: 1,
              color: "text.secondary",
              fontWeight: 600,
              visibility: collapsed ? "hidden" : "visible",
            }}
          >
            Storage
          </Typography>
          <Box
            sx={{
              px: 1,
              mb: 1,
              visibility: collapsed ? "hidden" : "visible",
            }}
          >
            {user && (
              <>
                <Box
                  sx={{
                    mb: 0.5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "0.75rem",
                  }}
                >
                  <Typography variant="caption">{`${Math.trunc((user.usedSpace / user.totalSpace) * 100)}% used`}</Typography>
                  <Typography variant="caption">{`${formatBytes(user.usedSpace)} / ${formatBytes(user.totalSpace)}`}</Typography>
                </Box>
                <Box
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    bgcolor: "action.hover",
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      height: "100%",
                      width: `${(user.usedSpace / user.totalSpace) * 100}%`,
                      borderRadius: 4,
                      bgcolor: "primary.main",
                    }}
                  />
                </Box>
              </>
            )}
          </Box>
        </Box>

        <Box
          sx={{
            borderTop: "1px solid",
            borderColor: "divider",
            p: 2,
          }}
        >
          <Button
            variant="text"
            fullWidth
            onClick={handleOpenMenu}
            sx={{
              justifyContent: "flex-start",
              p: 1,
              textTransform: "none",
              color: "text.primary",
            }}
          >
            {user && (
              <>
                <Avatar
                  src={
                    user.avatarExtension
                      ? `${BASE_URL}/api/avatars/${user.id}.${user.avatarExtension}`
                      : DefaultProfile
                  }
                  alt={user.username}
                  sx={{ width: 32, height: 32 }}
                >
                  {user.username}
                </Avatar>
                {!collapsed && (
                  <Box sx={{ ml: 1, textAlign: "left" }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {user.username}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {user.email}
                    </Typography>
                  </Box>
                )}
              </>
            )}
          </Button>
          <Menu
            anchorEl={anchorEl}
            open={open}
            onClose={handleCloseMenu}
            anchorOrigin={{
              vertical: "top",
              horizontal: "right",
            }}
            transformOrigin={{
              vertical: "bottom",
              horizontal: "right",
            }}
          >
            <MenuItem sx={{ py: 1, px: 2 }}>
              <Typography variant="subtitle2">My Account</Typography>
            </MenuItem>
            <Divider />
            <Link to="/profile">
              <MenuItem onClick={handleCloseMenu}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <AccountCircleIcon style={{ height: 16, width: 16 }} />
                </ListItemIcon>
                <Typography variant="body2">Profile</Typography>
              </MenuItem>
            </Link>
            <MenuItem onClick={handleCloseMenu}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Settings style={{ height: 16, width: 16 }} />
              </ListItemIcon>
              <Typography variant="body2">Preferences</Typography>
            </MenuItem>
            <Divider />
            <Link
              to="/home"
              onClick={async (e) => {
                if (!(await logout())) {
                  e.preventDefault();
                }
              }}
            >
              <MenuItem onClick={handleCloseMenu}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Logout style={{ height: 16, width: 16 }} />
                </ListItemIcon>
                <Typography variant="body2">Log out</Typography>
              </MenuItem>
            </Link>
          </Menu>
        </Box>
      </Box>

      {/* New Folder Dialog */}
      <Dialog
        open={newFolderDialogOpen}
        onClose={handleCloseNewFolderDialog}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Create New Folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            id="folderName"
            label="Folder Name"
            type="text"
            fullWidth
            variant="outlined"
            value={newFolderName}
            onChange={handleNewFolderNameChange}
            sx={{ mt: 1 }}
            onKeyDown={async (event) => {
              if (event.key === "Enter" && newFolderName.trim()) {
                handleCreateFolder();
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseNewFolderDialog} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleCreateFolder}
            variant="contained"
            color="primary"
            disabled={!newFolderName.trim()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
