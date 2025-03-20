import { useState, useEffect, useMemo } from "react";
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
function getFileIcon(mimeType: string | undefined) {
  const icons: Record<string, JSX.Element> = {
    "text/plain": <FaFileAlt />,
    "image/png": <FaFileImage />,
    "image/jpeg": <FaFileImage />,
    "application/pdf": <FaFilePdf />,
    "application/msword": <FaFileWord />,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": <FaFileWord />,
    "application/vnd.ms-excel": <FaFileExcel />,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": <FaFileExcel />,
    "application/vnd.ms-powerpoint": <FaFilePowerpoint />,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": <FaFilePowerpoint />,
    "application/zip": <FaFileArchive />,
    "application/x-rar-compressed": <FaFileArchive />,
    "text/html": <FaFileCode />,
    "text/css": <FaFileCode />,
    "application/javascript": <FaFileCode />,
    "application/typescript": <FaFileCode />,
  };
  return icons[mimeType ?? "text/plain"] || <FaFileAlt />;
}

/** Extract file extension from name. */
function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? `.${parts.pop()}` : "";
}

/** Download raw data from the server (not decrypted). */
const handleDownload = async (fileId: string) => {
  try {
    const response = await API.api.getFile(fileId);

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    // Convert response to a Blob
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    // Create a temporary link to trigger download
    const link = document.createElement("a");
    link.href = url;
    link.download = "FILE"; // Temporary file name
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error downloading file:", error);
  }
};

/** Renders a file or folder row in table view. */
const FileRow = ({
  file,
  onOpenFolder,
  onMove,
  onDelete,
}: {
  file: FileMetadata;
  onOpenFolder: (file: FileMetadata) => void;
  onMove: (file: FileMetadata) => void;
  onDelete: (file: FileMetadata) => void;
}) => (
  <tr style={styles.tableRow}>
    <td style={styles.tableCell}>
      {file.isDirectory ? (
        <span onClick={() => onOpenFolder(file)} style={{ cursor: "pointer", color: "blue" }}>
          <FaFolder /> {file.name}
        </span>
      ) : (
        <>
          {getFileIcon(file.mimeType)} {file.name}
        </>
      )}
    </td>
    <td style={styles.tableCell}>
      {file.createdAtDate?.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })}
    </td>
    <td style={styles.tableCell}>
      {file.modifiedAtDate?.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })}
    </td>
    <td style={styles.tableCell}>{getFileExtension(file.name ?? "")}</td>
    <td style={styles.tableCell}>
      {!file.isDirectory && (
        <>
          <button onClick={() => onMove(file)}>Move</button>
          <button onClick={() => handleDownload(file.id)}>Download</button>
        </>
      )}
      <button onClick={() => onDelete(file)}>Delete</button>
    </td>
  </tr>
);

