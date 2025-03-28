import { API } from '../utils';
import { FileMetadata } from '../types';
import { UploadResponse } from '../myApi';
import { encryptAESKeyWithParentKey, encryptText, generateKeyAndNonce } from '../cryptoFunctions';
import { useErrorToast } from '../components/ErrorToastProvider';
import React, { useState, useEffect, useRef } from 'react';
//import {Button, useTheme} from '@mui/material';
//import { Fab, Tooltip } from '@mui/material';
//import AddIcon from '@mui/icons-material/Add';
import { useDropzone } from "react-dropzone";
import './Upload.css'

interface Props {
  parentId?: string | null;
  parentKey?: CryptoKey | null;
  onUpload?: (file: FileMetadata) => void;
}

export default function Upload({ parentId, parentKey, onUpload }: Props) {

  interface FileMetadata {
    name: string;
    isDirectory: boolean;
  }

  const [files, setFile] = useState<File[]>([]);
  const [fileMeta, setFileMeta] = useState<FileMetadata[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [userPublicKey, setUserPublicKey] = useState<CryptoKey | null>(null);
  const { showError } = useErrorToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);


  // Function to fetch the user's profile (including the public key) from the server
  const fetchUserProfile = async () => {
    try {
      const response = await API.api.getLoggedInUser();

      if (!response.ok) throw response.error;
      const data = await response.json();
      const publicKeyPem = data.publicKey; // Assuming the public key is in the profile data

      const cryptoKey = await importPublicKey(publicKeyPem);
      setUserPublicKey(cryptoKey); // Store the user's public key
    } catch (error) {
      showError('Error fetching user profile.', error);
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

  // Function to encrypt the file content using AES and return the encrypted file
  const encryptFileWithAES = async (aesKey: CryptoKey, file: File, nonce: Uint8Array): Promise<Blob> => {
    const fileArrayBuffer = await file.arrayBuffer();

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
    return new Blob([encryptedArray])
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    //const uploadedFiles = e.target.files; //? e.target.files[0] : null;
    const uploadedFiles = event.target.files ? Array.from(event.target.files) : [];
    if (uploadedFiles && uploadedFiles.length > 0) {

      setFile((prevFiles) => [...prevFiles, ...uploadedFiles]/*Array.from(uploadedFiles)*/);

      const metadata: FileMetadata[] = Array.from(uploadedFiles).map(uploadedFile => {
        // Check if the file is part of a directory (directories usually have the 'webkitRelativePath' attribute)
        const isDirectory = Boolean(uploadedFile.webkitRelativePath);
        return {
          name: uploadedFile.name,
          isDirectory: isDirectory,
        };
      });

      // Store the metadata in state
      setFileMeta(
        (prevMeta) => [...prevMeta, ...metadata]
        //metadata
      );
    }
  };

  const handleSubmit = async () => {
    // Here you can handle file upload logic (e.g., sending to server)

    setUploadStatus('Uploading...');


    if (files.length === 0) {
      setUploadStatus("");
      showError("No file selected.");
      return;
    }

    // Ensure public key is loaded before proceeding
    if (!userPublicKey) {
      setUploadStatus("");
      showError('Could not upload file. User public key not loaded.');
      return;
    }

    console.log('File ready to upload:', files);
    let key: CryptoKey;
    let algorithm: AesGcmParams | RsaOaepParams;
    if (parentId && parentKey) {
      key = parentKey;
    } else {
      key = userPublicKey;
    }

    // Create a metadata object
    for (const [ind, file] of files.entries()) {
      // Generate an AES key for encrypting the file and metadata
      const [aesKey, nonce] = await generateKeyAndNonce();
      // Encrypt the file content using AES
      const encryptedFile = await encryptFileWithAES(aesKey, file, nonce);

      // Encrypt the file metadata (name and mime type) using AES
      const encryptedFileName = await encryptText(aesKey, file.name, nonce);
      const encryptedMimeType = await encryptText(aesKey, file.type, nonce);

      if (parentId) {
        algorithm = { name: "AES-GCM", iv: nonce };
      } else {
        algorithm = { name: "RSA-OAEP" };
      }
      // Encrypt the AES key using the user's public RSA key
      const encryptedAESKey = await encryptAESKeyWithParentKey(key, aesKey, algorithm);

      const metadata = {
        encryptedFileName: btoa(String.fromCharCode(...encryptedFileName)),
        encryptedKey: btoa(String.fromCharCode(...encryptedAESKey)),
        encryptedMimeType: btoa(String.fromCharCode(...encryptedMimeType)),
        isDirectory: fileMeta[ind].isDirectory || false,
        nonce: btoa(String.fromCharCode(...nonce)),
        parentId
      };

      try {
        const response = await API.api.uploadFile({
          metadata,
          //@ts-ignore
          file: encryptedFile
        });

        if (response.status === 402) {
          showError('Error during file upload. You do not have enough free storage space. Please purchase more.');
          return;
        } else if (response.status === 405) {
          showError('Error during file upload. Your file is too large');
          return;
        } else if (!response.ok) {
          throw response.error;
        }
        const data: UploadResponse = response.data;
        console.log('File uploaded successfully');
        setUploadStatus('File uploaded successfully!');
        const createdAtDate = new Date();
        const modifiedAtDate = new Date();
        if (onUpload) {
          onUpload({
            ...metadata,
            createdAtDate,
            modifiedAtDate,
            id: data.id,
            createdAt: createdAtDate.toDateString(),
            modifiedAt: modifiedAtDate.toDateString(),
            key: aesKey,
            name: file.name,
            mimeType: file.type,
            size: data.size
          })
        }
      } catch (error) {
        showError('Error during file upload.', error);
      }
    }
  };

  /*const handleFABClick = async () => {
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.click();
    } else {
      console.warn('File input element not found');
    }
  }*/

  //const theme = useTheme();

  const { getRootProps, getInputProps } = useDropzone({

    onDrop: (acceptedFiles) => {
      setFile((prevFiles) => [...prevFiles, ...acceptedFiles]);
      const metadata: FileMetadata[] = acceptedFiles.map((file) => ({
        name: file.name,
        isDirectory: Boolean(file.webkitRelativePath),
      }));
      setFileMeta((prevMeta) => [...prevMeta, ...metadata]);
    },
  });


  return (
      <div className="file-upload-container">
        <div {...getRootProps()} className="dropzone">
          <input {...getInputProps()} className="hidden" style={{display: "none"}}/>
          <p>Drag & Drop Files</p>
        </div>
        <input
          type="file"
          multiple
          ref={fileInputRef}
          className="hidden"
          style={{display: "none"}}
          onChange={handleFileChange}
        />
        {files.length > 0 && (
          <div className="file-list">
            <ul>
              {fileMeta.map((meta, index) => (
                <li key={index}>
                  {meta.name} {meta.isDirectory ? "(Directory)" : "(File)"}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="button-container">
          <button className="browse-button" onClick={() => fileInputRef.current?.click()}>
            Browse Files
          </button>
          {files.length > 0 && (
            <button onClick={handleSubmit} className="upload-button">
              Upload Files
            </button>
          )}
        </div>
      {/*
      <div className="uploadFile">
        <div>
          <input type="file" id='file-input' style={{ display: 'none' }} onChange={handleFileChange} multiple />
          {files.length > 0 && (
            <div style={{ minWidth: "100px" }}>
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
          {/*<button onClick={handleSubmit}>Upload</button>}
          <Button variant="contained" onClick={handleSubmit} style={
            {
              backgroundColor: theme.palette.mode === 'dark' ? '#2f27ce': '#3a31d8', 
              color: theme.palette.mode === 'dark' ? '#050316' : '#eae9fc' 
            }
          }>Upload</Button>

          {/* Tooltip for FAB }
          <Tooltip title="Upload File" aria-label="upload">
            <Fab
              color="primary"
              aria-label="upload"
              onClick={handleFABClick}
              sx={{ position: 'fixed', bottom: 16, right: 16 }}
            >
              <AddIcon />
            </Fab>
          </Tooltip>

          {/* Display the upload status }
        </div>
      </div>
      */}
      {uploadStatus && <p>{uploadStatus}</p>}
    </div>
  );

}
