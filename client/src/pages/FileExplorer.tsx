import React, { useState, useEffect, useMemo, useRef } from "react";
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
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import { API, listToGrid, logout, sortFiles } from "../utils";
import localforage from "localforage";
import {
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
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { FileMetadata, FileResponse } from "../types";
import { useToast } from "../components/ToastProvider";
import FileSearch from "../components/FileSearch";
import JSZip from "jszip";
import { useThrottledCallback } from "use-debounce";
import FileList from "../components/FileList";
import { FileSortOrder, PublicUser } from "../myApi";
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
import { useProfile } from "../components/ProfileProvider";
import { useNavbar } from "../components/NavbarContext";
import { RenameModal } from "../components/FileRenameModal";
import FilePreviewModal from "../components/FilePreviewModal";

/** Return an icon based on file extension. */
export function getFileIcon(
  mimeType: string | undefined,
  width?: number,
  height?: number,
) {
  const icons: Record<string, React.JSX.Element> = {
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

interface SelectedFile {
  file?: FileMetadata;
  index?: number;
  fromSearch?: boolean;
}

export default function FileExplorer(
  { type }: FileExplorerProps = { type: "files" },
) {
  const [params, updateParams] = useSearchParams();
  const { profile, loading: loadingProfile, refreshProfile } = useProfile();
  const { setShowNavbar } = useNavbar();

  // Hide navbar when component mounts
  useEffect(() => {
    setShowNavbar(false);

    // Show navbar again when component unmounts
    return () => {
      setShowNavbar(true);
    };
  }, [setShowNavbar]);

  const preferredView = useRef<"list" | "grid">(
    profile ? (profile.gridView ? "grid" : "list") : "grid",
  );
  const preferredSortBy = useRef<FileSortOrder>("name");
  const parentId = params.get("parentId");
  const view = params.get("view") || preferredView.current;
  const linkId = params.get("linkId");
  const sortBy: FileSortOrder =
    (params.get("sortBy") as FileSortOrder) || preferredSortBy.current;
  const sortOrder: "asc" | "desc" =
    (params.get("sortOrder") as "asc" | "desc") || "asc";
  // const fileId = params.get("fileId");

  // The list of items in the current directory
  const [files, setFiles] = useState<Record<string, FileMetadata>>({});
  const [users, setUsers] = useState<Record<string, PublicUser>>({});
  const [root, setRoot] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const { showError } = useToast();
  const navigate = useNavigate();

  // The user's decrypted private key and public key
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);

  // Get window size for responsive design
  const { width } = useWindowSize();
  const isMobile = width < 768;

  // Collapse the sidebar on mobile by default
  const [collapsed, setCollapsed] = useState<boolean>(isMobile);

  const [shareOpen, setShareOpen] = useState<boolean>(false);
  const [infoOpen, setInfoOpen] = useState<boolean>(false);
  const [passwordOpen, setPasswordOpen] = useState<boolean>(false);
  const [deleteOpen, setDeleteOpen] = useState<boolean>(false);
  const [renameOpen, setRenameOpen] = useState<boolean>(false);
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<SelectedFile>({});
  const [linkPassword, setLinkPassword] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | undefined>(undefined);
  const [linkKey, setLinkKey] = useState<CryptoKey | null>(null);
  // Used to determine if we should use a new private key
  const [previousUsername, setPreviousUsername] = useState<string | null>(null);

  useEffect(() => {
    async function importLinkKey() {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const bufferHash = base64ToArrayBuffer(hash);
      if (!bufferHash || bufferHash.byteLength != 32) return;

      setLinkKey(
        await crypto.subtle.importKey(
          "raw",
          bufferHash,
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

  // Refetch files if any of the necessessary function params change
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
    let unsortedFiles;
    if (parentId) {
      if (files[parentId]) {
        unsortedFiles = files[parentId].children?.map((f) => files[f]);
      } else {
        setParams((params) => {
          params.delete("parentId");
          return params;
        });
        return [];
      }
    } else {
      unsortedFiles = [...root].map((f) => files[f]);
    }
    return unsortedFiles && sortFiles(unsortedFiles, sortBy, sortOrder, users);
  }, [files, parentId, loading, sortOrder, sortBy, root, users]);

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
      showError("Error downloading file/folder. Please try again.", error);
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

    const url = await decryptAndCacheFile(file);
    if (!url) {
      showError("Unable to decrypt file for download. Please try again.");
      return;
    }

    // Create a temporary link to trigger download
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name ?? "download";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // We don't revoke the URL here as it's now cached in the file metadata
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
        const nextFiles: string[] = [];
        const nextFolders: Record<string, JSZip> = {};

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
              const response = await API.api.getFile(f.id, {
                linkId: linkId ?? undefined,
              });
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

  async function decryptPrivateKey() {
    if (!profile) {
      return;
    }
    const { publicKey, gridView, id, email, username, sortOrder } = profile;
    preferredView.current = gridView ? "grid" : "list";
    // Sort order is actually sortBy because I forgot
    // actually to rename it in the backend when I added sorting
    preferredSortBy.current = sortOrder as typeof sortBy;
    setUsers({ ...users, [id]: { publicKey, email, id, username } });

    // 2) If we have an encrypted private key, prompt for password
    const storedPrivateKey: CryptoKey | null =
      await localforage.getItem("privateKey");
    // We can't compare CryptoKey objects directly because they are
    // opaque, so instaed just check if the user's username changed,
    // which likely means that they logged in with a different account
    // and therefore have a different private key. We need to do this
    // to prevent `refreshProfile` calls transitively calling `fetchFiles`
    if (storedPrivateKey != null) {
      if (previousUsername !== profile.username) {
        setPrivateKey(storedPrivateKey);
      }
      setPreviousUsername(profile.username);
    } else {
      await logout();
      navigate("/login");
    }
  }

  useEffect(() => {
    if (loadingProfile) return;
    decryptPrivateKey();
  }, [loadingProfile]);

  /**
   * Decrypts a file and caches its blob URL in the files state
   * Returns the blob URL for the decrypted file
   */
  const decryptAndCacheFile = async (
    file: FileMetadata,
  ): Promise<string | null> => {
    // Return cached URL if available - this ensures we never overwrite an existing blob URL
    if (file.blobUrl) return file.blobUrl;

    if (!file.key || !file.fileNonce) {
      return null;
    }

    try {
      const response = await API.api.getFile(file.id, {
        linkId: linkId ?? undefined,
      });
      if (!response.ok) throw response.error;

      const dataBuffer = await response.arrayBuffer();

      // Decrypt the file
      const fileNonceBuffer = base64ToArrayBuffer(file.fileNonce);
      const fileData = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fileNonceBuffer },
        file.key,
        dataBuffer,
      );

      const blob = new Blob([fileData], { type: file.mimeType });
      const url = URL.createObjectURL(blob);

      // Update file metadata with blob URL
      setFiles((prevFiles) => ({
        ...prevFiles,
        [file.id]: {
          ...prevFiles[file.id],
          blobUrl: url,
        },
      }));

      return url;
    } catch (err) {
      showError("Error decrypting file", err);
      return null;
    }
  };

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
      limit: -(1 << 31),
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
      // Too many reuests in a short time frame, rate limit exceeded
      if (resp.status === 429) {
        showError("You are sending too many requests. Please slow down.");
        return;
      }
      if (!resp.ok) throw resp.error;
      const data: FileResponse = await resp.json();
      if (includeAncestors || !fileId) {
        setRoot(new Set(data.root));
      }
      setUsers({ ...users, ...data.users });
      // Preserve existing blob URLs when updating file metadata
      const tempFiles: Record<string, FileMetadata> = {};

      // Process all files, preserving blob URLs for files that already exist
      for (const fileId in data.files) {
        if (files[fileId]?.blobUrl) {
          // Preserve the existing blob URL if the file already exists
          tempFiles[fileId] = {
            ...data.files[fileId],
            blobUrl: files[fileId].blobUrl,
          };
        } else {
          // New file, just copy it over
          tempFiles[fileId] = data.files[fileId];
        }
      }

      // Include any existing files that weren't in the new data
      for (const fileId in files) {
        if (!tempFiles[fileId]) {
          tempFiles[fileId] = files[fileId];
        }
      }

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
                showError("Unexpected error. Could not get parent key");
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
      showError("Error fetching files.", err);
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

  // Clean up all blob URLs when component unmounts
  useEffect(() => {
    return () => {
      // Revoke all blob URLs stored in files
      Object.values(files).forEach((file) => {
        if (file.blobUrl) {
          URL.revokeObjectURL(file.blobUrl);
        }
      });
    };
  }, []);

  /** Directory navigation. */
  const handleOpenFile = (file: FileMetadata, fromSearch: boolean = false) => {
    if (file.isDirectory) {
      setParams((params) => {
        params.set("parentId", file.id);
        return params;
      });
    } else {
      handleFileAction("preview", file, fromSearch);
    }
  };

  async function handleFileAction(
    action: string,
    fileId: string | FileMetadata,
    fromSearch: boolean = false,
  ) {
    let file;
    if (typeof fileId === "string") {
      if (!files[fileId]) {
        showError("Unexpected error encountered. File not found...", fileId);
        return;
      }
      file = files[fileId];
    } else {
      file = fileId;
    }
    setSelectedFile({ file, index: currentDir?.indexOf(file), fromSearch });
    switch (action) {
      case "delete":
        setDeleteOpen(true);
        break;
      case "info":
        setInfoOpen(true);
        break;
      case "download":
        handleDownload(file);
        break;
      case "rename":
        setRenameOpen(true);
        break;
      case "share":
        setShareOpen(true);
        break;
      case "move":
        setMoveOpen(true);
        break;
      case "preview":
        setPreviewOpen(true);
        break;
      default:
        showError(`Unsupported case encountered in handleAction! ${action}`);
    }
  }

  /** Delete a file/folder. */
  const handleDelete = async (file: FileMetadata) => {
    try {
      const resp = await API.api.deleteFile(file.id, {
        linkId: linkId ?? undefined,
      });
      if (!resp.ok) throw resp.error;
      refreshProfile();
      fetchFiles();
    } catch (err) {
      showError("Error deleting file", err);
    }
  };

  const handleRename = async (
    file: FileMetadata,
    newName: string,
  ): Promise<boolean> => {
    try {
      if (!file || !file?.key || file?.name === undefined) {
        throw "File does not have valid values";
      }
      const nameNonce = generateNonce();
      const encryptedNewName = await encryptText(file.key, newName, nameNonce);
      const response = await API.api.updateFile(
        file.id,
        {
          type: "rename",
          encryptedName: bufferToBase64(encryptedNewName),
          nameNonce: bufferToBase64(nameNonce),
        },
        { linkId: linkId ?? undefined },
      );
      if (!response.ok) throw response.error;
      refreshProfile();
      fetchFiles();
      return true;
    } catch (err) {
      showError("Error renaming file. Please try again later.", err);
      return false;
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
          showError("Error creating folder. Could not find folder parent key");
          return;
        }
        keyNonce = generateNonce();
        algorithm = { name: "AES-GCM", iv: keyNonce };
      } else {
        if (!profile?.importedPublicKey) {
          showError("User public key not loaded");
          return;
        }
        parentKey = profile?.importedPublicKey;
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

      const resp = await API.api.uploadFile(
        {
          metadata,
        },
        { linkId: linkId ?? undefined },
      );
      if (!resp.ok) throw resp.error;
      refreshProfile();
      fetchFiles();
    } catch (err) {
      showError("Error creating folder", err);
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
          user={profile ?? undefined}
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
                  {type === "files" ? "My Files" : "Files Shared with Me"}
                </Typography>
              </Box>
            </Box>
          </Box>
          <div style={styles.controls}>
            {/* Search bar in its own row */}
            <Box sx={{ width: "100%", mb: { xs: 2, md: 0 } }}>
              <FileSearch
                loading={loading}
                files={files}
                onOpen={throttledFetchFiles}
                onFileSelected={(file) => handleOpenFile(file, true)}
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

            {/* Upload button and view toggle in a row below */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                width: "100%",
                alignItems: "center",
              }}
            >
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
                  onFinish={async () => {
                    await fetchFiles();
                  }}
                  onClose={() => setShowUpload(false)}
                />
              )}

              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  position: "relative",
                }}
              >
                {/* Sort controls that slide out from under the view toggle */}
                <Box sx={{ position: "absolute", right: "100%", top: 0 }}>
                  <Collapse
                    in={view === "grid"}
                    orientation="horizontal"
                    timeout={300}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        pr: 1,
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
                                e.target.value as FileSortOrder,
                              );
                              return params;
                            })
                          }
                        >
                          <MenuItem value="name">Name</MenuItem>
                          <MenuItem value="size">Size</MenuItem>
                          <MenuItem value="created">Creation Date</MenuItem>
                          <MenuItem value="modified">
                            Modification Date
                          </MenuItem>
                          <MenuItem value="owner">Owner</MenuItem>
                          <MenuItem value="uploader">Uploader</MenuItem>
                          <MenuItem value="extension">Extension</MenuItem>
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
            </Box>
          </div>

          {/* Sort controls have been moved to slide out next to the view toggle button */}
          <Box sx={{ mb: 2 }} />

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <BreadcrumbsNavigation
              path={dirStack.map((f) => f.name ?? "Encrypted directory")}
              onNavigate={(index) => {
                const tempStack = handleNavigate(index, dirStack);
                setDirStack(tempStack);
              }}
              loading={loading}
            />
            <Tooltip title="Refresh">
              <IconButton
                onClick={() => fetchFiles()}
                disabled={loading}
                size="small"
                sx={{ ml: 1 }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Create a box that takes the remaining height of the viewport */}
          <Box
            sx={{
              height: "calc(100vh - 275px)",
              display: "flex",
              flexDirection: "column",
              bgcolor: view === "grid" ? "action.hover" : "background.paper",
              borderRadius: 1,
              border: 1,
              borderColor: "divider",
              overflow: "hidden", // Ensure no overflow outside this container
            }}
          >
            {view === "list" ? (
              <FileList
                onRowClick={(fileId) => {
                  const file = files[fileId]!;
                  handleOpenFile(file);
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
                      params.set("sortBy", listToGrid(value.field));
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
              <FileGridView
                files={currentDir ?? []}
                users={users}
                onNavigate={(fileId) => {
                  const file = files[fileId]!;
                  handleOpenFile(file);
                }}
                onAction={handleFileAction}
                loading={loading}
                onPreviewLoad={(fileId, blobUrl) => {
                  if (blobUrl) {
                    setFiles((prevFiles) => ({
                      ...prevFiles,
                      [fileId]: {
                        ...prevFiles[fileId],
                        blobUrl,
                      },
                    }));
                  }
                }}
                owner={type === "files"}
              />
            )}
          </Box>
        </Box>
      </Box>
      {/* File sharing dialog holder */}
      <ShareModal
        currentUser={profile ?? undefined}
        open={shareOpen}
        file={selectedFile.file}
        onClose={() => setShareOpen(false)}
      />

      {/* File info dialog holder */}
      <FileInfoModal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        file={selectedFile.file}
        users={users}
        path={dirStack}
      />

      {/* File sharing password modal */}
      <PasswordModal
        open={passwordOpen}
        loading={loading}
        onSubmit={(password) => setLinkPassword(password)}
        customText="This link requires a password to access:"
        error={linkError}
      />

      {/* File deletion confirmation modal */}
      <DeleteModal
        file={selectedFile.file}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => await handleDelete(selectedFile.file!)}
      />

      {/* File renaming modal */}
      <RenameModal
        key={`${selectedFile.file?.id}-rename`}
        file={selectedFile.file}
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        onConfirm={async (newName) =>
          await handleRename(selectedFile.file!, newName)
        }
      />

      {/* File preview modal */}
      <FilePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        file={selectedFile.file}
        linkId={linkId ?? undefined}
        listIndex={selectedFile.index}
        listLength={currentDir?.length}
        fromSearch={selectedFile.fromSearch}
        onCycle={(index) => {
          if (selectedFile.fromSearch) return;
          const direction =
            selectedFile.index && index >= selectedFile.index ? 1 : -1;
          let finalIndex: number = index - direction;
          // Skip directories
          do {
            // Add wrapping to the file cycling
            finalIndex =
              (finalIndex + direction + (currentDir?.length ?? 0)) %
              (currentDir?.length ?? 1);
          } while (
            currentDir?.[finalIndex]?.isDirectory &&
            finalIndex !== index - direction
          );
          setSelectedFile({
            ...selectedFile,
            index: finalIndex,
            file: currentDir?.[finalIndex],
          });
        }}
        onLoad={(blobUrl) => {
          if (blobUrl) {
            setFiles((prevFiles) => ({
              ...prevFiles,
              [selectedFile.file!.id]: {
                ...prevFiles[selectedFile.file!.id],
                blobUrl,
              },
            }));
            setSelectedFile({
              ...selectedFile,
              file: { ...selectedFile.file!, blobUrl },
            });
          }
        }}
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
          linkId={linkId}
          owner={type === "files"}
          file={selectedFile.file}
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
          userPublicKey={profile?.importedPublicKey ?? null}
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
    flexDirection: "column" as const,
    gap: "10px",
    marginBottom: "20px",
    flex: 1,
  },
};
