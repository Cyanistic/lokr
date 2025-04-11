import React, { useState, useRef } from "react";
import { Box, Button, Typography, Container } from "@mui/material";
import FilePreviewModal from "../components/FilePreviewModal";

const TestPreviewPage: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const fileObj = {
        name: file.name,
        type: file.type,
        url: URL.createObjectURL(file),
      };
      setSelectedFile(fileObj);
      setIsModalOpen(true);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    if (selectedFile?.url?.startsWith("blob:")) {
      URL.revokeObjectURL(selectedFile.url);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "linear-gradient(to bottom, #0044cc, #000066)",
        color: "white",
        py: 10,
        textAlign: "center",
      }}
    >
      <Container maxWidth="sm">
        <Typography variant="h3" fontWeight="bold" gutterBottom>
          File Preview Test Page
        </Typography>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          style={{ display: "none" }}
        />

        <Button
          variant="contained"
          onClick={triggerFileInput}
          sx={{
            mt: 4,
            fontWeight: 600,
            fontSize: "1rem",
            px: 4,
            py: 2,
            backgroundColor: "#fff",
            color: "#0050c5",
            "&:hover": {
              backgroundColor: "#f0f0f0",
            },
          }}
        >
          Select File to Preview
        </Button>
      </Container>

      <FilePreviewModal
        open={isModalOpen}
        onClose={closeModal}
        file={selectedFile}
      />
    </Box>
  );
};

export default TestPreviewPage;

