import { useState } from "react";

export default function FileExplorer() {
    const [search, setSearch] = useState("");
    const [sortBy, setSortBy] = useState<"name" | "size" | "uploadDate">("name");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

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
        <div style={styles.main}>
            <h1 style={styles.title}>Files</h1>
            <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={styles.searchBar}
            />

            <table style={styles.table}>
                <thead>
                    <tr style={styles.tableHeader}>
                        <th>
                            Name
                            <button style={styles.sortButton} onClick={() => handleSort("name")}>
                                {sortBy === "name" ? (sortOrder === "asc" ? " ^" : " v") : " ↕"}
                            </button>
                        </th>
                        <th>
                            Size (MB)
                            <button style={styles.sortButton} onClick={() => handleSort("size")}>
                                {sortBy === "size" ? (sortOrder === "asc" ? " ^" : " v") : " ↕"}
                            </button>
                        </th>
                        <th>
                            Date Uploaded
                            <button style={styles.sortButton} onClick={() => handleSort("uploadDate")}>
                                {sortBy === "uploadDate" ? (sortOrder === "asc" ? " ^" : " v") : " ↕"}
                            </button>
                        </th>
                        <th>Type</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedFiles
                        .filter((file) => file.name.toLowerCase().includes(search.toLowerCase()))
                        .map((file) => (
                            <tr key={file.id} style={styles.tableRow}>
                                <td>{file.name}</td>
                                <td>{file.size}</td>
                                <td>{file.uploadDate.toDateString()}</td>
                                <td>{file.fileType}</td>
                            </tr>
                        ))}
                </tbody>
            </table>
        </div>
    );
}

interface File {
    id: number;
    name: string;
    size: number;
    uploadDate: Date;
    fileType: string;
}

const files: File[] = [
    { id: 1, name: "Homework2", size: 25, uploadDate: new Date("2024-02-03"), fileType: ".doc" },
    { id: 2, name: "Test", size: 1000, uploadDate: new Date("2024-02-02"), fileType: ".txt" },
    { id: 3, name: "Homework1", size: 50, uploadDate: new Date("2024-02-04"), fileType: ".doc" },
];

const styles = {
    main: {
        width: "80%",
        margin: "2rem auto",
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        textAlign: "center" as const,
        padding: "1rem",
        gap: "1rem",
        backgroundColor: "#f8f9fa",
        borderRadius: "8px",
        boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.1)",
    },
    title: {
        color: "#007bff",
        fontSize: "2rem",
        fontWeight: "bold",
    },
    searchBar: {
        width: "50%",
        padding: "0.5rem",
        border: "1px solid #ccc",
        borderRadius: "4px",
        fontSize: "1rem",
    },
    table: {
        width: "100%",
        borderCollapse: "collapse" as const,
        background: "white",
        marginTop: "1rem",
        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
    },
    tableHeader: {
        backgroundColor: "#007bff",
        color: "white",
    },
    tableRow: {
        borderBottom: "1px solid #ddd",
        textAlign: "left" as const,
    },
    sortButton: {
        marginLeft: "5px",
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: "1rem",
    },
};