/** Renders a file or folder item in grid view. */
const FileGridItem = ({
  file,
  onOpenFolder,
  onMove,
  onDelete,
}: {
  file: FileMetadata;
  onOpenFolder: (file: FileMetadata) => void;
  onMove: (file: FileMetadata) => void;
  onDelete: (file: FileMetadata) => void;
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
    <p>Type: {file.encryptedMimeType}</p>
    {!file.isDirectory && (
      <div>
        <button onClick={() => onMove(file)}>Move</button>
        <button onClick={() => handleDownload(file.id)}>Download</button>
      </div>
    )}
    <button onClick={() => onDelete(file)}>Delete</button>
  </div>
);

/** Main FileExplorer Component. */
export default function FileExplorer() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "createdAt" | "modifiedAt">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [params, setParams] = useSearchParams();
  const parentId = params.get("parentId");
  // const fileId = params.get("fileId");

  // The list of items in the current directory
  const [files, setFiles] = useState<Record<string, FileMetadata>>({});
  const [root, setRoot] = useState<Set<string>>(new Set())
  const currentDir = useMemo(() => {
    if (parentId) {
      if (files[parentId]) {
        return files[parentId].children?.map(f => files[f]);
      } else {
        setParams(params => {
          params.delete("parentId");
          return params;
        });
        return [];
      }
    } else {
      return [...root].map(f => files[f]);
    }
  }, [parentId]);
  const [dirStack, setDirStack] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // The user's decrypted private key and public key
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [userPublicKey, setUserPublicKey] = useState<CryptoKey | null>(null);

  // Tracks whether the dropdown is open
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);

  async function fetchUserProfileAndDecryptKey() {
    try {
      const resp = await API.api.getLoggedInUser();
      if (!resp.ok) {
        console.error("Failed to fetch user profile");
        return;
      }
      const data = await resp.json();
      // data might have: { publicKey, encryptedPrivateKey, iv, salt, ... }
      const { publicKey: pubPem, encryptedPrivateKey, iv, salt } = data;

      // 1) Import the user's public key
      if (!pubPem) {
        console.error("No public key found in profile");
        return;
      }
      const pubKey = await importPublicKey(pubPem);
      setUserPublicKey(pubKey);

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

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const resp = await API.api.getFileMetadata({
        id: parentId ?? undefined,
        depth: 3,
        offset: 0,
        limit: 50,
      });
      if (!resp.ok) {
        console.error("Error fetching file metadata:", resp.statusText);
        setLoading(false);
        return;
      }
      const data: FileResponse = await resp.json();
      setRoot(new Set([...root, ...data.root]));
      const tempFiles = { ...files, ...data.files };
      let queue;
      if (data.root.length) {
        queue = data.root;
      } else if (parentId) {
        queue = [parentId];
      } else {
        setLoading(false);
        return;
      }

      // BFS traversal to decrypt files
      while (queue.length > 0) {
        let next: string[] = [];
        await Promise.all(queue.map(async (fileId) => {
          const f = tempFiles[fileId];
          let unwrapKey: CryptoKey | undefined | null;
          let unwrapAlgorithm;
          let mimeType;
          const nonce = base64ToArrayBuffer(f.nonce);
          if (f.parentId) {
            unwrapAlgorithm = { name: "AES-GCM", iv: nonce } as AesGcmParams;
            unwrapKey = files[f.parentId].key;
          } else {
            unwrapAlgorithm = { name: "RSA-OAEP" } as RsaOaepParams;
            unwrapKey = privateKey;
          }
          if (!unwrapKey) {
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
        queue = next;
      }
      setFiles(tempFiles);
    } catch (err) {
      console.error("Error fetching files:", err);
      setParams(params => {
        params.delete("parentId");
        return params
      });
    }
    setLoading(false);
  };

  // Whenever currentDir or privateKey changes, fetch the files
  useEffect(() => {
    fetchFiles();
  }, [parentId, privateKey]);

  /** Sorting + searching. */
  let filteredFiles;
  if (parentId) {
    filteredFiles = files[parentId]?.children?.filter((childId) =>
      files[childId]?.name?.toLowerCase().includes(search.toLowerCase())
    ).map(id => files[id])
  } else {
    filteredFiles = [...root].filter((childId) =>
      files[childId]?.name?.toLowerCase().includes(search.toLowerCase())
    ).map(id => files[id])
  }
  const sortedFiles = filteredFiles?.sort((a, b) => {
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
      setDirStack([...dirStack, folder.id]);
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
      const last = stack[stack.length - 1];
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
        alert("File moved successfully");
        fetchFiles();
      } else {
        alert("Error moving file");
      }
    } catch (err) {
      console.error("Error moving file:", err);
      alert("Error moving file");
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
          alert("Error deleting file");
        }
      } catch (err) {
        console.error("Error deleting file:", err);
        alert("Error deleting file");
      }
    }
  };

  /** Create a new folder by encrypting the name with the public key. */
  const handleCreateFolder = async () => {
    if (!userPublicKey) {
      alert("User public key not loaded");
      return;
    }
    const folderName = prompt("Enter new folder name:");
    if (!folderName) return;
    try {
      const [aesKey, nonce] = await generateKeyAndNonce();
      let parentKey: CryptoKey;
      let algorithm: AesGcmParams | RsaOaepParams;
      if (parentId) {
        parentKey = files[parentId].key as CryptoKey;
        algorithm = { name: "AES-GCM", iv: nonce }
      } else {
        parentKey = userPublicKey;
        algorithm = { name: "RSA-OAEP" }
      }
      const encryptedName = await encryptText(aesKey, folderName, nonce);
      const encryptedNameB64 = btoa(String.fromCharCode(...encryptedName));
      const encryptedKey = bufferToBase64(await encryptAESKeyWithParentKey(parentKey, aesKey, algorithm));
      const metadata = {
        fileName: folderName,
        encryptedFileName: encryptedNameB64,
        encryptedKey: encryptedKey,
        isDirectory: true,
        nonce: bufferToBase64(nonce.buffer),
        parentId,
      };

      const resp = await API.api.uploadFile({
        metadata,
      });
      if (resp.ok) {
        fetchFiles();
      } else {
        alert("Error creating folder");
      }
    } catch (err) {
      console.error("Error creating folder:", err);
      alert("Error creating folder");
    }
  };

  /** Handle "Upload File" option from the dropdown as a placeholder. */
  function handleNewUploadFile() {
    alert("File upload logic goes here.");
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
              onUpload={(file) => {
                files[file.id] = file;
                if (file.parentId) {
                  files[file.parentId].children?.push(file.id);
                } else {
                  setRoot(new Set([...root, file.id]))
                }
                setFiles(files)
              }}
            />
            <input
              type="text"
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={styles.searchBar}
            />
            <button
              onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")}
              style={styles.toggleButton}
            >
              {viewMode === "list" ? <FaTh /> : <FaList />} Toggle View
            </button>
          </div>
        </header>
        {loading ? (
          <p>Loading files...</p>
        ) : viewMode === "list" ? (
          <table style={{ ...styles.table, borderCollapse: "collapse" }}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.tableHeaderCell}>
                  Name{" "}
                  <button onClick={() => handleSort("name")} style={styles.sortButton}>
                    {sortBy === "name" ? (sortOrder === "asc" ? " ↑" : " ↓") : " ↕"}
                  </button>
                </th>
                <th style={styles.tableHeaderCell}>
                  Created At{" "}
                  <button onClick={() => handleSort("createdAt")} style={styles.sortButton}>
                    {sortBy === "createdAt" ? (sortOrder === "asc" ? " ↑" : " ↓") : " ↕"}
                  </button>
                </th>
                <th style={styles.tableHeaderCell}>
                  Modified At{" "}
                  <button onClick={() => handleSort("modifiedAt")} style={styles.sortButton}>
                    {sortBy === "modifiedAt" ? (sortOrder === "asc" ? " ↑" : " ↓") : " ↕"}
                  </button>
                </th>
                <th style={styles.tableHeaderCell}>Type</th>
                <th style={styles.tableHeaderCell}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedFiles?.map((file) => (
                <FileRow
                  key={`${file.id}-1`}
                  file={file}
                  onOpenFolder={handleOpenFolder}
                  onMove={handleMove}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        ) : (
          <div style={styles.gridContainer}>
            {sortedFiles?.map((file) => (
              <FileGridItem
                key={file.id}
                file={file}
                onOpenFolder={handleOpenFolder}
                onMove={handleMove}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

/** Styles. */
const styles = {
  container: {
    display: "flex",
    height: "100vh",
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
