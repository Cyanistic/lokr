import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  useMediaQuery,
  Paper,
  Grid,
  Avatar,
  Divider,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { FileMetadata } from "../types";
import { PublicUser } from "../myApi";
import { BASE_URL, formatBytes } from "../utils";
import theme from "../theme";
import { getFileIcon } from "../pages/FileExplorer";
import { CalendarMonth, SdStorage } from "@mui/icons-material";
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DefaultProfile from "/default-profile.webp";

interface FileInfoModalProps {
  open: boolean;
  file?: FileMetadata;
  users: Record<string, PublicUser>;
  path?: FileMetadata[];
  onClose: () => void;
}

function FileInfoModal({ open, onClose, file, users, path }: FileInfoModalProps) {
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"))
  if (!file) return null
  if (!path) path = [];

  // Get MIME type if not provided
  const mimeType = file.isDirectory ? "Directory" : file.mimeType;

  const owner = file.ownerId ? users[file.ownerId] ?? "Unknown user" : null;
  const uploader = file.uploaderId ? users[file.uploaderId] ?? "Unknown user" : null;
  const filePath = `/${[...path, file].filter(f => f.name).map(f => f.name).join("/")}`

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={isMobile}
      slotProps={{
        paper: {
          sx: {
            borderRadius: isMobile ? 0 : 2,
            overflow: "hidden",
          },
        }
      }}
    >
      {/* Header */}
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          bgcolor: "background.paper",
          borderBottom: "1px solid",
          borderColor: "divider",
          p: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "action.hover",
              borderRadius: 1,
              p: 1,
            }}
          >
            {getFileIcon(file.mimeType)}
          </Box>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 600 }}>
            File Information
          </Typography>
        </Box>
        <IconButton edge="end" onClick={onClose} aria-label="close">
          <CloseIcon style={{ height: 20, width: 20 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {/* File Preview Section */}
        <Box
          sx={{
            bgcolor: "background.default",
            p: 3,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Paper
            elevation={0}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 80,
              height: 80,
              bgcolor: "action.hover",
              borderRadius: 2,
              mb: 2,
            }}
          >
            {getFileIcon(file.mimeType)}
          </Paper>
          <Typography variant="h6" sx={{ fontWeight: 600, textAlign: "center", wordBreak: "break-word" }}>
            {file.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {formatBytes(file.size)}
          </Typography>
        </Box>

        {/* File Details Section */}
        <Box sx={{ p: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
            File Details
          </Typography>

          <Grid container spacing={2}>
            {/* Type */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Box sx={{ color: "text.secondary" }}>
                  <InsertDriveFileIcon style={{ height: 16, width: 16 }} />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Type
                  </Typography>
                  <Typography variant="body2">{mimeType}</Typography>
                </Box>
              </Box>
            </Grid>

            {/* Size */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Box sx={{ color: "text.secondary" }}>
                  <SdStorage style={{ height: 16, width: 16 }} />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Size
                  </Typography>
                  <Typography variant="body2">{formatBytes(file.size)}</Typography>
                </Box>
              </Box>
            </Grid>

            {/* Created */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Box sx={{ color: "text.secondary" }}>
                  <CalendarMonth style={{ height: 16, width: 16 }} />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Created
                  </Typography>
                  <Typography variant="body2">{file.createdAtDate?.toLocaleString()}</Typography>
                </Box>
              </Box>
            </Grid>

            {/* Modified */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Box sx={{ color: "text.secondary" }}>
                  <CalendarMonth style={{ height: 16, width: 16 }} />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Modified
                  </Typography>
                  <Typography variant="body2">{file.modifiedAtDate?.toLocaleString()}</Typography>
                </Box>
              </Box>
            </Grid>

            {/* Location/Path */}
            {filePath && (
              <Grid item xs={12}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Box sx={{ color: "text.secondary" }}>
                    <InsertDriveFileIcon style={{ height: 16, width: 16 }} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Location
                    </Typography>
                    <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                      {filePath}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            )}
          </Grid>

          <Divider sx={{ my: 3 }} />

          {/* People Section */}
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
            People
          </Typography>

          <Grid container spacing={3}>
            {/* Uploader */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Uploaded by
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Avatar
                    src={uploader?.avatarExtension ? `${BASE_URL}/api/avatars/${uploader.id}.${uploader.avatarExtension}` : DefaultProfile}
                    alt={uploader?.username ?? "Anonymous"}
                    sx={{ width: 32, height: 32 }}>
                  </Avatar>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {uploader?.username ?? "Anonymous"}
                    </Typography>
                    {uploader?.email && (
                      <Typography variant="caption" color="text.secondary">
                        {uploader.email}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            </Grid>

            {/* Owner */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Owned by
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Avatar
                    src={owner?.avatarExtension ? `${BASE_URL}/api/avatars/${owner.id}.${owner.avatarExtension}` : DefaultProfile}
                    alt={owner?.username ?? "Anonymous"}
                    sx={{ width: 32, height: 32 }}>
                  </Avatar>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {owner?.username ?? "Anonymous"}
                    </Typography>
                    {owner?.email && (
                      <Typography variant="caption" color="text.secondary">
                        {owner.email}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
    </Dialog>
  )
};

export default FileInfoModal;
