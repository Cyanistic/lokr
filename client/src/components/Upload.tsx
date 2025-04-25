import { API, BASE_URL, NONCE_LENGTH } from "../utils";
import {
  ErrorResponse,
  HttpResponse,
  ShareResponse,
  UploadMetadata,
  UploadResponse,
} from "../myApi";
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
  onUpload?: (
    fileName: string | FileMetadata,
    result: ShareResponse | ErrorResponse,
  ) => Promise<void>;
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
  // Uses chunked encryption for large files to avoid memory issues on mobile devices
  // Constants for chunk handling
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
  const UPLOAD_THRESHOLD_SIZE = 10 * 1024 * 1024; // 10MB threshold for chunked upload
  const BATCH_SIZE = 8; // Process 4 chunks at a time

  // Encrypt and upload a file in chunks
  const encryptAndUploadChunked = async (
    aesKey: CryptoKey,
    file: File,
    inMetadata: Partial<UploadMetadata>,
    filename: string,
  ): Promise<HttpResponse<UploadResponse, ErrorResponse>> => {
    // Calculate total chunks needed
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    // The expected final response of the entire operation
    let prev: Response | undefined;

    setFileStatuses((prev) => ({
      ...prev,
      [filename]: {
        status: "pending",
        message: `Preparing chunked upload with ${totalChunks} chunks...`,
      },
    }));

    // Calculate the encrypted size for the transaction
    // Each chunk will have: 4 bytes (chunk nonce) + chunk size + 16 bytes (AES-GCM auth tag)
    const encryptedSize = file.size + totalChunks * (NONCE_LENGTH + 16);
    const metadata = { ...inMetadata };
    metadata.fileNonce = undefined;

    // Start a chunked upload transaction
    const transactionResponse = await API.api.startChunkedUpload(
      {
        ...(metadata as UploadMetadata),
        chunkSize: CHUNK_SIZE + NONCE_LENGTH + 16,
        fileSize: encryptedSize,
        totalChunks: totalChunks,
      },
      { linkId: linkId ?? undefined },
    );

    if (!transactionResponse.ok) {
      throw new Error(
        `Failed to start chunked upload: ${JSON.stringify(transactionResponse.error)}`,
      );
    }

    const transactionId = transactionResponse.data.id;

    // Upload chunks in batches to balance performance and memory
    let processedChunks = 0;
    const failedChunks = 0;

    while (processedChunks < totalChunks) {
      const batch = [];
      const batchEnd = Math.min(processedChunks + BATCH_SIZE, totalChunks);

      setFileStatuses((prev) => ({
        ...prev,
        [filename]: {
          status: "pending",
          message: `Processing and uploading chunks ${processedChunks + 1}-${batchEnd} of ${totalChunks}...`,
        },
      }));

      // Create encryption and upload promises for each chunk in the current batch
      const query = new URLSearchParams({
        autoFinalize: String(true),
      });
      if (linkId) {
        query.append("linkId", linkId);
      }
      for (
        let chunkIndex = processedChunks;
        chunkIndex < batchEnd;
        chunkIndex++
      ) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);

        batch.push(
          (async (index) => {
            try {
              // Slice the file to get the chunk
              const chunk = file.slice(start, end);
              const chunkArrayBuffer = await chunk.arrayBuffer();

              // Generate a unique nonce for this chunk
              const chunkNonce = new Uint8Array(NONCE_LENGTH);

              // Encrypt the chunk
              const encryptedChunk = await window.crypto.subtle.encrypt(
                {
                  name: "AES-GCM",
                  iv: chunkNonce,
                },
                aesKey,
                chunkArrayBuffer,
              );

              const encryptedChunkWithNonce = new Uint8Array(
                NONCE_LENGTH + encryptedChunk.byteLength,
              );
              encryptedChunkWithNonce.set(chunkNonce, 0);
              encryptedChunkWithNonce.set(
                new Uint8Array(encryptedChunk),
                chunkNonce.length,
              );

              // Create a blob from the encrypted chunk
              const chunkBlob = new Blob([encryptedChunkWithNonce]);

              // Upload the chunk
              const uploadResponse = await fetch(
                `${BASE_URL}/api/upload/${transactionId}/chunk/${index}?${query}`,
                { method: "POST", credentials: import.meta.env.DEV ? "include" : "same-origin", body: chunkBlob },
              );

              if (!uploadResponse.ok) {
                return { ...uploadResponse, error: uploadResponse.json() };
              }

              prev = uploadResponse;
              return { success: true, index };
            } catch (e) {
              console.error(`Error processing chunk ${index}:`, e);
              return {
                success: false,
                index,
                error: e instanceof Error ? e.message : "Unknown error",
              };
            }
          })(chunkIndex),
        );
      }

      // Process the current batch in parallel
      await Promise.all(batch);

      // Update the processed count
      processedChunks = batchEnd;

      // If any chunks failed, abort the process
      if (failedChunks > 0) {
        throw new Error(`Failed to upload ${failedChunks} chunks`);
      }
    }

    // A status code of 201 means that the transaction was finalized automatically
    if (prev && prev.status === 201) {
      return {
        ...prev,
        data: await prev.json(),
        error: null as unknown as ErrorResponse,
        ok: true,
        status: prev.status,
      };
    }

    // If auto-finalize wasn't used, manually finalize the upload
    setFileStatuses((prev) => ({
      ...prev,
      [filename]: { status: "pending", message: "Finalizing upload..." },
    }));

    const finalizeResponse = await API.api.finalizeChunkedUpload(transactionId);

    if (!finalizeResponse.ok) {
      throw new Error(
        `Failed to finalize upload: ${JSON.stringify(finalizeResponse.error)}`,
      );
    }

    return finalizeResponse;
  };

  // Encrypt a file using AES - for small files or testing
  const encryptFileWithAES = async (
    aesKey: CryptoKey,
    file: File,
    nonce: Uint8Array,
  ): Promise<Blob> => {
    // For small files, use the simple approach
    const fileArrayBuffer = await file.arrayBuffer();

    const encryptedFile = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce,
      },
      aesKey,
      fileArrayBuffer,
    );

    // Return the encrypted content
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

          let response;

          // Decide whether to use chunked upload or single upload based on file size
          if (
            !fileMeta[index].isDirectory &&
            file.size > UPLOAD_THRESHOLD_SIZE
          ) {
            // Use chunked upload for large files
            try {
              response = await encryptAndUploadChunked(
                aesKey,
                file,
                metadata,
                file.name,
              );
            } catch (error) {
              console.error("Chunked upload failed:", error);
              setFileStatuses((prev) => ({
                ...prev,
                [file.name]: {
                  status: "pending",
                  message: "Falling back to regular upload...",
                },
              }));

              // Fall back to regular upload if chunked upload fails
              const encryptedFile = await encryptFileWithAES(
                aesKey,
                file,
                fileNonce,
              );

              setFileStatuses((prev) => ({
                ...prev,
                [file.name]: { status: "pending", message: "Uploading..." },
              }));

              response = await API.api.uploadFile(
                {
                  metadata: metadata as UploadMetadata,
                  //@ts-expect-error swagger api is dumb
                  file: encryptedFile,
                },
                { linkId: linkId ?? undefined },
              );
            }
          } else {
            // Use standard upload for small files or directories
            const encryptedFile = fileMeta[index].isDirectory
              ? undefined
              : await encryptFileWithAES(aesKey, file, fileNonce);

            setFileStatuses((prev) => ({
              ...prev,
              [file.name]: { status: "pending", message: "Uploading..." },
            }));

            response = await API.api.uploadFile(
              {
                metadata: metadata as UploadMetadata,
                //@ts-expect-error swagger api is dumb
                file: encryptedFile,
              },
              { linkId: linkId ?? undefined },
            );
          }

          if (response.status === 402) {
            setFileStatuses((prev) => ({
              ...prev,
              [file.name]: {
                status: "error",
                message: "Not enough storage space",
              },
            }));
            await onUpload?.(file.name, response.error);
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
            await onUpload?.(file.name, response.error);
            errorCount++;
            return;
          } else if (!response.ok) {
            await onUpload?.(file.name, response.error);
            throw response.error;
          }

          // Successfully uploaded
          setFileStatuses((prev) => ({
            ...prev,
            [file.name]: { status: "success" },
          }));
          const createdAtDate = new Date();
          const modifiedAtDate = new Date();
          console.log(response.data.link);
          await onUpload?.(
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
              size: response.data.size,
            },
            response.data.link!,
          );
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
