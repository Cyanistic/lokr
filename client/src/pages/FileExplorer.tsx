import { useState, useEffect } from "react";
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
} from "react-icons/fa";
import { API } from "../utils";
import localforage from "localforage";


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

/** Import RSA public key from base64/PEM */
async function importPublicKey(publicKeyPem: string): Promise<CryptoKey> {
  // Remove headers if present
  const pemBody = publicKeyPem.replace(/-----[^-]+-----/g, "").trim();
  const binaryDer = base64ToArrayBuffer(pemBody);
  return await crypto.subtle.importKey(
    "spki",
    binaryDer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
}

/** Derive AES key from password + salt (base64). */
async function deriveKeyFromPassword(password: string, saltB64: string): Promise<CryptoKey> {
  const salt = base64ToArrayBuffer(saltB64);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 120000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["unwrapKey"]
  );
}

/** Unwrap private key with derived AES key. */
async function unwrapPrivateKey(
  encryptedPrivateKeyB64: string,
  masterKey: CryptoKey,
  ivB64: string
): Promise<CryptoKey | null> {
  try {
    const iv = base64ToArrayBuffer(ivB64);
    const encryptedPrivateKey = base64ToArrayBuffer(encryptedPrivateKeyB64);
    return await crypto.subtle.unwrapKey(
      "pkcs8",
      encryptedPrivateKey,
      masterKey,
      { name: "AES-GCM", iv },
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["decrypt"]
    );
  } catch (err) {
    console.error("Failed to unwrap private key:", err);
    return null;
  }
}

/** Decrypt RSA-encrypted file name with private key. */
async function rsaDecryptFileName(
  encryptedFileNameB64: string,
  privateKey: CryptoKey
): Promise<string> {
  try {
    const buffer = base64ToArrayBuffer(encryptedFileNameB64);
    const decrypted = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      buffer
    );
    return new TextDecoder().decode(new Uint8Array(decrypted));
  } catch (error) {
    console.error("RSA decryption failed:", error);
    return "Decryption failed";
  }
}

/** Encrypt text with user's public key (for new folder creation). */
async function encryptTextWithPublicKey(publicKey: CryptoKey, text: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    encoded
  );
  return new Uint8Array(encrypted);
}

/** Return an icon based on file extension. */
function getFileIcon(fileType: string) {
  const icons: Record<string, JSX.Element> = {
    ".txt": <FaFileAlt />,
    ".png": <FaFileImage />,
    ".jpg": <FaFileImage />,
    ".jpeg": <FaFileImage />,
    ".pdf": <FaFilePdf />,
    ".doc": <FaFileWord />,
    ".docx": <FaFileWord />,
    ".xls": <FaFileExcel />,
    ".xlsx": <FaFileExcel />,
    ".ppt": <FaFilePowerpoint />,
    ".pptx": <FaFilePowerpoint />,
    ".zip": <FaFileArchive />,
    ".rar": <FaFileArchive />,
    ".html": <FaFileCode />,
    ".css": <FaFileCode />,
    ".js": <FaFileCode />,
    ".ts": <FaFileCode />,
  };
  return icons[fileType] || <FaFileAlt />;
}

/** Extract file extension from name. */
function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? `.${parts.pop()}` : "";
}

