import { API } from "../utils";
import { ErrorResponse, ShareResponse, UploadMetadata } from "../myApi";
import {
  encryptAESKeyWithParentKey,
  encryptText,
  generateKey,
  generateNonce,
} from "../cryptoFunctions";
import { useToast } from "./ToastProvider";
import React, { useState, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import "./Upload.css";
import { GrUploadOption } from "react-icons/gr";
import { useProfile } from "./ProfileProvider";
import { isAuthenticated } from "../utils.ts";
import { FileMetadata } from "../types.ts";

interface Props {
  parentId?: string | null;
  parentKey?: CryptoKey | null;
  onFinish?: () => Promise<void>;
  isOverlay?: boolean;
  onClose?: () => void;
  linkId?: string | null;
  onUpload?: (fileName: string | FileMetadata, result: ShareResponse | ErrorResponse) => void;
}

export default function Upload({
  parentId,
  parentKey,
  isOverlay = false,
  onClose,
  onFinish,
  onUpload,
  linkId,
}: Props) {
  interface FileMetadata {
    name: string;
    isDirectory: boolean;
  }

  const [files, setFile] = useState<File[]>([]);
  const [fileMeta, setFileMeta] = useState<FileMetadata[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [fileStatuses, setFileStatuses] = useState<{
    [filename: string]: {
      status: "pending" | "success" | "error";
      message?: string;
    };
  }>({});
  const { showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const modalBoxRef = useRef<HTMLDivElement | null>(null);
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

    // Initialize status for all files
    const initialStatuses: {
      [filename: string]: {
        status: "pending" | "success" | "error";
        message?: string;
      };
    } = {};
    files.forEach((file) => {
      initialStatuses[file.name] = { status: "pending" };
    });
    setFileStatuses(initialStatuses);

    let successCount = 0;
    let errorCount = 0;

    // Leverage Promise.allSettled to handle multiple file uploads concurrently
    await Promise.allSettled(
      files.map(async (file, index) => {
        try {
          // Update status to show we're working on this file
          setFileStatuses((prev) => ({
            ...prev,
            [file.name]: { status: "pending", message: "Encrypting..." },
          }));

          // Generate an AES key for encrypting the file and metadata
          const aesKey = await generateKey();
          const fileNonce = generateNonce();
          const nameNonce = generateNonce();
          const mimeTypeNonce = generateNonce();

          // Encrypt the file content using AES
          const encryptedFile = await encryptFileWithAES(
            aesKey,
            file,
            fileNonce,
          );

          // Encrypt the file metadata (name and mime type) using AES
          const encryptedFileName = await encryptText(
            aesKey,
            file.name,
            nameNonce,
          );
          const encryptedMimeType = await encryptText(
            aesKey,
            file.type || "application/octet-stream",
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
            isDirectory: fileMeta[index].isDirectory || false,
            fileNonce: btoa(String.fromCharCode(...fileNonce)),
            nameNonce: btoa(String.fromCharCode(...nameNonce)),
            mimeTypeNonce: btoa(String.fromCharCode(...mimeTypeNonce)),
            keyNonce: keyNonce
              ? btoa(String.fromCharCode(...keyNonce))
              : undefined,
            parentId,
          };

          // Update status to show we're uploading
          setFileStatuses((prev) => ({
            ...prev,
            [file.name]: { status: "pending", message: "Uploading..." },
          }));

          const response = await API.api.uploadFile(
            {
              metadata: metadata as UploadMetadata,
              //@ts-expect-error swagger api is dumb
              file: encryptedFile,
            },
            { linkId: linkId ?? undefined },
          );

          if (response.status === 402) {
            setFileStatuses((prev) => ({
              ...prev,
              [file.name]: {
                status: "error",
                message: "Not enough storage space",
              },
            }));
            onUpload?.(file.name, response.error);
            errorCount++;
            return;
          } else if (response.status === 405) {
            setFileStatuses((prev) => ({
              ...prev,
              [file.name]: {
                status: "error",
                message: "File is too large",
              },
            }));
            onUpload?.(file.name, response.error);
            errorCount++;
            return;
          } else if (!response.ok) {
            onUpload?.(file.name, response.error );
            throw response.error;
          }

          // Successfully uploaded
          setFileStatuses((prev) => ({
            ...prev,
            [file.name]: { status: "success" },
          }));
          const createdAtDate = new Date();
          const modifiedAtDate = new Date();
          onUpload?.(
            {
              ...metadata,
              createdAtDate,
              modifiedAtDate,
              id: response.data.id,
              createdAt: createdAtDate.toDateString(),
              modifiedAt: modifiedAtDate.toDateString(),
              key: aesKey,
              name: file.name,
              mimeType: file.type,
              size: response.data.size
            }, 
              response.data.link!)
          successCount++;
        } catch (error) {
          setFileStatuses((prev) => ({
            ...prev,
            [file.name]: {
              status: "error",
              message: error instanceof Error ? error.message : "Unknown error",
            },
          }));
          errorCount++;
        }
      }),
    );

    // Update profile to reflect storage changes
    if (isAuthenticated()) {
      refreshProfile();
    }

    // Set overall status
    if (errorCount === 0) {
      setUploadStatus(`All ${successCount} files uploaded successfully!`);
    } else if (successCount === 0) {
      setUploadStatus(
        `All ${errorCount} files failed to upload. Check errors below.`,
      );
      showError(`All ${errorCount} files failed to upload.`);
    } else {
      setUploadStatus(
        `${successCount} files uploaded successfully, ${errorCount} files failed.`,
      );
      showError(`${errorCount} files failed to upload.`);
    }

    await onFinish?.();
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
        modalBoxRef.current &&
        !modalBoxRef.current.contains(event.target as Node)
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

  const removeFile = (index: number) => {
    setFile((prevFiles) => prevFiles.filter((_, i) => i !== index));
    setFileMeta((prevMeta) => prevMeta.filter((_, i) => i !== index));
  };

  return (
    <div
      ref={overlayRef}
      className={isOverlay ? "upload-overlay" : "file-upload-container"}
    >
      <div
        ref={isOverlay ? modalBoxRef : null}
        className={isOverlay ? "upload-modal-box" : "upload-content"}
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
                <li
                  key={index}
                  className={
                    fileStatuses[meta.name]?.status === "success"
                      ? "file-success"
                      : fileStatuses[meta.name]?.status === "error"
                        ? "file-error"
                        : ""
                  }
                >
                  {meta.name} {meta.isDirectory ? "(Directory)" : "(File)"}
                  {fileStatuses[meta.name]?.status === "pending" &&
                    fileStatuses[meta.name]?.message && (
                      <span className="file-status-pending">
                        {" "}
                        - {fileStatuses[meta.name]?.message}
                      </span>
                    )}
                  {fileStatuses[meta.name]?.status === "success" && (
                    <span className="file-status-success"> - Success</span>
                  )}
                  {fileStatuses[meta.name]?.status === "error" && (
                    <span className="file-status-error">
                      {" "}
                      - Error:{" "}
                      {fileStatuses[meta.name]?.message || "Failed to upload"}
                    </span>
                  )}
                  <button
                    className="remove-button"
                    onClick={() => removeFile(index)}
                  >
                    ✕
                  </button>
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
    </div>
  );
}
