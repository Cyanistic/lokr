import { useState, useEffect, useMemo, useRef } from "react";
import Upload from "../components/Upload";
import {
  Folder as FolderIcon,
  ViewModule as ViewModuleIcon,
  ViewList as ViewListIcon,
  Description as DescriptionIcon,
  Image as ImageIcon,
  PictureAsPdf as PictureAsPdfIcon,
  InsertDriveFile as InsertDriveFileIcon,
  TableChart as TableChartIcon,
  Slideshow as SlideshowIcon,
  Archive as ArchiveIcon,
  Code as CodeIcon,
  MusicNote as MusicNoteIcon,
  Movie as MovieIcon,
  ArrowUpward as ArrowUpwardIcon,
} from "@mui/icons-material";
import { API } from "../utils";
import localforage from "localforage";
import {
  importPublicKey,
  deriveKeyFromPassword,
  unwrapPrivateKey,
  unwrapAESKey,
  decryptText,
  encryptText,
  encryptAESKeyWithParentKey,
  generateKey,
  bufferToBase64,
  base64ToArrayBuffer,
  generateNonce,
} from "../cryptoFunctions";
import {
  NavigateOptions,
  URLSearchParamsInit,
  useSearchParams,
} from "react-router-dom";
import { FileMetadata, FileResponse } from "../types";
import { useErrorToast } from "../components/ErrorToastProvider";
import FileSearch from "../components/FileSearch";
import JSZip from "jszip";
import { useThrottledCallback } from "use-debounce";
import FileList from "../components/FileList";
import { PublicUser, SessionUser } from "../myApi";
import { FileSidebar } from "../components/FileSidebar";
import {
  Box,
  Button,
  Collapse,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useWindowSize } from "../components/hooks/useWindowSize";
import { GridMenuIcon } from "@mui/x-data-grid";
import ShareModal from "../components/ShareModal";
import FileInfoModal from "../components/FileInfoModal";
import FileMoveModal from "../components/FileMoveModal";
import { BreadcrumbsNavigation } from "../components/BreadcrumbsNavigation";
import "./FileExplorer.css";
import { FileGridView } from "../components/FileGrid";
import { PasswordModal } from "../components/PasswordModal";
import { DeleteModal } from "../components/DeleteModal";

/** Return an icon based on file extension. */
export function getFileIcon(
  mimeType: string | undefined,
  width?: number,
  height?: number,
) {
  const icons: Record<string, JSX.Element> = {
    "text/plain": <DescriptionIcon style={{ width, height }} />,
    "image/png": <ImageIcon style={{ color: "#D41632", width, height }} />,
    "image/jpeg": <ImageIcon style={{ color: "#D41632", width, height }} />,
    "application/pdf": (
      <PictureAsPdfIcon style={{ color: "#D41632", width, height }} />
    ),
    "application/msword": (
      <InsertDriveFileIcon style={{ color: "blue", width, height }} />
    ),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (
      <InsertDriveFileIcon style={{ width, height }} />
    ),
    "application/vnd.ms-excel": (
      <TableChartIcon style={{ color: "green", width, height }} />
    ),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (
      <TableChartIcon style={{ color: "green", width, height }} />
    ),
    "application/vnd.ms-powerpoint": (
      <SlideshowIcon style={{ color: "orange", width, height }} />
    ),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      <SlideshowIcon style={{ color: "orange", width, height }} />,
    "application/zip": <ArchiveIcon style={{ width, height }} />,
    "application/x-rar-compressed": <ArchiveIcon style={{ width, height }} />,
    "text/html": <CodeIcon style={{ color: "red", width, height }} />,
    "text/css": <CodeIcon style={{ color: "blue", width, height }} />,
    "application/javascript": (
      <CodeIcon style={{ color: "yellow", width, height }} />
    ),
    "application/typescript": (
      <CodeIcon style={{ color: "blue", width, height }} />
    ),
    "audio/mpeg": <MusicNoteIcon style={{ color: "#FF4081", width, height }} />,
    "audio/wav": <MusicNoteIcon style={{ color: "#FF4081", width, height }} />,
    "video/mp4": <MovieIcon style={{ color: "#3F51B5", width, height }} />,
    "video/x-msvideo": (
      <MovieIcon style={{ color: "#3F51B5", width, height }} />
    ),
    "application/json": (
      <CodeIcon style={{ color: "#4CAF50", width, height }} />
    ),
    "application/xml": <CodeIcon style={{ color: "#4CAF50", width, height }} />,
    "application/vnd.oasis.opendocument.text": (
      <InsertDriveFileIcon style={{ color: "#FF5722", width, height }} />
    ),
    "application/vnd.oasis.opendocument.spreadsheet": (
      <TableChartIcon style={{ color: "#FF5722", width, height }} />
    ),
    "application/vnd.oasis.opendocument.presentation": (
      <SlideshowIcon style={{ color: "#FF5722", width, height }} />
    ),
    "application/x-7z-compressed": (
      <ArchiveIcon style={{ color: "#795548", width, height }} />
    ),
    "application/x-tar": (
      <ArchiveIcon style={{ color: "#795548", width, height }} />
    ),
  };
  if (mimeType) {
    return (
      icons[mimeType ?? "text/plain"] || (
        <DescriptionIcon style={{ width, height }} />
      )
    );
  } else {
    return (
      <FolderIcon
        style={{ cursor: "pointer", color: "#81E6D9", width, height }}
      />
    );
  }
}

