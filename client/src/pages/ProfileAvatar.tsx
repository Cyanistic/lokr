import React, { useState } from "react";
import { BASE_URL } from "../utils";
import { useErrorToast } from "../components/ErrorToastProvider";

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
  const { showError } = useErrorToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files ? e.target.files[0] : null;

    if (selectedFile) {
      const validTypes = ["image/png", "image/jpeg"];

      if (validTypes.includes(selectedFile.type)) {
        setFile(selectedFile);
        setError(null); // Reset error if file type is valid
      } else {
        showError("Please upload a PNG or JPG file.");
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
    } catch (err: any) {
      showError("Failed to upload the image. Please try again.", err);
    }
  };

  return (
    <div style={{ textAlign: "center" }}>
      <img
        src={avatarUrl}
        alt="Avatar"
        width={256}
        height={256}
        style={{ marginBottom: "20px" }} // Add space below the image
      />
      <div style={{ marginBottom: "20px" }}>
        <input
          type="file"
          accept="image/png, image/jpeg"
          onChange={handleFileChange}
        />
      </div>
      {error && <p style={{ color: "red", marginBottom: "20px" }}>{error}</p>}{" "}
      {/* Error spacing */}
      <button
        className="b1"
        onClick={handleUpload}
        style={{
          padding: "10px 20px",
          fontSize: "16px",
          cursor: "pointer",
          marginTop: "10px", // Add space above the button
        }}
      >
        Upload Avatar
      </button>
      {/*<Button variant="contained" 
        onClick={handleUpload} 
        style={{padding: "10px 20px",
          fontSize: "16px",
          cursor: "pointer",
          marginTop: "10px", 
          backgroundColor: theme.palette.mode === 'dark' ? '#2f27ce': '#3a31d8', 
          color: theme.palette.mode === 'dark' ? '#050316' : '#eae9fc', 
          textTransform: 'none'}}
        >Upload Avatar
      </Button>*/}
    </div>
  );
};

export default AvatarUpload;
