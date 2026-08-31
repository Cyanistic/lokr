import React, { useState, useRef } from "react";
import { Box, Button, Typography, Container } from "@mui/material";
import FilePreviewModal from "../components/FilePreviewModal";
import type { FileMetadata } from "../types";

const TestPreviewPage: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileMetadata | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const blobUrl = URL.createObjectURL(file);
      const fileObj: FileMetadata = {
        id: file.name,
        encryptedFileName: file.name,
        encryptedKey: "",
        isDirectory: false,
        nameNonce: "",
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        size: file.size,
        mimeType: file.type,
        name: file.name,
        blobUrl,
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
    if (selectedFile?.blobUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(selectedFile.blobUrl);
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
        <Typography variant="h3" sx={{ fontWeight: "bold" }} gutterBottom>
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
        file={selectedFile ?? undefined}
      />
    </Box>
  );
};

export default TestPreviewPage;

