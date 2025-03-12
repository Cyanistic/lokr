import React, { useState, useEffect } from 'react';
import {Button, useTheme} from '@mui/material';
import { Fab, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

export default function Upload() {

  interface FileMetadata {
    name: string;
    isDirectory: boolean;
  }

  const [files, setFile] = useState<File[]>([]);
  const [fileMeta, setFileMeta] = useState<FileMetadata[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [userPublicKey, setUserPublicKey] = useState<CryptoKey | null>(null);


  // Function to fetch the user's profile (including the public key) from the server
  const fetchUserProfile = async () => {
    try {
      const response = await fetch('http://localhost:6969/api/profile', {
        method: 'GET',
      });

      if (response.ok) {
        const data = await response.json();
        const publicKeyPem = data.publicKey; // Assuming the public key is in the profile data

        const cryptoKey = await importPublicKey(publicKeyPem);
        setUserPublicKey(cryptoKey); // Store the user's public key
      } else {
        console.error('Failed to fetch user profile');
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  // Function to import the PEM-formatted public key into a CryptoKey object
  const importPublicKey = async (pem: string): Promise<CryptoKey> => {
    const binaryDer = str2ab(pem); // Convert PEM to ArrayBuffer
    return await window.crypto.subtle.importKey(
      'spki',
      binaryDer,
      { name: 'RSA-OAEP', hash: { name: 'SHA-256' } },
      false,
      ['encrypt', 'wrapKey']
    );
  };

  // Convert PEM string to ArrayBuffer
  function str2ab(str: string): ArrayBuffer {
    const binaryString = window.atob(str.replace(/-----.*-----/g, ""));
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Fetch the user's public key when the component mounts
  useEffect(() => {
    fetchUserProfile();
  }, []);

  // Function to generate a random AES key
  const generateAESKey = async (): Promise<CryptoKey> => {
    return await window.crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      true,
      ['encrypt', 'decrypt', "wrapKey", "unwrapKey"]
    );
  };

  // Function to encrypt text using the public key
  const encryptTextWithPublicKey = async (publicKey: CryptoKey, text: string): Promise<Uint8Array> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      data
    );
    return new Uint8Array(encrypted);
  };

  // Function to encrypt the file content using AES and return the encrypted file
  const encryptFileWithAES = async (aesKey: CryptoKey, file: File): Promise<[Blob, Uint8Array]> => {
    const fileArrayBuffer = await file.arrayBuffer();
    const nonce = window.crypto.getRandomValues(new Uint8Array(12)); // 12-byte nonce for AES-GCM

    const encryptedFile = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
      },
      aesKey,
      fileArrayBuffer
    );

    // Combine the encrypted content with the nonce
    const encryptedArray = new Uint8Array(encryptedFile);
    return [new Blob([encryptedArray]), nonce];
  };

  // Encrypt the AES key with the user's public key
  const encryptAESKeyWithPublicKey = async (publicKey: CryptoKey, aesKey: CryptoKey): Promise<Uint8Array> => {
    const encryptedKey = await window.crypto.subtle.wrapKey('raw', aesKey, publicKey, { name: "RSA-OAEP" });
    return new Uint8Array(encryptedKey);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files; //? e.target.files[0] : null;
    if (uploadedFiles && uploadedFiles.length > 0) {

      //const isDirectory = uploadedFile.webkitRelativePath ? true : false;

      setFile(Array.from(uploadedFiles));

      const metadata: FileMetadata[] = Array.from(uploadedFiles).map(uploadedFile => {
        // Check if the file is part of a directory (directories usually have the 'webkitRelativePath' attribute)
        const isDirectory = Boolean(uploadedFile.webkitRelativePath);
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

    // Ensure public key is loaded before proceeding
    if (!userPublicKey) {
      console.error('User public key not loaded');
      setUploadStatus('User public key not loaded');
      return;
    }

    console.log('File ready to upload:', files);

    // Create a metadata object
    for (const [ind, file] of files.entries()) {

      // Generate an AES key for encrypting the file and metadata
      const aesKey = await generateAESKey();

      // Encrypt the file metadata (name and mime type) using AES
      const encryptedFileName = await encryptTextWithPublicKey(userPublicKey, file.name);
      const encryptedMimeType = await encryptTextWithPublicKey(userPublicKey, file.type);

      // Encrypt the file content using AES
      const [encryptedFile, nonce] = await encryptFileWithAES(aesKey, file);

      // Encrypt the AES key using the user's public RSA key
      const encryptedAESKey = await encryptAESKeyWithPublicKey(userPublicKey, aesKey);

      const metadata = {
        fileName: file.name,
        encryptedFileName: btoa(String.fromCharCode(...encryptedFileName)),
        encryptedKey: btoa(String.fromCharCode(...encryptedAESKey)),
        encryptedMimeType: btoa(String.fromCharCode(...encryptedMimeType)),
        isDirectory: fileMeta[ind].isDirectory || false,
        nonce: btoa(String.fromCharCode(...nonce)),
        parentId: null
      };
      const formData = new FormData();
      // Convert the metadata object to a JSON string
      const metadataJSON = JSON.stringify(metadata);

      formData.append('file', encryptedFile);
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

  const handleFABClick = async () => {
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.click();
    } else {
      console.warn('File input element not found');
    }
  }

  const theme = useTheme();


  return (
    <div className="uploadMain">

      <div className="uploadFile">
        <div>
          <input type="file" id='file-input' style={{display: 'none'}} onChange={handleFileChange} multiple />
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
          {/*<button onClick={handleSubmit}>Upload</button>*/}
          <Button variant="contained" onClick={handleSubmit} style={
            {
              backgroundColor: theme.palette.mode === 'dark' ? '#2f27ce': '#3a31d8', 
              color: theme.palette.mode === 'dark' ? '#050316' : '#eae9fc' 
            }
          }>Upload</Button>

          {/* Tooltip for FAB */}
          <Tooltip title="Upload File" aria-label="upload">
            <Fab
              color="primary"
              aria-label="upload"
              onClick={handleFABClick}
              sx={{ position: 'fixed', bottom: 16, right: 16 }}
            >
              <AddIcon/>
            </Fab>
          </Tooltip>

          {/* Display the upload status */}
          {uploadStatus && <p>{uploadStatus}</p>}
        </div>
      </div>

    </div>
  );

}
