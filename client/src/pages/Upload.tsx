import React, { useState } from 'react';

export default function Upload() {

  interface FileMetadata {
    name: string;
    isDirectory: boolean;
  }

    const [files, setFile] = useState<File[]>([]);
    const [fileMeta, setFileMeta] = useState<FileMetadata[]>([]);
    const [uploadStatus, setUploadStatus] = useState<string>('');
      
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFiles = e.target.files; //? e.target.files[0] : null;
        if (uploadedFiles && uploadedFiles.length > 0) {

          //const isDirectory = uploadedFile.webkitRelativePath ? true : false;

          setFile(Array.from(uploadedFiles));

          const metadata: FileMetadata[] = Array.from(uploadedFiles).map(uploadedFile => {
            // Check if the file is part of a directory (directories usually have the 'webkitRelativePath' attribute)
            const isDirectory = uploadedFile.webkitRelativePath ? true : false;
            return {
              name: uploadedFile.name,
              isDirectory: isDirectory,
            };
          });

          // Access basic metadata
          //const fileName = uploadedFile.name;

          // Store the metadata in state
          setFileMeta(
            //name: fileName,
            //isDirectory: isDirectory,
            metadata
          );
        }
    };
      
    const handleSubmit = async () => {
        // Here you can handle file upload logic (e.g., sending to server)

        setUploadStatus('Uploading...');

        
        if (files.length === 0) {
          console.log('No file selected');
          setUploadStatus('No file selected');
          return;
        }

        console.log('File ready to upload:', files);

        // Create a metadata object
        for (const file of files){
          const metadata = {
            fileName: file.name,
            encryptedFileName: "c3RyaW5n",
            encryptedKey: "c3RyaW5n",
            encryptedMimeType: "c3RyaW5n",
            isDirectory: fileMeta.find(meta => meta.name === file.name)?.isDirectory || false,
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
                setUploadStatus('File uploaded successfully!');
              } else {
                console.log('File upload failed');
                setUploadStatus('File upload failed. Please try again.');
              }
          } catch (error) {
              console.error('Error during file upload', error);
              setUploadStatus('Error during file upload.');
          }

        }

    };


    return (
        <div className="uploadMain">

            <div className="uploadFile">
                <div>
                    <input type="file" onChange={handleFileChange} multiple/>
                    {files.length > 0 && (
                      <div>
                        <p>Selected {files.length} file(s):</p>
                        <ul>
                          {files.map((file, index) => (
                            <li key={index}>
                              {fileMeta.find(meta => meta.name === file.name)?.isDirectory ? 'Folder: ' : 'File: '}
                              {file.name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <button onClick={handleSubmit}>Upload</button>

                    {/* Display the upload status */}
                    {uploadStatus && <p>{uploadStatus}</p>}
                </div>
            </div>

        </div>
    );

}