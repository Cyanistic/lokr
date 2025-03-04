import { useState } from "react";
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

// Returns the appropriate icon for a given file type.
const getFileIcon = (fileType: string) => {
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
};
// Function to handle file download
// @ts-ignore
const handleDownload = async (fileId: string) => {
    try {
        const response = await fetch(`http://localhost:6969/api/file/data/${fileId}`, {
            method: "GET",
            credentials: "include", 
        });

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

interface File {
  id: number;
  name: string;
  size: number;
  uploadDate: Date;
  fileType: string;
}

const files: File[] = [
  {
    id: 1,
    name: "Homework2",
    size: 25,
    uploadDate: new Date("2024-02-03"),
    fileType: ".doc",
  },
  {
    id: 2,
    name: "Test",
    size: 1000,
    uploadDate: new Date("2024-02-02"),
    fileType: ".txt",
  },
  {
    id: 3,
    name: "Homework1",
    size: 50,
    uploadDate: new Date("2024-02-04"),
    fileType: ".png",
  },
];

// Updated: Added `style={styles.tableCell}` to each <td> for proper alignment
const FileRow = ({ file }: { file: File }) => (
  <tr style={styles.tableRow}>
    <td style={styles.tableCell}>
      {getFileIcon(file.fileType)} {file.name}
    </td>
    <td style={styles.tableCell}>{file.size}</td>
    <td style={styles.tableCell}>
      {file.uploadDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })}
    </td>
    <td style={styles.tableCell}>{file.fileType}</td>
  </tr>
);

const FileGridItem = ({ file }: { file: File }) => (
  <div style={{ ...styles.gridItem, color: "black" }}>
    <h3>
      {getFileIcon(file.fileType)} {file.name}
    </h3>
    <p>{file.fileType}</p>
    <p>{file.size} MB</p>
    <p>
      {file.uploadDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })}
    </p>
  </div>
);



export default function FileExplorer() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "size" | "uploadDate">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const handleSort = (column: "name" | "size" | "uploadDate") => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  // Filter then sort files.
  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(search.toLowerCase())
  );

  const sortedFiles = [...filteredFiles].sort((a, b) => {
    let comparison = 0;
    if (sortBy === "name") {
      comparison = a.name.localeCompare(b.name);
    } else if (sortBy === "size") {
      comparison = a.size - b.size;
    } else if (sortBy === "uploadDate") {
      comparison = a.uploadDate.getTime() - b.uploadDate.getTime();
    }
    return sortOrder === "asc" ? comparison : -comparison;
  });

  return (
    <div style={styles.container}>
      <aside style={styles.sidebar}>
        <h2>My Drive</h2>
        <ul style={styles.navList}>
          <li style={styles.navItem}>
            <FaFolder /> My Files
          </li>
          <li style={styles.navItem}>
            <FaUsers /> Shared with me
          </li>
          <li style={styles.navItem}>
            <FaClock /> Recent
          </li>
        </ul>
      </aside>
      <main style={styles.mainContent}>
        <header>
          <h1 style={styles.title}>Files</h1>
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
        {viewMode === "list" ? (
          <table style={{ ...styles.table, borderCollapse: "collapse" }}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.tableHeaderCell}>
                  Name{" "}
                  <button
                    onClick={() => handleSort("name")}
                    style={styles.sortButton}
                  >
                    {sortBy === "name" ? (sortOrder === "asc" ? " ↑" : " ↓") : " ↕"}
                  </button>
                </th>
                <th style={styles.tableHeaderCell}>
                  Size (MB)
                  <button
                    onClick={() => handleSort("size")}
                    style={styles.sortButton}
                  >
                    {sortBy === "size" ? (sortOrder === "asc" ? " ↑" : " ↓") : " ↕"}
                  </button>
                </th>
                <th style={styles.tableHeaderCell}>
                  Date Uploaded
                  <button
                    onClick={() => handleSort("uploadDate")}
                    style={styles.sortButton}
                  >
                    {sortBy === "uploadDate"
                      ? sortOrder === "asc"
                        ? " ↑"
                        : " ↓"
                      : " ↕"}
                  </button>
                </th>
                <th style={styles.tableHeaderCell}>Type</th>
              </tr>
            </thead>
            <tbody>
              {sortedFiles.map((file) => (
                <FileRow key={file.id} file={file} />
              ))}
            </tbody>
          </table>
        ) : (
          <div style={styles.gridContainer}>
            {sortedFiles.map((file) => (
              <FileGridItem key={file.id} file={file} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

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
