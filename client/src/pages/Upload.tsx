import React, { useState } from 'react';

interface FileMetadata {
  name: string;
}

export default function Upload() {

    const [file, setFile] = useState<File | null>(null);
    const [fileMeta, setFileMeta] = useState<FileMetadata | null>(null);
      
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFile = e.target.files? e.target.files[0] : null;
        if (uploadedFile) {
          setFile(uploadedFile);

          // Access basic metadata
          const fileName = uploadedFile.name;

          // Store the metadata in state
          setFileMeta({
            name: fileName,
          });
        }
    };
      
    const handleSubmit = async () => {
        // Here you can handle file upload logic (e.g., sending to server)
        if (file) {
          console.log('File ready to upload:', file);
        } else {
          console.log('No file selected');
          return;
        }

        // Create a metadata object
        const metadata = {
          fileName: fileMeta?.name,
          encryptedFileName: "c3RyaW5n",
          encryptedKey: "c3RyaW5n",
          encryptedMimeType: "c3RyaW5n",
          isDirectory: false,
          nonce: "c3RyaW5n",
          parentId: null
        };


        const formData = new FormData();
        // Convert the metadata object to a JSON string
        const metadataJSON = JSON.stringify(metadata);

        formData.append('file', file);
        formData.append('metadata', metadataJSON);

        try {
            const response = await fetch('http://localhost:6969/api/upload', {
              method: 'POST',
              body: formData,
            });
      
            if (response.ok) {
              console.log('File uploaded successfully');
            } else {
              console.log('File upload failed');
            }
        } catch (error) {
            console.error('Error during file upload', error);
        }
    };


    return (
        <div className="uploadMain">
            <h1>Upload Page test</h1>

            <div className="uploadFile">
                <div>
                    <input type="file" onChange={handleFileChange} />
                    {file && (
                        <div>
                            <p>Selected file: {file.name}</p>
                        </div>
                    )}
                    <button onClick={handleSubmit}>Upload</button>
                </div>
            </div>

        </div>



    );

}