import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography } from "@mui/material";
import { FileMetadata } from "../types";
import { Folder, FolderOff } from "@mui/icons-material";
import { useMemo, useState } from "react";
import { useErrorToast } from "./ErrorToastProvider";
import { API } from "../utils";
import { base64ToArrayBuffer, bufferToBase64, encryptAESKeyWithParentKey } from "../cryptoFunctions";
import { BreadcrumbsNavigation } from "./BreadcrumbsNavigation";
import { handleNavigate } from "../pages/FileExplorer";

interface FileMoveModalProps {
  file?: FileMetadata;
  onClose: () => void;
  onMove: (targetFolderId: string | null) => void;
  onChangeDirectory: (folderId: string | null) => Promise<void>;
  files: Record<string, FileMetadata>;
  root: string[];
  dirStack: FileMetadata[];
  userPublicKey: CryptoKey | null;
}

export default function FileMoveModal({ file, onClose, onMove, onChangeDirectory, files, root, dirStack, userPublicKey }: FileMoveModalProps) {
  const [currentMoveFolder, setCurrentMoveFolder] = useState<string | null>(file?.parentId ?? null);
  const [loading, setLoading] = useState<boolean>(false);
  // We want to keep track of the directory stack so that we can display a breadcrumbs
  // menu later on to the user for faster navigation.
  const [moveDirStack, setMoveDirStack] = useState<FileMetadata[]>(dirStack);
  // Filter subfolders at the current navigation level, excluding the folder being moved.
  const subFolders = useMemo(() => (currentMoveFolder ? files[currentMoveFolder]?.children ?? [] : root).map((fileId) => files[fileId]).filter(
    (f) =>
      f.isDirectory &&
      f.id !== file?.id
  ), [currentMoveFolder, files])

  const { showError } = useErrorToast();

  /** Move a file to a new parent using the modal interface. */
  async function handleMove(targetFolderId: string | null) {
    if (!file) {
      showError("Cannot move undefined file!");
      return;
    }
    try {
      const targetFolder = targetFolderId ? files[targetFolderId] : null;
      let parentKey;
      let algorithm;
      if (targetFolder) {
        parentKey = targetFolder.key;
        algorithm = { name: "AES-GCM", iv: base64ToArrayBuffer(file.nonce) };
      } else if (targetFolder === null) {
        parentKey = userPublicKey;
        algorithm = { name: "RSA-OAEP" };
      } else {
        showError("Unable to locate target folder in file hierarchy. Please try again later.");
        return;
      }
      if (!file.key) {
        showError("Unable to find the encryption key of the target file. Please try again later.");
        return;
      }
      if (!parentKey) {
        showError("Unable to find the parent key for the target folder. Please try again later.");
        return;
      }

      const res = await API.api.updateFile(file.id, {
        type: "move",
        parentId: targetFolderId, // The new parent folder ID
        encryptedKey: bufferToBase64(await encryptAESKeyWithParentKey(parentKey, file.key, algorithm))
      });

      if (!res.ok) throw res.error;
      onMove(targetFolderId);
    }
    catch (err) {
      showError("Error moving file.", err);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      keepMounted
      transitionDuration={0}
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            width: 450,
            maxWidth: "90%",
          },
        }
      }}
    >
      <DialogTitle>Moving {file?.name ? `"${file.name}"` : "Encrypted file"}</DialogTitle>

      <DialogContent dividers>
        <BreadcrumbsNavigation
          loading={loading}
          path={moveDirStack.map(f => f.name ?? "Encrypted Directory")}
          onNavigate={async (index) => {
            setLoading(true)
            try {
              const [tempStack, newCurrentFolderId] = handleNavigate(index, moveDirStack);
              setCurrentMoveFolder(newCurrentFolderId);
              setMoveDirStack(tempStack);
              await onChangeDirectory(newCurrentFolderId);
            } finally {
              setLoading(false);
            }
          }} />

        {loading ? (
          <Box sx={{ display: 'flex' }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {subFolders.length === 0 ? (
              <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", py: 3 }}>
                <FolderOff sx={{ fontSize: 42 }} />
                <Typography variant="body1">{"No directories found"}</Typography>
              </Box>
            ) : (
              <List>
                {subFolders.map((folder) => (
                  <ListItem key={folder.id} disablePadding>
                    <ListItemButton onClick={async () => {
                      setLoading(true);
                      try {
                        await onChangeDirectory(folder.id);
                        setCurrentMoveFolder(folder.id);
                        setMoveDirStack([...moveDirStack, files[folder.id]!]);
                      } finally {
                        setLoading(false);
                      }
                    }}>
                      <ListItemIcon>
                        <Folder />
                      </ListItemIcon>
                      <ListItemText primary={folder?.name || "Untitled Folder"} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button disabled={currentMoveFolder === (file?.parentId ?? null)} variant="contained" onClick={async () => await handleMove(currentMoveFolder)}>
          Move Here
        </Button>
      </DialogActions>
    </Dialog >
  );
}
