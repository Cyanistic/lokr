import { useState } from "react";
import Upload from "./Upload";
import { FaFolder, FaClock, FaUsers, FaTh, FaList, FaFileAlt, FaFileImage, FaFilePdf, FaFileWord, FaFileExcel, FaFilePowerpoint, FaFileArchive, FaFileCode } from "react-icons/fa";

const getFileIcon = (fileType: string) => {
    switch (fileType) {
        case ".txt": return <FaFileAlt />;
        case ".png":
        case ".jpg":
        case ".jpeg": return <FaFileImage />;
        case ".pdf": return <FaFilePdf />;
        case ".doc":
        case ".docx": return <FaFileWord />;
        case ".xls":
        case ".xlsx": return <FaFileExcel />;
        case ".ppt":
        case ".pptx": return <FaFilePowerpoint />;
        case ".zip":
        case ".rar": return <FaFileArchive />;
        case ".html":
        case ".css":
        case ".js":
        case ".ts": return <FaFileCode />;
        default: return <FaFileAlt />;
    }
};

export default function FileExplorer() {
    const [search, setSearch] = useState("");
    const [sortBy, setSortBy] = useState("name");
    const [sortOrder, setSortOrder] = useState("asc");
    const [viewMode, setViewMode] = useState("list");

    const handleSort = (column: "name" | "size" | "uploadDate") => {
        if (sortBy === column) {
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        } else {
            setSortBy(column);
            setSortOrder("asc");
        }
    };

    const sortedFiles = [...files].sort((a, b) => {
        let comparison = 0;
        if (sortBy === "name") comparison = a.name.localeCompare(b.name);
        if (sortBy === "size") comparison = a.size - b.size;
        if (sortBy === "uploadDate") comparison = new Date(a.uploadDate).getTime() - new Date(b.uploadDate).getTime();
        return sortOrder === "asc" ? comparison : -comparison;
    });

    return (
        <div style={styles.container}>
            <div style={styles.sidebar}>
                <h2>My Drive</h2>
                <ul style={styles.navList}>
                    <li style={styles.navItem}><FaFolder /> My Files</li>
                    <li style={styles.navItem}><FaUsers /> Shared with me</li>
                    <li style={styles.navItem}><FaClock /> Recent</li>
                </ul>
            </div>

            <div style={styles.mainContent}>
                <h1 style={styles.title}>Files</h1>
                <div style={styles.uploadSection}><Upload /></div>
                <input
                    type="text"
                    placeholder="Search files..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={styles.searchBar}
                />
                <button onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")} style={styles.toggleButton}>
                    {viewMode === "list" ? <FaTh /> : <FaList />} Toggle View
                </button>

                {viewMode === "list" ? (
                    <table style={{ ...styles.table, borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ ...styles.tableHeader, textAlign: "left" }}>
                                <th>Name <button onClick={() => handleSort("name")} style={styles.sortButton}>{sortBy === "name" ? (sortOrder === "asc" ? " ↑" : " ↓") : " ↕"}</button></th>
                                <th>Size (MB) <button onClick={() => handleSort("size")} style={styles.sortButton}>{sortBy === "size" ? (sortOrder === "asc" ? " ↑" : " ↓") : " ↕"}</button></th>
                                <th>Date Uploaded <button onClick={() => handleSort("uploadDate")} style={styles.sortButton}>{sortBy === "uploadDate" ? (sortOrder === "asc" ? " ↑" : " ↓") : " ↕"}</button></th>
                                <th>Type</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedFiles.filter(file => file.name.toLowerCase().includes(search.toLowerCase())).map(file => (
                                <tr key={file.id} style={styles.tableRow}>
                                    <td>{getFileIcon(file.fileType)} {file.name}</td>
                                    <td>{file.size}</td>
                                    <td>{file.uploadDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</td>
                                    <td>{file.fileType}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div style={styles.gridContainer}>
                        {sortedFiles.filter(file => file.name.toLowerCase().includes(search.toLowerCase())).map(file => (
                            <div key={file.id} style={{ ...styles.gridItem, textAlign: "center", color: "black", backgroundColor: "white" }}>
                                <h3>{getFileIcon(file.fileType)} {file.name}</h3>
                                <p>{file.fileType}</p>
                                <p>{file.size} MB</p>
                                <p>{file.uploadDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

const styles = {
    container: { display: "flex", height: "100vh", backgroundColor: "#f8f9fa" },
    sidebar: { width: "250px", padding: "20px", backgroundColor: "#fff", boxShadow: "2px 0px 5px rgba(0,0,0,0.1)" },
    navList: { listStyle: "none", padding: 0 },
    navItem: { padding: "10px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" },
    mainContent: { flex: 1, padding: "20px" },
    title: { color: "black", fontSize: "2rem", fontWeight: "bold" },
    uploadSection: { marginBottom: "10px" },
    searchBar: { width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #ccc" },
    toggleButton: { marginBottom: "10px", padding: "5px 10px", cursor: "pointer", borderRadius: "4px", border: "none", backgroundColor: "#007bff", color: "white" },
    table: { width: "100%", borderCollapse: "collapse", marginTop: "20px" },
    tableHeader: { backgroundColor: "#f1f1f1", padding: "10px", textAlign: "left" },
    tableRow: { borderBottom: "1px solid #ddd", height: "40px" },
    sortButton: { background: "none", border: "none", cursor: "pointer" },
    gridContainer: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "10px", marginTop: "20px" },
    gridItem: { padding: "10px", border: "1px solid #ccc", borderRadius: "4px", backgroundColor: "#fff", textAlign: "center" }
};

const files = [
    { id: 1, name: "Homework2", size: 25, uploadDate: new Date("2024-02-03"), fileType: ".doc" },
    { id: 2, name: "Test", size: 1000, uploadDate: new Date("2024-02-02"), fileType: ".txt" },
    { id: 3, name: "Homework1", size: 50, uploadDate: new Date("2024-02-04"), fileType: ".doc" },
];
