import {
  Box,
  Grid,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Skeleton,
} from "@mui/material";
import { FileMetadata } from "../types";
import { Visibility } from "@mui/icons-material";
import { FileContextMenu } from "./FileMenu";
import { getFileIcon } from "../pages/FileExplorer";
import { useTheme } from "@emotion/react";
import { useMemo } from "react";

interface FileGridViewProps {
  files: FileMetadata[];
  onNavigate: (fileId: string) => void;
  onAction: (action: string, fileId: string) => void;
  loading?: boolean;
  owner: boolean;
}

export function FileGridView({
  files,
  onNavigate,
  onAction,
  owner,
  loading = false,
}: FileGridViewProps) {
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) =>
      (a.name ?? a.encryptedFileName).localeCompare(
        b.name ?? b.encryptedFileName,
      ),
    );
  }, [files]);

  // If loading, render skeleton grid
  if (loading) {
    return (
      <Grid container spacing={2}>
        {Array.from({ length: files.length }).map((_, index) => (
          <Grid item xs={6} sm={4} md={3} lg={2} key={`skeleton-${index}`}>
            <Paper
              elevation={1}
              sx={{
                height: 0,
                paddingBottom: "100%",
                position: "relative",
                overflow: "hidden",
                borderRadius: 1,
                bgcolor: "background.paper",
              }}
            >
              <Skeleton
                variant="rectangular"
                width="100%"
                height="100%"
                sx={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  animation: "pulse 1.5s ease-in-out 0.5s infinite",
                  "@keyframes pulse": {
                    "0%": { opacity: 1 },
                    "50%": { opacity: 0.6 },
                    "100%": { opacity: 1 },
                  },
                }}
              />
              <Box
                sx={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  p: 1,
                }}
              >
                <Skeleton variant="text" width="80%" height={24} />
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>
    );
  }

  return (
    <Box sx={{ height: "calc(100vh - 180px)", overflowY: "auto", mt: 2 }}>
      <Grid container spacing={2}>
        {sortedFiles.map((file) => (
          <Grid item xs={6} sm={4} md={3} lg={2} key={file.id}>
            <FileGridItem
              file={file}
              onNavigate={onNavigate}
              onAction={onAction}
              owner={owner}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

interface FileGridItemProps {
  file: FileMetadata;
  onNavigate: (fileId: string) => void;
  onAction: (action: string, fileId: string) => void;
  owner: boolean;
}

function FileGridItem({
  file,
  onNavigate,
  onAction,
  owner,
}: FileGridItemProps) {
  const theme = useTheme();

  const handleItemClick = () => {
    onNavigate(file.id);
  };

  // Function to render the appropriate file preview
  const renderFilePreview = () => {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        {getFileIcon(file.mimeType, 64, 64)}
      </Box>
    );
  };

  return (
    <Paper
      elevation={1}
      sx={{
        height: 0,
        paddingBottom: "100%",
        position: "relative",
        overflow: "hidden",
        borderRadius: 1,
        cursor: file.isDirectory ? "pointer" : "default",
        transition: "all 0.2s ease-in-out",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: 3,
          "& .file-overlay": {
            opacity: 1,
          },
          "& .file-actions": {
            opacity: 1,
          },
        },
      }}
      onClick={handleItemClick}
    >
      {/* File preview */}
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: "background.paper",
        }}
      >
        {renderFilePreview()}
      </Box>

      {/* Hover overlay for non-folder items */}
      {!file.isDirectory && (
        <Box
          className="file-overlay"
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: "rgba(0, 0, 0, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0,
            transition: "opacity 0.2s ease-in-out",
          }}
        >
          <IconButton
            sx={{
              //@ts-expect-error yes
              bgcolor: theme.palette.background.primary,
            }}
          >
            <Visibility style={{ height: 20, width: 20 }} />
          </IconButton>
        </Box>
      )}

      {/* File info bar */}
      <Box
        sx={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          bgcolor: "background.paper",
          borderTop: "1px solid",
          borderColor: "divider",
          py: 1,
          px: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", overflow: "hidden" }}>
          {getFileIcon(file.mimeType)}
          <Tooltip title={file.name}>
            <Typography
              variant="body2"
              sx={{
                ml: 1,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "calc(100% - 10px)",
              }}
            >
              {file.name}
            </Typography>
          </Tooltip>
        </Box>

        <FileContextMenu
          fileId={file.id}
          onAction={onAction}
          owner={owner}
          editor={file.editPermission === true}
        />
      </Box>

      {/* File metadata on hover */}
      <Box
        className="file-actions"
        sx={{
          position: "absolute",
          bottom: 40,
          left: 0,
          right: 0,
          p: 0.5,
          opacity: 0,
          transition: "opacity 0.2s ease-in-out",
          fontSize: "0.7rem",
          color: "text.secondary",
          display: "flex",
          flexDirection: "column",
        }}
      ></Box>
    </Paper>
  );
}
