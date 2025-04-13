import React, { useState } from "react";
import { BASE_URL } from "../utils";
import { useToast } from "../components/ToastProvider";
import { Box, Typography, Button, Avatar } from "@mui/material";

type AvatarUploadProps = {
  avatarUrl: string;
  onAvatarChange: (url: string) => void;
};

const AvatarUpload: React.FC<AvatarUploadProps> = ({
  avatarUrl,
  onAvatarChange,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showError } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files ? e.target.files[0] : null;

    if (selectedFile) {
      const validTypes = /^image\/.*$/;

      if (validTypes.test(selectedFile.type)) {
        setFile(selectedFile);
        setError(null); // Reset error if file type is valid
      } else {
        showError("Please upload a valid image file file.");
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      showError("No file selected. Please select an avatar image to upload.");
      return;
    }

    try {
      // Tried to make this work with the new api but it just doesn't
      // want to work so let's just leave it like this
      const response = await fetch(`${BASE_URL}/api/profile/upload`, {
        method: "PUT",
        body: file,
        credentials: import.meta.env.DEV ? "include" : "same-origin",
      });

      if (!response.ok) throw await response.json();

      const data: { extension: string } = await response.json();
      onAvatarChange(data.extension);
    } catch (err) {
      showError("Failed to upload the image. Please try again.", err);
    }
  };

  return (
    <Box sx={{ textAlign: "center" }}>
      <Avatar 
        src={avatarUrl}
        alt="Avatar"
        sx={{ 
          width: 256, 
          height: 256, 
          display: "none", 
          mb: 2.5,
          mx: "auto"
        }}
      />
      <Box sx={{ mb: 2.5 }}>
        <Button
          component="label"
          variant="contained"
          htmlFor="avatar-upload"
        >
          Choose File
          <input
            id="avatar-upload"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </Button>
        {file && (
          <Typography 
            variant="body2" 
            component="span" 
            sx={{ 
              ml: 1.25, 
              color: "text.secondary" 
            }}
          >
            {file.name}
          </Typography>
        )}
      </Box>
      {error && (
        <Typography 
          variant="body2" 
          color="error" 
          sx={{ mb: 2.5 }}
        >
          {error}
        </Typography>
      )}
      <Button
        variant="contained"
        onClick={handleUpload}
        sx={{
          mt: 1.25,
          fontSize: "1rem",
          px: 2.5,
          py: 1.25,
        }}
      >
        Upload Avatar
      </Button>
    </Box>
  );
};

export default AvatarUpload;
