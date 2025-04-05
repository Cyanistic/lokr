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
import { getFileIcon, SortByTypes } from "../pages/FileExplorer";
import { useTheme } from "@emotion/react";
import { useMemo, useState } from "react";
import { PublicUser } from "../myApi";
import FileGridPreviewAttachment from "./FileGridPreview";

interface FileGridViewProps {
  files: FileMetadata[];
  users: Record<string, PublicUser>;
  onNavigate: (fileId: string) => void;
  onAction: (action: string, fileId: string) => void;
  loading?: boolean;
  owner: boolean;
  sortBy: SortByTypes;
  sortOrder?: "asc" | "desc"; // Optional, for sorting
}

export function FileGridView({
  files,
  onNavigate,
  onAction,
  owner,
  sortBy,
  sortOrder,
  users,
  loading = false,
}: FileGridViewProps) {
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    fileId: string;
    editor: boolean;
  } | null>(null);

  const handleContextMenu = (event: React.MouseEvent, file: FileMetadata) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      mouseX: event.clientX,
      mouseY: event.clientY,
      fileId: file.id,
      editor: file.editPermission === true,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const sortedFiles = useMemo(() => {
    if (!sortOrder || !sortBy || loading) {
      return [...files];
    }

    const direction = sortOrder === "asc" ? 1 : -1;

    return [...files].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return (
            direction *
            (a.name ?? a.encryptedFileName).localeCompare(
              b.name ?? b.encryptedFileName,
            )
          );

        case "createdAt": {
          const aCreated = a.createdAtDate!.getTime();
          const bCreated = b.createdAtDate!.getTime();
          return direction * (aCreated - bCreated);
        }

        case "modifiedAt": {
          const aModified = a.modifiedAtDate!.getTime();
          const bModified = b.modifiedAtDate!.getTime();
          return direction * (aModified - bModified);
        }

        case "size":
          return direction * ((a.size || 0) - (b.size || 0));

        case "owner":
          return (
            direction *
            (a.ownerId ? users[a.ownerId].username : "Anonymous").localeCompare(
              b.ownerId ? users[b.ownerId].username : "Anonymous",
            )
          );

        case "uploader":
          return (
            direction *
            (a.uploaderId
              ? users[a.uploaderId].username
              : "Anonymous"
            ).localeCompare(
              b.uploaderId ? users[b.uploaderId].username : "Anonymous",
            )
          );

        default:
          return (
            direction *
            (a.name ?? a.encryptedFileName).localeCompare(
              b.name ?? b.encryptedFileName,
            )
          );
      }
    });
  }, [loading, files, sortBy, sortOrder, users]);

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
    <Box
      sx={{ height: "calc(100vh - 180px)", overflowY: "auto", mt: 2, pt: 1 }}
    >
      <Grid container spacing={2}>
        {sortedFiles.map((file, index) => (
          <Grid item xs={6} sm={4} md={3} lg={2} key={file.id}>
            <Box
              sx={{
                opacity: 0,
                animation: `fadeIn 0.6s ease-in-out forwards`,
                animationDelay: `${index * 0.05}s`,
                "@keyframes fadeIn": {
                  "0%": { opacity: 0, transform: "translateY(10px)" },
                  "100%": { opacity: 1, transform: "translateY(0)" },
                },
              }}
              onContextMenu={(event) => handleContextMenu(event, file)}
            >
              <FileGridItem
                file={file}
                onNavigate={onNavigate}
                onAction={onAction}
                owner={owner}
                onContextMenu={(event) => handleContextMenu(event, file)}
              />
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Right-click context menu */}

      {contextMenu && (
        <FileContextMenu
          fileId={contextMenu.fileId}
          onAction={async (action, fileId) => {
            handleCloseContextMenu();
            await onAction(action, fileId);
          }}
          owner={owner}
          editor={contextMenu.editor}
          onClose={handleCloseContextMenu}
          anchorPosition={
            contextMenu !== null
              ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
              : undefined
          }
        />
      )}
    </Box>
  );
}

interface FileGridItemProps {
  file: FileMetadata;
  onNavigate: (fileId: string) => void;
  onAction: (action: string, fileId: string) => void;
  owner: boolean;
  onContextMenu: (event: React.MouseEvent) => void;
}

function FileGridItem({
  file,
  onNavigate,
  onAction,
  owner,
  onContextMenu,
}: FileGridItemProps) {
  const theme = useTheme();

  const handleItemClick = () => {
    onNavigate(file.id);
  };

  // Function to render the appropriate file preview
  const renderFilePreview = () => {
    const isImage = file.mimeType?.startsWith("image/");
    const isVideo = file.mimeType?.startsWith("video/");
    const isPreviewable = isImage || isVideo;
  
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        {isPreviewable ? (
          <FileGridPreviewAttachment file={file} width={"100%"} height={"100%"} />
        ) : (
          getFileIcon(file.mimeType, 64, 64)
        )}
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
      onContextMenu={onContextMenu}
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