export function handleNavigate(
  index: number,
  stack: FileMetadata[],
): FileMetadata[] {
  const tempStack = [...stack];
  tempStack.splice(index);
  return tempStack;
}
/** Main FileExplorer Component. */
interface FileExplorerProps {
  type: "files" | "shared" | "link";
}

export type SortByTypes =
  | "name"
  | "size"
  | "createdAt"
  | "modifiedAt"
  | "owner"
  | "uploader";

export default function FileExplorer(
  { type }: FileExplorerProps = { type: "files" },
) {
  const [params, updateParams] = useSearchParams();
  const [currentUser, setCurrentUser] = useState<SessionUser>();
  const preferredView = useRef<"list" | "grid">("list");
  const preferredSortBy = useRef<SortByTypes>("name");
  const parentId = params.get("parentId");
  const view = params.get("view") || preferredView.current;
  const linkId = params.get("linkId");
  const sortBy: SortByTypes =
    (params.get("sortBy") as SortByTypes) || preferredSortBy.current;
  const sortOrder: "asc" | "desc" =
    (params.get("sortOrder") as "asc" | "desc") || "asc";
  // const fileId = params.get("fileId");

  // The list of items in the current directory
  const [files, setFiles] = useState<Record<string, FileMetadata>>({});
  const [users, setUsers] = useState<Record<string, PublicUser>>({});
  const [root, setRoot] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const { showError } = useErrorToast();

  // The user's decrypted private key and public key
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [userPublicKey, setUserPublicKey] = useState<CryptoKey | null>(null);

  const [collapsed, setCollapsed] = useState<boolean>(false);
  // Get window size for responsive design
  const { width } = useWindowSize();
  const isMobile = width < 768;

  const [shareOpen, setShareOpen] = useState<boolean>(false);
  const [infoOpen, setInfoOpen] = useState<boolean>(false);
  const [passwordOpen, setPasswordOpen] = useState<boolean>(false);
  const [deleteOpen, setDeleteOpen] = useState<boolean>(false);
  const selectedFile = useRef<FileMetadata>();
  const [linkPassword, setLinkPasword] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | undefined>(undefined);
  const [linkKey, setLinkKey] = useState<CryptoKey | null>(null);

  useEffect(() => {
    async function importLinkKey() {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      setLinkKey(
        await crypto.subtle.importKey(
          "raw",
          base64ToArrayBuffer(hash),
          {
            name: "AES-GCM",
          },
          true,
          ["decrypt", "encrypt", "wrapKey", "unwrapKey"],
        ),
      );
    }
    importLinkKey();
  }, []);

  // ***** New State for Move Functionality *****
  const [moveOpen, setMoveOpen] = useState(false);

  const [showUpload, setShowUpload] = useState(false);

  // Updating the query params directly completely nukes the url hash, so we need to use
  // this workaround to save the hash and restore it after the params are updated.
  // Issue for context: https://github.com/remix-run/react-router/issues/8393
  // Workaround: https://github.com/remix-run/react-router/issues/8393#issuecomment-2402660908
  function setParams(
    nextInit?:
      | URLSearchParamsInit
      | ((prev: URLSearchParams) => URLSearchParamsInit),
    navigateOpts?: NavigateOptions,
  ): void {
    const currentHash = window.location.hash; // Save hash
    updateParams(nextInit, navigateOpts); // Update query params

    if (currentHash) {
      setTimeout(() => {
        window.location.hash = currentHash; // Restore hash after React updates
      }, 0);
    }
  }

  // Whenever currentDir or privateKey changes, fetch the files
  useEffect(() => {
    if (!privateKey && !linkKey) {
      return;
    }
    fetchFiles();
  }, [parentId, privateKey, linkKey, linkPassword]);

  const currentDir = useMemo(() => {
    if (loading) {
      return [];
    }
    if (parentId) {
      if (files[parentId]) {
        return files[parentId].children?.map((f) => files[f]);
      } else {
        setParams((params) => {
          params.delete("parentId");
          return params;
        });
      }
    } else {
      return [...root].map((f) => files[f]);
    }
  }, [files, parentId, loading]);

  const [dirStack, setDirStack] = useState<FileMetadata[]>([]);

  // Tracks if there is an active download
  const [downloadTarget, setDownloadTarget] = useState<FileMetadata | null>(
    null,
  );

  // Automatically update the parent id if the directory stack changes so that we don't
  // need to manually keep track of both at the same time and risk accidentally cause
  // them to get out of sync.
  useEffect(() => {
    if (loading) return;
    const newParentId = dirStack[dirStack.length - 1]?.id ?? null;
    if (newParentId) {
      setParams((params) => {
        params.set("parentId", newParentId);
        return params;
      });
    } else {
      setParams((params) => {
        params.delete("parentId");
        return params;
      });
    }
  }, [dirStack, loading]);

  /** Download raw data from the server (not decrypted). */
  const handleDownload = async (file: FileMetadata) => {
    try {
      if (file.isDirectory) {
        await fetchFiles({
          depth: 20,
          limit: 1000,
          includeAncestors: false,
          fileId: file.id,
        });
        setDownloadTarget(file);
      } else {
        await downloadFile(file);
      }
    } catch (error) {
      console.error("Error downloading file/folder. Please try again.", error);
    }
  };

  // Use a callback to throttle the fetchFiles function to avoid excessive API calls
  // since this is an expensive operation
  const throttledFetchFiles = useThrottledCallback(() => {
    fetchFiles({
      depth: 20,
      limit: 1000,
      includeAncestors: false,
      updateLoading: false,
    });
  }, 5000);

  /** Download a single file. */
  const downloadFile = async (file: FileMetadata) => {
    if (!file.key) {
      throw new Error("File encryption key not found");
    }
    const response = await API.api.getFile(file.id);
    if (!response.ok) throw response.error;

    // Convert response to a Blob
    const dataBuffer = await response.arrayBuffer();
    if (!file.fileNonce) {
      showError(
        "Unable to decrypt file for downloading. A file nonce was not found.",
      );
      return;
    }
    const fileData = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToArrayBuffer(file.fileNonce) },
      file.key,
      dataBuffer,
    );
    const url = window.URL.createObjectURL(new Blob([fileData]));

    // Create a temporary link to trigger download
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name ?? "download"; // Temporary file name
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  async function downloadFolder(folder: FileMetadata) {
    const zip = new JSZip();
    let fileQueue: string[] | undefined = folder.children;
    const zipFolder = zip.folder(folder.name ?? "folder");
    if (!zipFolder) {
      showError("Failed to create folder in zip");
      return;
    }
    let folderQueue: Record<string, JSZip> = { [folder.id]: zipFolder };

    try {
      while (fileQueue && fileQueue.length > 0) {
        let nextFiles: string[] = [];
        let nextFolders: Record<string, JSZip> = {};

        await Promise.all(
          fileQueue.map(async (fileId) => {
            const f = files[fileId];
            if (!f) return;

            if (f.isDirectory) {
              nextFolders[f.id] = folderQueue[f.parentId!].folder(
                f.name ?? "folder",
              )!;
              if (f.children) {
                nextFiles.push(...f.children);
              }
            } else {
              if (!f?.key) {
                showError(`Failed to find encryption key for ${f.id}`);
                return;
              }
              const response = await API.api.getFile(f.id);
              if (!response.ok) throw response.error;
              const dataBuffer = await response.arrayBuffer();
              if (!f.fileNonce) throw `No file nonce found for ${f.id}`;
              const fileData = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: base64ToArrayBuffer(f.fileNonce) },
                f.key,
                dataBuffer,
              );
              folderQueue[f.parentId!].file(f.name || "file", fileData);
            }
          }),
        );
        fileQueue = nextFiles;
        folderQueue = nextFolders;
      }
    } catch (error) {
      showError("Unable to download folder", error);
    }

    const content = await zip.generateAsync({ type: "blob" });
    const url = window.URL.createObjectURL(content);

    // Create a temporary link to trigger download
    const link = document.createElement("a");
    link.href = url;
    link.download = `${folder.name}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  async function fetchUserProfileAndDecryptKey() {
    try {
      const resp = await API.api.getLoggedInUser();
      if (!resp.ok) {
        console.error("Failed to fetch user profile");
        return;
      }
      const data = resp.data;
      setCurrentUser(data);
      const {
        publicKey,
        encryptedPrivateKey,
        iv,
        salt,
        gridView,
        id,
        email,
        username,
        sortOrder,
      } = data;
      preferredView.current = gridView ? "grid" : "list";
      // Sort order is actually sortBy because I forgot
      // actually to rename it in the backend when I added sorting
      preferredSortBy.current = sortOrder as typeof sortBy;

      await localforage.setItem("userId", id);
      // 1) Import the user's public key
      if (!publicKey) {
        console.error("No public key found in profile");
        return;
      }
      const pubKey = await importPublicKey(publicKey);
      setUserPublicKey(pubKey);
      setUsers({ ...users, [id]: { publicKey, email, id, username } });

      // 2) If we have an encrypted private key, prompt for password
      const storedPrivateKey: CryptoKey | null =
        await localforage.getItem("privateKey");
      if (storedPrivateKey != null) {
        setPrivateKey(storedPrivateKey);
      } else {
        if (encryptedPrivateKey && iv && salt) {
          const pwd = prompt(
            "Enter your password to decrypt your private key:",
          );
          if (!pwd) {
            console.error("No password provided; cannot decrypt private key");
            return;
          }
          // 3) Derive an AES key from password + salt
          const aesKey = await deriveKeyFromPassword(pwd, salt);
          // 4) Unwrap the private key
          const unwrapped = await unwrapPrivateKey(
            encryptedPrivateKey,
            aesKey,
            iv,
          );
          if (!unwrapped) {
            console.error("Failed to unwrap private key");
            return;
          }
          setPrivateKey(unwrapped);
        } else {
          console.error(
            "Missing fields (encryptedPrivateKey, iv, salt) to decrypt private key",
          );
        }
      }
    } catch (err) {
      console.error("Error fetching profile or decrypting key:", err);
    }
  }

  useEffect(() => {
    fetchUserProfileAndDecryptKey();
  }, []);

  async function fetchFiles(
    {
      depth,
      limit,
      offset,
      includeAncestors,
      fileId,
      updateLoading,
    }: {
      depth?: number;
      limit?: number;
      offset?: number;
      includeAncestors?: boolean;
      fileId?: string;
      updateLoading?: boolean;
    } = {
      depth: 1,
      limit: 100,
      offset: 0,
      includeAncestors: true,
      fileId: parentId ?? undefined,
      updateLoading: true,
    },
  ) {
    if (updateLoading) {
      setLoading(true);
    }
    try {
      includeAncestors = includeAncestors ?? true;
      let resp;
      const body = {
        id: fileId,
        depth: depth ?? 1,
        limit: limit ?? 100,
        offset: offset ?? 0,
        includeAncestors: includeAncestors,
      };
      switch (type) {
        case "files":
          resp = await API.api.getFileMetadata(body);
          break;
        case "shared":
          resp = await API.api.getUserSharedFile(body);
          break;
        case "link":
          if (!linkId) {
            showError("Error retrieving files. No link id provided.");
            return;
          }
          resp = await API.api.getLinkSharedFile(
            linkId,
            body,
            linkPassword || "",
          );
          if (resp.status === 401) {
            if (linkPassword) {
              setLinkError("Invalid password!");
            }
            setPasswordOpen(true);
            return;
          }
          setLinkError(undefined);
          setPasswordOpen(false);
          break;
      }
      if (!resp.ok) {
        console.error("Error fetching file metadata:", resp.statusText);
        setLoading(false);
        return;
      }
      const data: FileResponse = await resp.json();
      if (includeAncestors || !fileId) {
        setRoot(new Set(data.root));
      }
      setUsers({ ...users, ...data.users });
      const tempFiles: Record<string, FileMetadata> = {
        ...files,
        ...data.files,
      };
      let queue: string[] = [];
      const stack = [];
      if (data.root.length) {
        queue = data.root;
      } else if (fileId) {
        queue = [fileId];
      } else {
        return;
      }

      // BFS traversal to decrypt files
      let times = 0;
      let found = false;
      while (queue.length > 0) {
        const next: string[] = [];
        await Promise.allSettled(
          queue.map(async (fId) => {
            found ||= fId === parentId;
            const f = tempFiles[fId];
            let unwrapKey: CryptoKey | undefined | null;
            let unwrapAlgorithm;
            let mimeType;
            let key;
            /// Update the permissions of the children
            /// if the current file has edit permissions
            if (f.children) {
              next.push(...f.children);
              for (const child of f.children) {
                tempFiles[child].editPermission ||= f.editPermission;
              }
            }
            if (f.parentId && f.keyNonce) {
              unwrapAlgorithm = {
                name: "AES-GCM",
                iv: base64ToArrayBuffer(f.keyNonce),
              } as AesGcmParams;
              unwrapKey = tempFiles[f.parentId].key;
            } else {
              // If this is a share link and there is no parent id
              // then this is file is encrypted using the key in
              // the link's hash fragment. So we need to skip
              // decrypting the key for this file because
              // we already have it.
              if (type === "link") {
                key = linkKey;
              } else {
                unwrapAlgorithm = { name: "RSA-OAEP" } as RsaOaepParams;
                unwrapKey = privateKey;
              }
              /// Files that are being shared directly should not have edit permission
              /// to be moved or deleted, only their children should have those permissions
              if (f.editPermission) {
                f.editPermission = "children";
              }
            }
            // Only enter this section if we don't have a key
            // (occurs if the current access is not via a link
            // or parent id is not null)
            if (!key) {
              if (!unwrapKey) {
                console.error("Could not get parent key");
                return;
              }
              key = await unwrapAESKey(
                f.encryptedKey,
                unwrapKey,
                unwrapAlgorithm,
              );
            }
            const name = await decryptText(
              f.encryptedFileName,
              key,
              base64ToArrayBuffer(f.nameNonce),
            );
            if (f.encryptedMimeType && f.mimeTypeNonce) {
              mimeType = await decryptText(
                f.encryptedMimeType,
                key,
                base64ToArrayBuffer(f.mimeTypeNonce),
              );
            }
            tempFiles[fId] = {
              ...f,
              name,
              key,
              mimeType,
              createdAtDate: new Date(f.createdAt),
              modifiedAtDate: new Date(f.modifiedAt),
            };
          }),
        );
        if (includeAncestors && !found && parentId) {
          stack.push(tempFiles[queue[0]]);
        }
        times += 1;
        queue = next;
      }
      if (parentId) {
        stack.push(tempFiles[parentId]);
      }
      if (includeAncestors) {
        setDirStack(stack);
      }
      setFiles(tempFiles);
    } catch (err) {
      console.error("Error fetching files:", err);
      setParams((params) => {
        params.delete("parentId");
        return params;
      });
    } finally {
      if (updateLoading) {
        setLoading(false);
      }
    }
  }

  // Whenever the files change, check if we need to download a folder
  useEffect(() => {
    if (loading || !downloadTarget) {
      return;
    }
    try {
      downloadFolder(downloadTarget);
    } finally {
      setDownloadTarget(null);
    }
  }, [files, downloadTarget, loading]);

  /** Directory navigation. */
  const handleOpenFolder = (folder: FileMetadata) => {
    if (folder.isDirectory) {
      setParams((params) => {
        params.set("parentId", folder.id);
        return params;
      });
    }
  };

  async function handleFileAction(action: string, fileId: string) {
    selectedFile.current = files[fileId];
    if (!selectedFile.current) {
      showError("Unexpected error encountered. File not found...", fileId);
      return;
    }
    switch (action) {
      case "delete":
        setDeleteOpen(true);
        break;
      case "info":
        setInfoOpen(true);
        break;
      case "download":
        handleDownload(selectedFile.current);
        break;
      case "rename":
        break;
      case "share":
        setShareOpen(true);
        break;
      case "move":
        setMoveOpen(true);
        break;
      default:
        showError(`Unsupported case encountered in handleAction! ${action}`);
    }
  }

  /** Delete a file/folder. */
  const handleDelete = async (file: FileMetadata) => {
    try {
      const resp = await API.api.deleteFile(file.id);
      if (resp.ok) {
        const newFiles = { ...files };
        delete newFiles[file.id];
        if (file.parentId) {
          newFiles[file.parentId].children = newFiles[
            file.parentId
          ].children?.filter((id) => id != file.id);
        } else {
          root.delete(file.id);
          setRoot(root);
        }
        setFiles(newFiles);
      } else {
        showError("Error deleting file");
      }
    } catch (err) {
      console.error("Error deleting file:", err);
      showError("Error deleting file");
    }
  };

  /** Create a new folder by encrypting the name with the public key. */
  const handleCreateFolder = async (folderName: string) => {
    if (!parentId && type !== "files") {
      showError("You cannot create folders here!");
      return;
    }
    try {
      const aesKey = await generateKey();
      let parentKey: CryptoKey;
      let algorithm: AesGcmParams | RsaOaepParams;
      let keyNonce;
      const nameNonce = generateNonce();
      if (parentId) {
        if (files[parentId].key) {
          parentKey = files[parentId].key;
        } else {
          console.error("Could not find folder parent key");
          return;
        }
        keyNonce = generateNonce();
        algorithm = { name: "AES-GCM", iv: keyNonce };
      } else {
        if (!userPublicKey) {
          showError("User public key not loaded");
          return;
        }
        parentKey = userPublicKey;
        algorithm = { name: "RSA-OAEP" };
      }
      const encryptedName = await encryptText(aesKey, folderName, nameNonce);
      const encryptedNameB64 = btoa(String.fromCharCode(...encryptedName));
      const encryptedKey = bufferToBase64(
        await encryptAESKeyWithParentKey(parentKey, aesKey, algorithm),
      );
      const metadata = {
        name: folderName,
        encryptedFileName: encryptedNameB64,
        encryptedKey: encryptedKey,
        isDirectory: true,
        nameNonce: bufferToBase64(nameNonce),
        keyNonce: keyNonce ? bufferToBase64(keyNonce) : undefined,
        uploaderId: (await localforage.getItem("userId")) || undefined,
        parentId,
      };

      const resp = await API.api.uploadFile({
        metadata,
        linkId: linkId || "",
      });
      if (!resp.ok) throw resp.error;
      fetchFiles();
    } catch (err) {
      console.error("Error creating folder:", err);
      showError("Error creating folder");
    }
  };

  return (
    <>
      <Box
        sx={{
          height: "100%",
          bgcolor: "background.default",
        }}
      >
        <FileSidebar
          current={type}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          user={currentUser}
          onCreateFolder={handleCreateFolder}
          editor={parentId ? Boolean(files[parentId]?.editPermission) : false}
        />
        <Box
          sx={{
            ml: {
              xs: 0,
              sm: collapsed ? "70px" : "250px",
            },
            transition: "margin-left 0.3s ease",
            p: { xs: 2, md: 3 },
          }}
        >
          <Box sx={{ mb: 3 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mb: 2,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center" }}>
                {isMobile && (
                  <IconButton
                    sx={{ mr: 1 }}
                    onClick={() => setCollapsed(!collapsed)}
                  >
                    <GridMenuIcon style={{ height: 20, width: 20 }} />
                  </IconButton>
                )}
                <Typography variant="h5" sx={{ fontWeight: "bold" }}>
                  My Files
                </Typography>
              </Box>
            </Box>
          </Box>
          <div style={styles.controls}>
            <Tooltip
              title={
                !(parentId
                  ? Boolean(files[parentId]?.editPermission)
                  : false) && type !== "files"
                  ? "You do not have permission to upload files here"
                  : "Upload Files"
              }
            >
              <span>
                <Button
                  variant="contained"
                  className="b1"
                  onClick={() => setShowUpload(true)}
                  disabled={
                    !(parentId
                      ? Boolean(files[parentId]?.editPermission)
                      : false) && type !== "files"
                  }
                >
                  Upload File
                </Button>
              </span>
            </Tooltip>
            {showUpload && (
              <Upload
                isOverlay={true}
                parentId={parentId}
                parentKey={parentId ? files[parentId]?.key : null}
                linkId={linkId}
                onUpload={async () => {
                  await fetchFiles();
                }}
                onClose={() => setShowUpload(false)}
              />
            )}
            <Box sx={{ flex: 1, mr: 1 }}>
              <FileSearch
                loading={loading}
                files={files}
                onOpen={throttledFetchFiles}
                onFileSelected={(file) => {
                  if (file.isDirectory) {
                    setParams((params) => {
                      params.set("parentId", file.id);
                      return params;
                    });
                  } else {
                    // TODO: Handle showing file previews here
                  }
                }}
                onNavigateToPath={(path) => {
                  setParams((params) => {
                    if (path) {
                      params.set("parentId", path);
                    } else {
                      params.delete("parentId");
                    }
                    return params;
                  });
                }}
              />
            </Box>

            <Box>
              <ToggleButtonGroup
                value={view}
                exclusive
                onChange={(_, newView) => {
                  if (newView !== null) {
                    setParams((params) => {
                      params.set("view", newView);
                      return params;
                    });
                  }
                }}
                size="small"
                aria-label="view mode"
              >
                <ToggleButton value="list" aria-label="list view">
                  <ViewListIcon />
                </ToggleButton>
                <ToggleButton value="grid" aria-label="grid view">
                  <ViewModuleIcon />
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </div>

          {/* Sort controls row - responsive design */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              mb: 2,
              mt: { xs: -1, md: -2 },
            }}
          >
            <Collapse in={view === "grid"} timeout={300}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  py: 1,
                }}
              >
                <FormControl size="small" sx={{ minWidth: 120, mr: 1 }}>
                  <InputLabel id="sort-by-label">Sort By</InputLabel>
                  <Select
                    labelId="sort-by-label"
                    value={sortBy}
                    label="Sort By"
                    onChange={(e) =>
                      setParams((params) => {
                        params.set(
                          "sortBy",
                          e.target.value as
                            | "name"
                            | "size"
                            | "createdAt"
                            | "modifiedAt"
                            | "owner"
                            | "uploader",
                        );
                        return params;
                      })
                    }
                  >
                    <MenuItem value="name">Name</MenuItem>
                    <MenuItem value="size">Size</MenuItem>
                    <MenuItem value="createdAt">Creation Date</MenuItem>
                    <MenuItem value="modifiedAt">Modification Date</MenuItem>
                    <MenuItem value="owner">Owner</MenuItem>
                    <MenuItem value="uploader">Uploader</MenuItem>
                  </Select>
                </FormControl>
                <Tooltip
                  title={`Sort ${sortOrder === "asc" ? "Descending" : "Ascending"}`}
                >
                  <IconButton
                    onClick={() => {
                      const value = sortOrder === "asc" ? "desc" : "asc";
                      setParams((params) => {
                        params.set("sortOrder", value);
                        return params;
                      });
                    }}
                    size="small"
                  >
                    <Box
                      sx={{
                        transform:
                          sortOrder === "asc"
                            ? "rotate(0deg)"
                            : "rotate(180deg)",
                        transition: "transform 0.3s ease-in-out",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ArrowUpwardIcon />
                    </Box>
                  </IconButton>
                </Tooltip>
              </Box>
            </Collapse>
          </Box>

          <BreadcrumbsNavigation
            path={dirStack.map((f) => f.name ?? "Encrypted directory")}
            onNavigate={(index) => {
              const tempStack = handleNavigate(index, dirStack);
              setDirStack(tempStack);
            }}
          />

          {view === "list" ? (
            <FileList
              onRowClick={(fileId) => {
                const file = files[fileId]!;
                handleOpenFolder(file);
              }}
              onSortModelChange={(model) => {
                const value = model[0];
                if (!value) {
                  setParams((params) => {
                    params.delete("sortBy");
                    params.delete("sortOrder");
                    return params;
                  });
                } else {
                  setParams((params) => {
                    params.set("sortBy", value.field);
                    params.set("sortOrder", value.sort || "desc");
                    return params;
                  });
                }
              }}
              onAction={handleFileAction}
              files={currentDir ?? []}
              loading={loading}
              sortBy={sortBy}
              sortOrder={sortOrder}
              users={users}
              owner={type === "files"}
            />
          ) : (
            <>
              {
                <FileGridView
                  files={currentDir ?? []}
                  users={users}
                  onNavigate={(fileId) => {
                    const file = files[fileId]!;
                    handleOpenFolder(file);
                  }}
                  onAction={handleFileAction}
                  loading={loading}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  owner={type === "files"}
                />
              }
            </>
          )}
        </Box>
      </Box>
      {/* File sharing dialog holder */}
      <ShareModal
        currentUser={currentUser}
        open={shareOpen}
        file={selectedFile.current}
        onClose={() => setShareOpen(false)}
      />

      {/* File info dialog holder */}
      <FileInfoModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        file={selectedFile.current}
        users={users}
        path={dirStack}
      />

      {/* File sharing password modal */}
      <PasswordModal
        open={passwordOpen}
        loading={loading}
        onSubmit={(password) => setLinkPasword(password)}
        customText="This link requires a password to access:"
        error={linkError}
      />

      {/* File deletion confirmation modal */}
      <DeleteModal
        file={selectedFile.current}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => await handleDelete(selectedFile.current!)}
      />

      {/* File move dialog */}
      {moveOpen && (
        <FileMoveModal
          // On close we want to re-fetch files to prevent stale data on the edge
          // case where the user is viewing files shared with them, and they move
          // to the root directory within the modal, then close the modal
          // causing the file to have incorrect permissions
          onClose={async () => {
            setMoveOpen(false);
            await fetchFiles();
          }}
          file={selectedFile.current}
          files={files}
          root={[...root]}
          dirStack={dirStack}
          onChangeDirectory={async (folderId) =>
            await fetchFiles({
              fileId: folderId || undefined,
              updateLoading: false,
              includeAncestors: false,
            })
          }
          userPublicKey={userPublicKey}
          // Handle updating the file tree visually
          onMove={async () => {
            setMoveOpen(false);
            await fetchFiles();
          }}
        />
      )}
    </>
  );
}

/** Styles. */
const styles = {
  controls: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "20px",
    flex: 1,
  },
};
