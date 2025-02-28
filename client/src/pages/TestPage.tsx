import React, { useState } from "react";
import ShareModal from "../components/ShareModal";

const TestPage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Test Page for ShareModal</h1>
      <button onClick={() => setModalOpen(true)} style={styles.openButton}>
        Open Share Modal
      </button>

      <ShareModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
};

// 🔹 Styles for the test page
const styles: { [key: string]: React.CSSProperties } = {
  page: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background: "linear-gradient(to bottom, #0044cc, #000066)",
    color: "white",
  },
  title: {
    fontSize: "32px",
    fontWeight: "bold",
  },
  openButton: {
    backgroundColor: "#000",
    color: "white",
    border: "none",
    padding: "12px 20px",
    borderRadius: "5px",
    cursor: "pointer",
    marginTop: "20px",
  },
};

export default TestPage;
