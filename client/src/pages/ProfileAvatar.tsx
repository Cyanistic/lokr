import React, { useState } from "react";
import { BASE_URL } from "../utils";

type AvatarUploadProps = {
  avatarUrl: string;
  onAvatarChange: (url: string) => void;
};

const AvatarUpload: React.FC<AvatarUploadProps> = ({ avatarUrl, onAvatarChange }) => {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files ? e.target.files[0] : null;

    if (selectedFile) {
      const validTypes = ["image/png", "image/jpeg"];

      if (validTypes.includes(selectedFile.type)) {
        setFile(selectedFile);
        setError(null); // Reset error if file type is valid
      } else {
        setError("Please upload a PNG or JPG file.");
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("No file selected.");
      return;
    }

    try {
      const response = await fetch(`${BASE_URL}/api/profile/upload`, {
        method: "PUT",
        body: file,
      });

      if (!response.ok) {
        throw new Error("Failed to upload the image. Please try again.");
      }

      const data: { extension: string } = await response.json();
      onAvatarChange(data.extension);
      // onAvatarChange(`${getAvatarUrl(user!.id, data.extension)}?v=${Math.random()}`)
      setError(null);
    } catch (err: any) {
      setError(err.message || "An unknown error occurred.");
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
      {error && <p style={{ color: "red", marginBottom: "20px" }}>{error}</p>} {/* Error spacing */}
      <button
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
    </div>
  );
};

export default AvatarUpload;
