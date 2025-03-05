import React, { useState, useEffect, useRef } from "react";
import { fetchUsernames } from "../utils";

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
}

const ShareModal: React.FC<ShareModalProps> = ({ open, onClose }) => {
  const [file, setFile] = useState<File | null>(null);
  const [username, setUsername] = useState("");
  const [permission, setPermission] = useState("viewer");
  const [filteredUsers, setFilteredUsers] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch usernames from API for autocomplete
  useEffect(() => {
    if (username.length >= 3) {
      fetchUsernames(username, 10, 0);
    } else {
      setFilteredUsers([]); // Clear dropdown if input is too short
    }
  }, [username]);

  // Close dropdown if clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setFilteredUsers([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle username selection
  const handleSelectUsername = (selectedUsername: string) => {
    setUsername(selectedUsername);
    setFilteredUsers([]); // Close dropdown immediately
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    }
  };

  const handleShare = () => {
    if (!file) {
      alert("Please select a file to share.");
      return;
    }

    if (!username) {
      alert("Please enter a username.");
      return;
    }

    const shareData = {
      fileName: file.name,
      username,
      permission,
    };

    console.log("Sharing file with data:", shareData);
    onClose();
  };

  if (!open) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2 style={styles.header}>
          <span role="img" aria-label="folder" style={{ marginRight: "8px" }}>📁</span>
          File Sharing
        </h2>

        {/* File Input */}
        <input type="file" onChange={handleFileChange} style={styles.input} />

        {/* Username Input with Autocomplete */}
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <input
            type="text"
            placeholder="Add username..."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={styles.input}
          />
          {filteredUsers.length > 0 && (
            <ul style={styles.autocomplete}>
              {filteredUsers.map((user, index) => (
                <li
                  key={index}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevents input from losing focus
                    handleSelectUsername(user);
                  }}
                >
                  {user}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Permission Dropdown */}
        <select value={permission} onChange={(e) => setPermission(e.target.value)} style={styles.input}>
          <option value="viewer">Viewer (Can only view)</option>
          <option value="editor">Editor (Can edit)</option>
        </select>

        {/* Buttons */}
        <div style={styles.buttonContainer}>
          <button onClick={handleShare} style={styles.shareButton}>Share</button>
          <button onClick={onClose} style={styles.cancelButton}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

// 🔹 Styles
const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modal: {
    backgroundColor: "#fff",
    padding: "20px",
    borderRadius: "10px",
    width: "400px",
    textAlign: "center",
    boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.3)",
  },
  header: {
    fontSize: "22px",
    fontWeight: "bold",
    color: "#0044cc",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e6e6e6",
    padding: "10px",
    borderRadius: "5px",
  },
  input: {
    width: "calc(100% - 20px)",
    padding: "10px",
    margin: "8px 0",
    borderRadius: "5px",
    border: "1px solid #ccc",
    backgroundColor: "#f9f9f9",
    color: "#000",
    display: "block",
    textAlign: "left",
  },
  buttonContainer: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: "10px",
  },
  shareButton: {
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    padding: "10px 15px",
    borderRadius: "5px",
    cursor: "pointer",
    fontWeight: "bold",
  },
  cancelButton: {
    backgroundColor: "#ccc",
    color: "black",
    border: "none",
    padding: "10px 15px",
    borderRadius: "5px",
    cursor: "pointer",
    fontWeight: "bold",
  },
  autocomplete: {
    listStyle: "none",
    padding: "0",
    backgroundColor: "#fff",
    border: "1px solid #ccc",
    position: "absolute",
    width: "calc(100% - 20px)",
    zIndex: 1000,
    color: "#000",
    textAlign: "left",
  },
};

export default ShareModal;
