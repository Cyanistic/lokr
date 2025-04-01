import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  TextField,
  Autocomplete,
  InputAdornment,
  Typography,
  IconButton,
  Button,
  Menu,
  MenuItem,
  Paper,
  SvgIcon,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import FolderIcon from "@mui/icons-material/Folder";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { FileMetadata } from "../types";
import { getFileIcon } from "../pages/FileExplorer";
import Fuse from "fuse.js";

interface FileSearchProps {
  files: Record<string, FileMetadata>;
  loading: boolean;
  onNavigateToPath: (path?: string | null) => void;
  onOpen?: () => void;
  onFileSelected?: (file: FileMetadata) => void;
}

export default function FileSearch({
  files,
  onNavigateToPath,
  onOpen,
  onFileSelected,
}: FileSearchProps) {
  const fuse = useRef<Fuse<FileMetadata>>(new Fuse([]));
  const [filteredFiles, setFilteredFiles] = useState<FileMetadata[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const [_selectedFileId, setSelectedFileId] = useState<string | null>(null);

  useEffect(() => {
    fuse.current = new Fuse(Object.values(files), {
      keys: ["name", "mimeType"],
      minMatchCharLength: 1,
    });
  }, [files]);

  useEffect(() => {
    if (!inputValue) {
      const items = Object.values(files);
      items.sort((a, b) =>
        (a.name ?? "encryptedFile").localeCompare(b.name ?? "encryptedFile"),
      );
      setFilteredFiles(items);
    } else {
      const items = fuse.current.search(inputValue);
      setFilteredFiles(items.map(({ item }) => item));
    }
  }, [files, inputValue]);

  useEffect(() => {
    if (open && onOpen) {
      onOpen();
    }
  }, [open]);

  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    fileId: string,
  ) => {
    event.stopPropagation(); // Prevent the autocomplete item from being selected
    setMenuAnchorEl(event.currentTarget);
    setSelectedFileId(fileId);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setSelectedFileId(null);
  };

  const handleJumpToFolder = (
    event: React.MouseEvent<HTMLElement>,
    path?: string | null,
  ) => {
    event.stopPropagation(); // Prevent the autocomplete item from being selected
    onNavigateToPath(path);
    setOpen(false);
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Autocomplete
        id="file-search-autocomplete"
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        inputValue={inputValue}
        onChange={(_event, newValue) => {
          if (newValue && onFileSelected) {
            onFileSelected(newValue);
          }
        }}
        onInputChange={(_event, newInputValue, reason) => {
          if (reason === "selectOption" || reason === "reset") {
            setInputValue("");
          } else {
            setInputValue(newInputValue);
          }
        }}
        options={filteredFiles}
        getOptionLabel={(option) => option.name || option.encryptedFileName}
        noOptionsText="No files found"
        fullWidth
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Search files..."
            variant="outlined"
            slotProps={{
              input: {
                ...params.InputProps,
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
            }}
          />
        )}
        renderOption={({ key, ...props }, option) => (
          <li
            {...props}
            key={`${option.id}-autocomplete`}
            style={{ padding: 0 }}
          >
            <Box
              sx={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                p: 1.5,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  flex: 1,
                }}
              >
                <SvgIcon>{getFileIcon(option.mimeType)}</SvgIcon>
                <Box>
                  <Typography variant="body1">{option.name}</Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontSize: "0.75rem" }}
                  >
                    {/* TODO: Add path functionality */}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Button
                  size="small"
                  startIcon={<FolderIcon fontSize="small" />}
                  onClick={(e) => handleJumpToFolder(e, option.parentId)}
                  sx={{ fontSize: "0.75rem" }}
                >
                  Jump to Folder
                </Button>
                <IconButton
                  size="small"
                  onClick={(e) => handleMenuOpen(e, option.id)}
                  aria-label="more options"
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          </li>
        )}
        slots={{
          paper: (props) => (
            <Paper
              elevation={8}
              {...props}
              sx={{
                ...props.sx,
                borderRadius: "8px",
                mt: 1,
                maxHeight: "60vh",
                overflowY: "auto",
              }}
            />
          ),
        }}
      />

      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleMenuClose}>Open</MenuItem>
        <MenuItem onClick={handleMenuClose}>Download</MenuItem>
        <MenuItem onClick={handleMenuClose}>Share</MenuItem>
        <MenuItem onClick={handleMenuClose}>Rename</MenuItem>
        <MenuItem onClick={handleMenuClose}>Delete</MenuItem>
      </Menu>
    </Box>
  );
}
