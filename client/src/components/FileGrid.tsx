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
import { Visibility, FolderOff } from "@mui/icons-material";
import { FileContextMenu } from "./FileMenu";
import { getFileIcon } from "../pages/FileExplorer";
import { useTheme } from "@emotion/react";
import { useMemo, useState, useRef, useCallback } from "react";
import { PublicUser } from "../myApi";
import FileGridPreviewAttachment from "./FileGridPreview";
import { FixedSizeGrid } from "react-window";

interface FileGridViewProps {
  files: FileMetadata[];
  users: Record<string, PublicUser>;
  onNavigate: (fileId: string) => void;
  onAction: (action: string, fileId: string) => void;
  loading?: boolean;
  owner: boolean;
  onPreviewLoad?: (fileId: string, blobUrl?: string) => void; // Optional callback for preview load
}

export function FileGridView({
  files,
  onNavigate,
  onAction,
  owner,
  loading = false,
  onPreviewLoad,
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

  const gridRef = useRef<HTMLDivElement>(null);
  const [gridDimensions, setGridDimensions] = useState({
    width: 0,
    height: 0,
  });

  // Calculate number of columns based on screen size
  const columnCount = useMemo(() => {
    if (gridDimensions.width < 600) return 2;
    if (gridDimensions.width < 900) return 3;
    if (gridDimensions.width < 1100) return 4;
    if (gridDimensions.width < 1600) return 6;
    return 6;
  }, [gridDimensions.width]);

  // Calculate cell dimensions based on grid width and columns
  const cellWidth = useMemo(() => {
    // Account for padding and gap between items
    const padding = 32; // 16px padding on each side (left and right)
    const gap = 16 * (columnCount - 1); // 16px gap between columns
    const availableWidth = gridDimensions.width - padding - gap;
    return Math.floor(availableWidth / columnCount);
  }, [gridDimensions.width, columnCount]);

  // Cell height is equal to cell width for square cells
  const cellHeight = cellWidth;

  // Calculate row count based on number of files and columns
  const rowCount = useMemo(() => {
    return Math.ceil(files.length / columnCount);
  }, [files.length, columnCount]);

  // Update grid dimensions when container size changes
  const gridRefCallback = useCallback((node: HTMLDivElement) => {
    gridRef.current = node;
    if (!gridRef.current) return;

    const updateDimensions = () => {
      if (gridRef.current) {
        setGridDimensions({
          width: gridRef.current.offsetWidth,
          height: gridRef.current.offsetHeight,
        });
      }
    };

    // Initial size update
    updateDimensions();

    // Set up resize observer to update on resize
    const resizeObserver = new ResizeObserver(updateDimensions);

    resizeObserver.observe(gridRef.current);

    // Clean up
    return () => {
      if (gridRef.current) {
        resizeObserver.unobserve(gridRef.current);
      }
    };
  }, []);

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

  // If no files to display, show a message
  if (files.length === 0 && !loading) {
    return (
      <Box
        sx={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          p: 2,
          borderRadius: 1,
        }}
      >
        <FolderOff sx={{ fontSize: 64, mb: 2, color: "text.secondary" }} />
        <Typography variant="h6" color="text.secondary">
          No files found
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1, textAlign: "center" }}
        >
          {owner
            ? "Upload a file to get started"
            : "No files have been shared with you yet"}
        </Typography>
      </Box>
    );
  }
  // Cell renderer function for FixedSizeGrid
  const Cell = ({
    columnIndex,
    rowIndex,
    style,
  }: {
    columnIndex: number;
    rowIndex: number;
    style: React.CSSProperties;
  }) => {
    const index = rowIndex * columnCount + columnIndex;

    // Return empty cell if index is out of bounds
    if (index >= files.length) {
      return null;
    }

    const file = files[index];

    return (
      <div
        style={{
          ...style,
          padding: 8, // Add padding inside the cell
        }}
      >
        <Box
          sx={{
            height: "100%",
          }}
          onContextMenu={(event) => handleContextMenu(event, file)}
        >
          <FileGridItem
            file={file}
            onNavigate={onNavigate}
            onAction={onAction}
            owner={owner}
            onContextMenu={(event) => handleContextMenu(event, file)}
            onPreviewLoad={(blobUrl) => onPreviewLoad?.(file.id, blobUrl)}
          />
        </Box>
      </div>
    );
  };

  return (
    <Box
      ref={gridRefCallback}
      sx={{
        height: "100%",
        flexGrow: 1,
        pl: 1, // Horizontal padding (left and right)
        pb: 1, // Bottom padding
        borderRadius: 1,
      }}
    >
      {gridDimensions.width > 0 && gridDimensions.height > 0 && (
        <FixedSizeGrid
          columnCount={columnCount}
          columnWidth={cellWidth + 16} // Add padding for spacing
          height={gridDimensions.height}
          rowCount={rowCount}
          rowHeight={cellHeight + 16} // Add padding for spacing
          width={gridDimensions.width}
          itemData={files}
          overscanRowCount={5}
        >
          {Cell}
        </FixedSizeGrid>
      )}

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
  onPreviewLoad?: (blobUrl?: string) => void; // Optional callback for preview load
}

function FileGridItem({
  file,
  onNavigate,
  onAction,
  owner,
  onContextMenu,
  onPreviewLoad,
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
          <FileGridPreviewAttachment
            file={file}
            width={"100%"}
            height={"100%"}
            onLoad={onPreviewLoad}
          />
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
        height: "100%", // Changed from 0 to 100%
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
