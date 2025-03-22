import React, { useState, useEffect, useRef } from 'react';
import {BASE_URL} from '../utils';
import { useDropzone } from "react-dropzone";
import './Upload.css'
import { GrUploadOption } from "react-icons/gr";

interface UploadProps {
  isOverlay?: boolean;
  onClose?: () => void;
}

export default function Upload({ isOverlay = false, onClose }: UploadProps) {

  interface FileMetadata {
    name: string;
    isDirectory: boolean;
  }

  const [files, setFile] = useState<File[]>([]);
  const [fileMeta, setFileMeta] = useState<FileMetadata[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [userPublicKey, setUserPublicKey] = useState<CryptoKey | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);


  // Function to fetch the user's profile (including the public key) from the server
  const fetchUserProfile = async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/profile`, {
        credentials: "include",
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
        const response = await fetch(`${BASE_URL}/api/upload`, {
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOverlay && overlayRef.current && !overlayRef.current.contains(event.target as Node)) {
        onClose?.();
      }
    };

    if (isOverlay) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOverlay, onClose]);


  return (
      <div ref={overlayRef} className={isOverlay ? "upload-overlay" : "file-upload-container"}>
        {isOverlay && (
          <button className="close-button" onClick={() => onClose?.()}>
            X
          </button>
        )}
        <div {...getRootProps()} className="dropzone">
          <input {...getInputProps()} className="hidden" style={{display: "none"}}/>
          <div className='dropzone-text'>
            <div className='upload-icon'><GrUploadOption size={30} /></div>
            <p>Drag & Drop Files</p>
            <p style={{fontSize:14, color: "gray"}}>Max File Size: 1GB</p>
          </div>
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
        {uploadStatus && <p>{uploadStatus}</p>}
      </div>
  );

}
