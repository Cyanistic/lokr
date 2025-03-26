import { useState, useEffect, useMemo, useRef } from "react";
import Upload from "./Upload";
import {
  FaFolder,
  FaClock,
  FaUsers,
  FaTh,
  FaList,
  FaFileAlt,
  FaFileImage,
  FaFilePdf,
  FaFileWord,
  FaFileExcel,
  FaFilePowerpoint,
  FaFileArchive,
  FaFileCode,
  FaPlus,
} from "react-icons/fa";
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
  generateKeyAndNonce,
  bufferToBase64,
} from "../cryptoFunctions";
import { useSearchParams } from "react-router-dom";
import { FileMetadata, FileResponse } from "../types";
import { useErrorToast } from "../components/ErrorToastProvider";
import FileSearch from "../components/FileSearch";
import JSZip from "jszip";
import { useThrottledCallback } from "use-debounce";
import FileList from "../components/FileList";
import { PublicUser } from "../myApi";

/** Convert base64 to ArrayBuffer */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Return an icon based on file extension. */
export function getFileIcon(mimeType: string | undefined) {
  const icons: Record<string, JSX.Element> = {
    "text/plain": <FaFileAlt />,
    "image/png": <FaFileImage style={{ color: "#D41632" }} />,
    "image/jpeg": <FaFileImage style={{ color: "#D41632" }} />,
    "application/pdf": <FaFilePdf style={{ color: "#D41632" }} />,
    "application/msword": <FaFileWord style={{ color: "blue" }} />,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": <FaFileWord />,
    "application/vnd.ms-excel": <FaFileExcel style={{ color: "green" }} />,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": <FaFileExcel style={{ color: "green" }} />,
    "application/vnd.ms-powerpoint": <FaFilePowerpoint style={{ color: "orange" }} />,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": <FaFilePowerpoint style={{ color: "orange" }} />,
    "application/zip": <FaFileArchive />,
    "application/x-rar-compressed": <FaFileArchive />,
    "text/html": <FaFileCode style={{ color: "red" }} />,
    "text/css": <FaFileCode style={{ color: "blue" }} />,
    "application/javascript": <FaFileCode style={{ color: "yellow" }} />,
    "application/typescript": <FaFileCode style={{ color: "blue" }} />,
  };
  if (mimeType) {
    return icons[mimeType ?? "text/plain"] || <FaFileAlt />;
  } else {
    return <FaFolder style={{ cursor: "pointer", color: "blue" }} />
  }
}

/** Renders a file or folder item in grid view. */
const FileGridItem = ({
  file,
  onOpenFolder,
  onMove,
  onDelete,
  onDownload
}: {
  file: FileMetadata;
  onOpenFolder: (file: FileMetadata) => void;
  onMove: (file: FileMetadata) => void;
  onDelete: (file: FileMetadata) => void;
  onDownload: (file: FileMetadata) => void;
}) => (
  <div style={{ ...styles.gridItem, color: "black" }}>
    <h3>
      {file.isDirectory ? (
        <span onClick={() => onOpenFolder(file)} style={{ cursor: "pointer", color: "blue" }}>
          <FaFolder /> {file.name}
        </span>
      ) : (
        <>
          {getFileIcon(file.mimeType)} {file.name}
        </>
      )}
    </h3>
    <p>Created: {new Date(file.createdAt).toLocaleDateString()}</p>
    <p>Modified: {new Date(file.modifiedAt).toLocaleDateString()}</p>
    <p>Type: {file.isDirectory ? "Directory" : file.mimeType}</p>
    <button onClick={() => onMove(file)}>Move</button>
    <button onClick={() => onDownload(file)}>Download</button>
    <button onClick={() => onDelete(file)}>Delete</button>
  </div>
);

