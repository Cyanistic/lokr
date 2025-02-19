import React, { useState, useEffect } from "react";

type AvatarUploadProps = {
  avatarUrl: string;
  onAvatarChange: (url: string) => void;
};

const AvatarUpload: React.FC<AvatarUploadProps> = ({ avatarUrl, onAvatarChange }) => {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setuser] = useState<{username: string; email: string | null; id: string; avatarExtension: string} | null>(null);
  //const urlString = "";
  
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

  useEffect(() =>{
    fetch("http://localhost:6969/api/profile", {
        credentials: "include",
        headers: {Cookie: "session=8d45205b-2eb4-4490-a728-654d03d1b67f;"} //Ensures cookies are sent
    })

    .then((response) => {
        if (!response.ok){
            throw new Error("Failed to fetch user data");
        }
        return response.json();
    })
    .then ((data) => {setuser(data)})
    .catch((err) => setError(err.message))
  }, []);
  
  const handleUpload = async () => {
    if (!file) {
      setError("No file selected.");
      return;
    }

    // Convert file to raw binary data using FileReader
    //const reader = new FileReader();
    // Read the file as binary string (or data URL)
    //reader.readAsArrayBuffer(file);  // Convert to raw binary data

    //reader.onloadend = async () => {
       //const binaryData = reader.result as ArrayBuffer;
       // Create FormData and append the raw binary data as a blob
       
       
    //}
    //const formData = new FormData();
    //formData.append("data-binary", new Blob([binaryData]));  // Adding Blob with raw binary data

    const getAvatarUrl = (id: string, avatarExtension: string | null) => {
      if (id && avatarExtension) {
        return `http://localhost:6969/api/avatars/${id}.${avatarExtension}`; // Construct the URL using user.id and user.avatarExtension
      } else {
        return "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png"; // Default avatar URL
      }
    };
    
    try {
      const response = await fetch("http://localhost:6969/api/profile/upload", {
        method: "PUT",
        body: file,
      });

      if (!response.ok) {
        throw new Error("Failed to upload the image. Please try again.");
      }

      //const data = await response.json();
      //onAvatarChange(getAvatarUrl(user!.id, user?.avatarExtension)); // Update avatar URL
      //const [error, setError] = useState<string | null>(null);
      
      setError(null);
    } catch (err: any) {
      setError(err.message || "An unknown error occurred.");
    }
    
    onAvatarChange(getAvatarUrl(user!.id, file.type.split("/")[1]))
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