/** File or folder interface from the server. */
interface FileItem {
  id: string;
  name: string; // Decrypted name
  isDirectory: boolean;
  fileType: string;
  createdAt: string;
  modifiedAt: string;
  parentId?: string;
  encryptedKey?: string;
  nonce?: string;
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
    link.download = "FILE"; // Temporary name for the file
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
  onDecrypt,
  onMove,
  onDelete,
}: {
  file: FileItem;
  onOpenFolder: (file: FileItem) => void;
  onDecrypt: (file: FileItem) => void;
  onMove: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
}) => (
  <tr style={styles.tableRow}>
    <td style={styles.tableCell}>
      {file.isDirectory ? (
        <span onClick={() => onOpenFolder(file)} style={{ cursor: "pointer", color: "blue" }}>
          <FaFolder /> {file.name}
        </span>
      ) : (
        <>
          {getFileIcon(file.fileType)} {file.name}
        </>
      )}
    </td>
    <td style={styles.tableCell}>
      {new Date(file.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })}
    </td>
    <td style={styles.tableCell}>
      {new Date(file.modifiedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })}
    </td>
    <td style={styles.tableCell}>{file.fileType}</td>
    <td style={styles.tableCell}>
      {!file.isDirectory && (
        <>
          <button onClick={() => onDecrypt(file)}>Decrypt</button>
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
  onDecrypt,
  onMove,
  onDelete,
}: {
  file: FileItem;
  onOpenFolder: (file: FileItem) => void;
  onDecrypt: (file: FileItem) => void;
  onMove: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
}) => (
  <div style={{ ...styles.gridItem, color: "black" }}>
    <h3>
      {file.isDirectory ? (
        <span onClick={() => onOpenFolder(file)} style={{ cursor: "pointer", color: "blue" }}>
          <FaFolder /> {file.name}
        </span>
      ) : (
        <>
          {getFileIcon(file.fileType)} {file.name}
        </>
      )}
    </h3>
    <p>Created: {new Date(file.createdAt).toLocaleDateString()}</p>
    <p>Modified: {new Date(file.modifiedAt).toLocaleDateString()}</p>
    <p>Type: {file.fileType}</p>
    {!file.isDirectory && (
      <div>
        <button onClick={() => onDecrypt(file)}>Decrypt</button>
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

  // The list of items in the current directory
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentDir, setCurrentDir] = useState<string | null>(null);
  const [dirStack, setDirStack] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // The user's decrypted private key and public key
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [userPublicKey, setUserPublicKey] = useState<CryptoKey | null>(null);


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
        id: currentDir ?? undefined,
        depth: 1,
        offset: 0,
        limit: 50,
      });
      if (!resp.ok) {
        console.error("Error fetching file metadata:", resp.statusText);
        setLoading(false);
        return;
      }
      const data = await resp.json();

      // data.files: { [fileId]: { ... } }
      // Instead of using data.root, we gather all items from data.files, then filter by parentId
      const allFiles = Object.values(data.files);

      // Filter so that we only show direct children of the currentDir (or the root)
      const filtered = allFiles.filter((f: any) => {
        if (currentDir) {
          return f.parentId === currentDir;
        } else {
          return !f.parentId; // show items that have no parent => root
        }
      });

      // Decrypt each name if we have the private key
      const finalItems = await Promise.all(
        filtered.map(async (f: any) => {
          let decryptedName = "EncryptedFile";
          if (privateKey && f.encryptedFileName) {
            decryptedName = await rsaDecryptFileName(f.encryptedFileName, privateKey);
          }
          return {
            id: f.id,
            name: decryptedName,
            isDirectory: f.isDirectory,
            createdAt: f.createdAt,
            modifiedAt: f.modifiedAt,
            fileType: getFileExtension(decryptedName),
            parentId: f.parentId,
            encryptedKey: f.encryptedKey,
            nonce: f.nonce,
          };
        })
      );
      setFiles(finalItems as FileItem[]);
    } catch (err) {
      console.error("Error fetching files:", err);
    }
    setLoading(false);
  };

  // Whenever currentDir or privateKey changes, fetch the files
  useEffect(() => {
    fetchFiles();
  }, [currentDir, privateKey]);

  /** Sorting + searching. */
  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(search.toLowerCase())
  );
  const sortedFiles = [...filteredFiles].sort((a, b) => {
    let comparison = 0;
    if (sortBy === "name") {
      comparison = a.name.localeCompare(b.name);
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
  const handleOpenFolder = (folder: FileItem) => {
    if (folder.isDirectory) {
      setDirStack([...dirStack, currentDir || ""]);
      setCurrentDir(folder.id);
    }
  };
  const handleGoBack = () => {
    const stack = [...dirStack];
    const prev = stack.pop() || null;
    setDirStack(stack);
    setCurrentDir(prev);
  };

  /** Placeholder "decrypt file content" handler. */
  const handleDecrypt = (file: FileItem) => {
    alert(
      `Decrypting file: ${file.name}\nEncrypted key: ${file.encryptedKey}\nNonce: ${file.nonce}`
    );
  };

  /** Move a file to a new parent. */
  const handleMove = async (file: FileItem) => {
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
  const handleDelete = async (file: FileItem) => {
    if (window.confirm(`Are you sure you want to delete "${file.name}"?`)) {
      try {
        const resp = await API.api.deleteFile(file.id);
        if (resp.ok) {
          alert("File deleted successfully");
          fetchFiles();
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
      const encryptedName = await encryptTextWithPublicKey(userPublicKey, folderName);
      const encryptedNameB64 = btoa(String.fromCharCode(...encryptedName));
      const metadata = {
        fileName: folderName,
        encryptedFileName: encryptedNameB64,
        encryptedKey: "",
        encryptedMimeType: "",
        isDirectory: true,
        nonce: "",
        parentId: currentDir,
      };
      const formData = new FormData();
      formData.append("metadata", JSON.stringify(metadata));

      const resp = await API.api.uploadFile({
        metadata,
      });
      if (resp.ok) {
        alert("Folder created successfully");
        fetchFiles();
      } else {
        alert("Error creating folder");
      }
    } catch (err) {
      console.error("Error creating folder:", err);
      alert("Error creating folder");
    }
  };

  return (
    <div style={styles.container}>
      <aside style={styles.sidebar}>
        <h2>My Drive</h2>
        <ul style={styles.navList}>
          <li
            style={styles.navItem}
            onClick={() => {
              setCurrentDir(null);
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
      </aside>
      <main style={styles.mainContent}>
        <header style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <h1 style={styles.title}>Files</h1>
          <button onClick={handleCreateFolder} style={styles.newFolderButton}>
            New Folder
          </button>
          <div style={styles.controls}>
            <Upload />
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
              {sortedFiles.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  onOpenFolder={handleOpenFolder}
                  onDecrypt={handleDecrypt}
                  onMove={handleMove}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        ) : (
          <div style={styles.gridContainer}>
            {sortedFiles.map((file) => (
              <FileGridItem
                key={file.id}
                file={file}
                onOpenFolder={handleOpenFolder}
                onDecrypt={handleDecrypt}
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
  },
  navItem: {
    padding: "10px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    cursor: "pointer",
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
};