/** Main FileExplorer Component. */
export default function FileExplorer() {
  const [sortBy, setSortBy] = useState<"name" | "createdAt" | "modifiedAt">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [params, setParams] = useSearchParams();
  const preferredView = useRef<"list" | "grid">("list");
  const parentId = params.get("parentId");
  const view = params.get("view") || preferredView.current;
  // const fileId = params.get("fileId");

  // The list of items in the current directory
  const [files, setFiles] = useState<Record<string, FileMetadata>>({});
  const [users, setUsers] = useState<Record<string, PublicUser>>({});
  const [root, setRoot] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true);
  const { showError } = useErrorToast();

  // The user's decrypted private key and public key
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [userPublicKey, setUserPublicKey] = useState<CryptoKey | null>(null);


  // Whenever currentDir or privateKey changes, fetch the files
  useEffect(() => {
    if (!privateKey) {
      return;
    }
    fetchFiles();
  }, [parentId, privateKey]);

  const currentDir = useMemo(() => {
    if (loading) {
      return [];
    }
    if (parentId) {
      if (files[parentId]) {
        return files[parentId].children?.map(f => files[f]);
      } else {
        setParams(params => {
          params.delete("parentId");
          return params;
        });
      }
    } else {
      return [...root].map(f => files[f]);
    }
  }, [files, parentId, loading]);

  const [dirStack, setDirStack] = useState<FileMetadata[]>([]);

  // Tracks whether the dropdown is open
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);

  // Tracks if there is an active download
  const [downloadTarget, setDownloadTarget] = useState<FileMetadata | null>(null);

  /** Download raw data from the server (not decrypted). */
  const handleDownload = async (file: FileMetadata) => {
    try {
      if (file.isDirectory) {
        await fetchFiles({ depth: 20, limit: 1000, includeAncestors: false, fileId: file.id });
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
    fetchFiles({ depth: 20, limit: 1000, includeAncestors: false, updateLoading: false })
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
    const fileData = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToArrayBuffer(file.nonce) },
      file.key,
      dataBuffer
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

    while (fileQueue && fileQueue.length > 0) {
      let nextFiles: string[] = [];
      let nextFolders: Record<string, JSZip> = {};

      await Promise.all(
        fileQueue.map(async (fileId) => {
          const f = files[fileId];
          if (!f) return;

          if (f.isDirectory) {
            nextFolders[f.id] = folderQueue[f.parentId!].folder(f.name ?? "folder")!;
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
            const fileData = await crypto.subtle.decrypt(
              { name: "AES-GCM", iv: base64ToArrayBuffer(f.nonce) },
              f.key,
              dataBuffer
            );
            folderQueue[f.parentId!].file(f.name || "file", fileData);
          }
        })
      );
      fileQueue = nextFiles;
      folderQueue = nextFolders;
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
      const { publicKey, encryptedPrivateKey, iv, salt, gridView, id, email, username } = data;
      preferredView.current = gridView ? "grid" : "list";

      await localforage.setItem("userId", id);
      // 1) Import the user's public key
      if (!publicKey) {
        console.error("No public key found in profile");
        return;
      }
      const pubKey = await importPublicKey(publicKey);
      setUserPublicKey(pubKey);
      setUsers({ ...users, [id]: { publicKey, email, id, username } })

      // 2) If we have an encrypted private key, prompt for password
      const storedPrivateKey: CryptoKey | null = await localforage.getItem("privateKey");
      if (storedPrivateKey != null) {
        setPrivateKey(storedPrivateKey);
      } else {
        if (encryptedPrivateKey && iv && salt) {
          const pwd = prompt("Enter your password to decrypt your private key:");
          if (!pwd) {
            console.error("No password provided; cannot decrypt private key");
            return;
          }
          // 3) Derive an AES key from password + salt
          const aesKey = await deriveKeyFromPassword(pwd, salt);
          // 4) Unwrap the private key
          const unwrapped = await unwrapPrivateKey(encryptedPrivateKey, aesKey, iv);
          if (!unwrapped) {
            console.error("Failed to unwrap private key");
            return;
          }
          setPrivateKey(unwrapped);
        } else {
          console.error("Missing fields (encryptedPrivateKey, iv, salt) to decrypt private key");
        }
      }
    } catch (err) {
      console.error("Error fetching profile or decrypting key:", err);
    }
  }

  useEffect(() => {
    fetchUserProfileAndDecryptKey();
  }, []);

  async function fetchFiles({
    depth,
    limit,
    offset,
    includeAncestors,
    fileId,
    updateLoading
  }: {
    depth?: number, limit?: number, offset?: number, includeAncestors?: boolean, fileId?: string, updateLoading?: boolean
  } = { depth: 1, limit: 100, offset: 0, includeAncestors: true, fileId: parentId ?? undefined, updateLoading: true }) {
    if (updateLoading) {
      setLoading(true);
    }
    try {
      const resp = await API.api.getFileMetadata({
        id: fileId,
        depth: depth ?? 1,
        limit: limit ?? 100,
        offset: offset ?? 0,
        includeAncestors: includeAncestors ?? true
      });
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
      const tempFiles = { ...files, ...data.files };
      let queue: string[] = [];
      const stack = [];
      if (data.root.length) {
        queue = data.root;
      } else if (parentId) {
        queue = [parentId];
      } else {
        setLoading(false);
        return;
      }

      // BFS traversal to decrypt files
      let times = 0;
      let found = false;
      while (queue.length > 0) {
        let next: string[] = [];
        await Promise.allSettled(queue.map(async (fileId) => {
          found ||= fileId === parentId;
          const f = tempFiles[fileId];
          let unwrapKey: CryptoKey | undefined | null;
          let unwrapAlgorithm;
          let mimeType;
          const nonce = base64ToArrayBuffer(f.nonce);
          if (f.parentId) {
            unwrapAlgorithm = { name: "AES-GCM", iv: nonce } as AesGcmParams;
            unwrapKey = tempFiles[f.parentId].key;
          } else {
            unwrapAlgorithm = { name: "RSA-OAEP" } as RsaOaepParams;
            unwrapKey = privateKey;
          }
          if (!unwrapKey) {
            console.error("Could not get parent key");
            return;
          }
          const key = await unwrapAESKey(f.encryptedKey, unwrapKey, unwrapAlgorithm);
          const name = await decryptText(f.encryptedFileName, key, nonce);
          if (f.encryptedMimeType) {
            mimeType = await decryptText(f.encryptedMimeType, key, nonce);
          }
          if (f.children) {
            next.push(...f.children);
          }
          tempFiles[fileId] = { ...f, name, key, mimeType, createdAtDate: new Date(f.createdAt), modifiedAtDate: new Date(f.modifiedAt) };
        }))
        if (!found && parentId) {
          stack.push(tempFiles[queue[0]]);
        }
        times += 1;
        queue = next;
      }
      if (parentId) {
        stack.push(tempFiles[parentId]);
      }
      setDirStack(stack);
      setFiles(tempFiles);
    } catch (err) {
      console.error("Error fetching files:", err);
      setParams(params => {
        params.delete("parentId");
        return params
      });
    }
    if (updateLoading) {
      setLoading(false);
    }
  };

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

  /** Sorting + searching. */
  const sortedFiles = currentDir?.slice().sort((a, b) => {
    let comparison = 0;
    if (sortBy === "name") {
      comparison = (a.name ?? "encryptedFile").localeCompare(b.name ?? "encryptedFile");
    } else if (sortBy === "createdAt") {
      comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    } else if (sortBy === "modifiedAt") {
      comparison = new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime();
    }
    return sortOrder === "asc" ? comparison : -comparison;
  });

  // @ts-ignore
  const handleSort = (column: "name" | "createdAt" | "modifiedAt") => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  /** Directory navigation. */
  const handleOpenFolder = (folder: FileMetadata) => {
    if (folder.isDirectory) {
      setParams((params) => {
        params.set("parentId", folder.id);
        return params;
      });
    }
  };
  const handleGoBack = () => {
    const stack = [...dirStack];
    // Remove the last item from the stack
    stack.pop();
    setDirStack(stack);
    setParams((params) => {
      const last = stack[stack.length - 1]?.id;
      if (last !== undefined) {
        params.set("parentId", last);
      } else {
        params.delete("parentId");
      }
      return params;
    });
  };

  /** Move a file to a new parent. */
  const handleMove = async (file: FileMetadata) => {
    const destination = prompt("Enter destination folder id:");
    if (!destination) return;
    try {
      const resp = await API.api.updateFile(file.id, {
        type: "move",
        parentId: destination,
        encryptedKey: file.encryptedKey || "",
      });
      if (resp.ok) {
        showError("File moved successfully");
        fetchFiles();
      } else {
        showError("Error moving file");
      }
    } catch (err) {
      console.error("Error moving file:", err);
      showError("Error moving file");
    }
  };

  /** Delete a file/folder. */
  const handleDelete = async (file: FileMetadata) => {
    if (window.confirm(`Are you sure you want to delete "${file.name}"?`)) {
      try {
        const resp = await API.api.deleteFile(file.id);
        if (resp.ok) {
          const newFiles = { ...files };
          delete newFiles[file.id];
          if (file.parentId) {
            newFiles[file.parentId].children = newFiles[file.parentId].children?.filter((id) => id != file.id);
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
    }
  };

  /** Create a new folder by encrypting the name with the public key. */
  const handleCreateFolder = async () => {
    if (!userPublicKey) {
      showError("User public key not loaded");
      return;
    }
    const folderName = prompt("Enter new folder name:");
    if (!folderName) return;
    try {
      const [aesKey, nonce] = await generateKeyAndNonce();
      let parentKey: CryptoKey;
      let algorithm: AesGcmParams | RsaOaepParams;
      if (parentId) {
        if (files[parentId].key) {
          parentKey = files[parentId].key;
        } else {
          console.error("Could not find folder parent key");
          return;
        }
        algorithm = { name: "AES-GCM", iv: nonce }
      } else {
        parentKey = userPublicKey;
        algorithm = { name: "RSA-OAEP" }
      }
      const encryptedName = await encryptText(aesKey, folderName, nonce);
      const encryptedNameB64 = btoa(String.fromCharCode(...encryptedName));
      const encryptedKey = bufferToBase64(await encryptAESKeyWithParentKey(parentKey, aesKey, algorithm));
      const metadata = {
        name: folderName,
        encryptedFileName: encryptedNameB64,
        encryptedKey: encryptedKey,
        isDirectory: true,
        nonce: bufferToBase64(nonce.buffer),
        uploaderId: await localforage.getItem("userId") || undefined,
        parentId,
      };

      const resp = await API.api.uploadFile({
        metadata,
      });
      if (!resp.ok) throw resp.error;
      fetchFiles();
    } catch (err) {
      console.error("Error creating folder:", err);
      showError("Error creating folder");
    }
  };

  /** Handle "Upload File" option from the dropdown as a placeholder. */
  function handleNewUploadFile() {
    showError("File upload logic goes here.");
    setIsNewMenuOpen(false);
  }

  return (
    <div style={styles.container}>
      <aside style={styles.sidebar}>
        <h2>My Drive</h2>
        <div style={{ position: "relative" }}>
          <ul style={styles.navList}>
            <li
              style={styles.newNavItem}
              onClick={() => setIsNewMenuOpen((prev) => !prev)}
            >
              <FaPlus style={{ fontSize: "1.2rem" }} />
              New
            </li>
            {isNewMenuOpen && (
              <div style={styles.newMenu}>
                <div style={styles.newMenuItem} onClick={handleNewUploadFile}>
                  Upload File
                </div>
                <div
                  style={styles.newMenuItem}
                  onClick={() => {
                    handleCreateFolder();
                    setIsNewMenuOpen(false);
                  }}
                >
                  Create Folder
                </div>
              </div>
            )}
            <li
              style={styles.navItem}
              onClick={() => {
                setParams((params) => {
                  params.delete("parentId");
                  return params
                });
                setDirStack([]);
              }}
            >
              <FaFolder /> My Files
            </li>
            <li style={styles.navItem}>
              <FaUsers /> Shared with me
            </li>
            <li style={styles.navItem}>
              <FaClock /> Recent
            </li>
            {dirStack.length > 0 && (
              <li style={styles.navItem} onClick={handleGoBack}>
                ← Back
              </li>
            )}
          </ul>
        </div>
      </aside>
      <main style={styles.mainContent}>
        <header style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <h1 style={styles.title}>Files</h1>
          <div style={styles.controls}>
            <Upload
              parentId={parentId}
              parentKey={parentId ? files[parentId]?.key : null}
              onUpload={async (file) => {
                file.uploaderId = await localforage.getItem("userId") || "";
                file.ownerId = files[parentId ?? ""]?.ownerId || file.uploaderId;
                const tempFiles = { ...files };
                tempFiles[file.id] = file;
                if (file.parentId) {
                  tempFiles[file.parentId].children?.push(file.id);
                } else {
                  setRoot(new Set([...root, file.id]))
                }
                setFiles(tempFiles)
              }}
            />
            <FileSearch
              loading={loading}
              files={files}
              onOpen={throttledFetchFiles}
              onFileSelected={file => {
                if (file.isDirectory) {
                  setParams(params => {
                    params.set("parentId", file.id);
                    return params;
                  })
                } else {
                  // TODO: Handle showing file previews here
                }
              }}
              onNavigateToPath={path => {
                setParams(params => {
                  if (path) {
                    params.set("parentId", path);
                  } else {
                    params.delete("parentId");
                  }
                  return params
                })
              }} />
            <button
              onClick={() => setParams(params => {
                params.set("view", view === "list" ? "grid" : "list");
                return params;
              })}
              style={styles.toggleButton}
            >
              {view === "list" ? <FaTh /> : <FaList />} Toggle View
            </button>
          </div>
        </header>
        {view === "list" ? (
          <FileList
            onRowDoubleClick={(fileId) => {
              const file = files[fileId]!;
              handleOpenFolder(file);
            }}
            files={currentDir ?? []}
            loading={loading}
            users={users} />
        ) : (
          <>
            {loading ? (<p>Loading files</p>) :
              (<div style={styles.gridContainer}>
                {sortedFiles?.map((file) => (
                  <FileGridItem
                    key={file.id}
                    file={file}
                    onOpenFolder={handleOpenFolder}
                    onMove={handleMove}
                    onDelete={handleDelete}
                    onDownload={handleDownload}
                  />)
                )
                }
              </div>)}
          </>
        )
        }
      </main >
    </div >
  );
}

/** Styles. */
const styles = {
  container: {
    display: "flex",
    height: "95%",
    backgroundColor: "#f8f9fa",
  },
  sidebar: {
    width: "250px",
    padding: "20px",
    backgroundColor: "#fff",
    boxShadow: "2px 0px 5px rgba(0,0,0,0.1)",
  },
  navList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
  },
  navItem: {
    padding: "10px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    cursor: "pointer",
  },
  newNavItem: {
    padding: "10px 20px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    backgroundColor: "#1a73e8",
    color: "white",
    borderRadius: "4px",
    fontWeight: "bold" as const,
    marginBottom: "10px",
    fontSize: "1rem",
  },
  mainContent: {
    flex: 1,
    padding: "20px",
  },
  title: {
    color: "black",
    fontSize: "2rem",
    fontWeight: "bold",
    marginBottom: "10px",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "20px",
    flex: 1,
  },
  searchBar: {
    flex: 1,
    padding: "8px",
    borderRadius: "4px",
    border: "1px solid #ccc",
  },
  toggleButton: {
    padding: "5px 10px",
    cursor: "pointer",
    borderRadius: "4px",
    border: "none",
    backgroundColor: "#007bff",
    color: "white",
  },
  newFolderButton: {
    padding: "5px 10px",
    cursor: "pointer",
    borderRadius: "4px",
    border: "1px solid #007bff",
    backgroundColor: "white",
    color: "#007bff",
    marginRight: "10px",
  },
  table: {
    width: "100%",
    marginTop: "20px",
  },
  tableHeader: {
    backgroundColor: "#f1f1f1",
  },
  tableHeaderCell: {
    padding: "10px",
    textAlign: "left" as const,
  },
  tableCell: {
    padding: "10px",
    textAlign: "left" as const,
  },
  tableRow: {
    borderBottom: "1px solid #ddd",
    height: "40px",
  },
  sortButton: {
    background: "none",
    border: "none",
    cursor: "pointer",
    marginLeft: "5px",
  },
  gridContainer: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: "10px",
    marginTop: "20px",
  },
  gridItem: {
    padding: "10px",
    border: "1px solid #ccc",
    borderRadius: "4px",
    backgroundColor: "#fff",
    textAlign: "center" as const,
    color: "black",
  },
  newMenu: {
    position: "absolute" as const,
    backgroundColor: "#fff",
    border: "1px solid #ccc",
    borderRadius: "4px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
    marginTop: "5px",
    zIndex: 1000,
  },
  newMenuItem: {
    padding: "8px 16px",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    display: "block",
  },
};
