import { API } from "../utils";
import { FileMetadata } from "../types";
import { UploadResponse } from "../myApi";
import {
  encryptAESKeyWithParentKey,
  encryptText,
  generateKey,
  generateNonce,
} from "../cryptoFunctions";
import { useErrorToast } from "../components/ErrorToastProvider";
import React, { useState, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import "./Upload.css";
import { GrUploadOption } from "react-icons/gr";
import { useProfile } from "./ProfileProvider";

interface Props {
  parentId?: string | null;
  parentKey?: CryptoKey | null;
  onUpload?: (file: FileMetadata) => void;
  isOverlay?: boolean;
  onClose?: () => void;
  linkId?: string | null;
}

export default function Upload({
  parentId,
  parentKey,
  onUpload,
  isOverlay = false,
  onClose,
  linkId,
}: Props) {
  interface FileMetadata {
    name: string;
    isDirectory: boolean;
  }

  const [files, setFile] = useState<File[]>([]);
  const [fileMeta, setFileMeta] = useState<FileMetadata[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const { showError } = useErrorToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const { profile, loading, refreshProfile } = useProfile();

  // Function to encrypt the file content using AES and return the encrypted file
  const encryptFileWithAES = async (
    aesKey: CryptoKey,
    file: File,
    nonce: Uint8Array,
  ): Promise<Blob> => {
    const fileArrayBuffer = await file.arrayBuffer();

    const encryptedFile = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce,
      },
      aesKey,
      fileArrayBuffer,
    );

    // Combine the encrypted content with the nonce
    const encryptedArray = new Uint8Array(encryptedFile);
    return new Blob([encryptedArray]);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files
      ? Array.from(event.target.files)
      : [];
    if (uploadedFiles && uploadedFiles.length > 0) {
      setFile((prevFiles) => [...prevFiles, ...uploadedFiles]);

      const metadata: FileMetadata[] = Array.from(uploadedFiles).map(
        (uploadedFile) => {
          // Check if the file is part of a directory (directories usually have the 'webkitRelativePath' attribute)
          const isDirectory = Boolean(uploadedFile.webkitRelativePath);
          return {
            name: uploadedFile.name,
            isDirectory: isDirectory,
          };
        },
      );

      // Store the metadata in state
      setFileMeta(
        (prevMeta) => [...prevMeta, ...metadata],
        //metadata
      );
    }
  };

  const handleSubmit = async () => {
    if (loading) {
      showError("Please wait for your profile to load before uploading files.");
      return;
    }
    // Here you can handle file upload logic (e.g., sending to server)

    setUploadStatus("Uploading...");

    if (files.length === 0) {
      setUploadStatus("");
      showError("No file selected.");
      return;
    }

    let key: CryptoKey;
    let algorithm: AesGcmParams | RsaOaepParams;
    if (parentId && parentKey) {
      key = parentKey;
    } else {
      if (profile?.importedPublicKey) {
        key = profile?.importedPublicKey;
      } else {
        // This is an anonymous user so we can use any key for encryption
        key = await generateKey();
      }
    }

    // Create a metadata object
    for (const [ind, file] of files.entries()) {
      // Generate an AES key for encrypting the file and metadata
      const aesKey = await generateKey();
      const fileNonce = generateNonce();
      const nameNonce = generateNonce();
      const mimeTypeNonce = generateNonce();
      // Encrypt the file content using AES
      const encryptedFile = await encryptFileWithAES(aesKey, file, fileNonce);

      // Encrypt the file metadata (name and mime type) using AES
      const encryptedFileName = await encryptText(aesKey, file.name, nameNonce);
      const encryptedMimeType = await encryptText(
        aesKey,
        file.type,
        mimeTypeNonce,
      );

      let keyNonce;
      if (parentId || !profile?.importedPublicKey) {
        keyNonce = generateNonce();
        algorithm = { name: "AES-GCM", iv: keyNonce };
      } else {
        algorithm = { name: "RSA-OAEP" };
      }
      // Encrypt the AES key using the user's public RSA key
      const encryptedAESKey = await encryptAESKeyWithParentKey(
        key,
        aesKey,
        algorithm,
      );

      const metadata = {
        encryptedFileName: btoa(String.fromCharCode(...encryptedFileName)),
        encryptedKey: btoa(String.fromCharCode(...encryptedAESKey)),
        encryptedMimeType: btoa(String.fromCharCode(...encryptedMimeType)),
        isDirectory: fileMeta[ind].isDirectory || false,
        fileNonce: btoa(String.fromCharCode(...fileNonce)),
        nameNonce: btoa(String.fromCharCode(...nameNonce)),
        mimeTypeNonce: btoa(String.fromCharCode(...mimeTypeNonce)),
        keyNonce: keyNonce ? btoa(String.fromCharCode(...keyNonce)) : undefined,
        parentId,
      };

      try {
        const response = await API.api.uploadFile(
          {
            metadata,
            //@ts-expect-error swagger api is dumb
            file: encryptedFile,
          },
          { linkId: linkId ?? undefined },
        );

        if (response.status === 402) {
          showError(
            "Error during file upload. You do not have enough free storage space. Please purchase more.",
          );
          return;
        } else if (response.status === 405) {
          showError("Error during file upload. Your file is too large");
          return;
        } else if (!response.ok) {
          throw response.error;
        }
        const data: UploadResponse = response.data;
        console.log("File uploaded successfully");
        setUploadStatus("File uploaded successfully!");
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
            size: data.size,
          });
        }
        refreshProfile();
      } catch (error) {
        showError("Error during file upload.", error);
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
      if (
        isOverlay &&
        overlayRef.current &&
        !overlayRef.current.contains(event.target as Node)
      ) {
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
    <div
      ref={overlayRef}
      className={isOverlay ? "upload-overlay" : "file-upload-container"}
    >
      {isOverlay && (
        <button className="close-button" onClick={() => onClose?.()}>
          X
        </button>
      )}
      <div {...getRootProps()} className="dropzone">
        <input
          {...getInputProps()}
          className="hidden"
          style={{ display: "none" }}
        />
        <div className="dropzone-text">
          <div className="upload-icon">
            <GrUploadOption size={30} />
          </div>
          <p>Drag & Drop Files</p>
          <p style={{ fontSize: 14, color: "gray" }}>Max File Size: 1GB</p>
          <button
            className="browse-button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            Browse Files
          </button>
        </div>
      </div>
      <input
        type="file"
        multiple
        ref={fileInputRef}
        className="hidden"
        style={{ display: "none" }}
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
