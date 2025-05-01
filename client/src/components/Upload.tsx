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
import { useProfile } from "./ProfileProvider";
import { isAuthenticated } from "../utils.ts";
import { FileMetadata } from "../types.ts";
import {
  Box,
  CircularProgress,
  Typography,
  Button,
  Paper,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Divider,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  Stack,
  Tooltip,
  LinearProgress,
  linearProgressClasses,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import { Check, Close, CloudUpload } from "@mui/icons-material";

interface Props {
  parentId?: string | null;
  parentKey?: CryptoKey | null;
  onFinish?: () => Promise<void>;
  isOverlay?: boolean;
  onClose?: () => void;
  linkId?: string | null;
  open?: boolean;
  onUpload?: (
    fileName: string | FileMetadata,
    result: ShareResponse | ErrorResponse,
  ) => Promise<void>;
}

type UploadStatus = SuccessStatus | PendingStatus | ErrorStatus | WaitingStatus;

interface SuccessStatus {
  status: "success";
}

interface WaitingStatus {
  status: "waiting";
}

interface ErrorStatus {
  status: "error";
  message: string;
}

interface PendingStatus {
  status: "pending";
  processedChunks?: number;
  totalChunks: number;
}

// Custom styled LinearProgress for the file segments
const BorderLinearProgress = styled(LinearProgress)(({ theme }) => ({
  height: 10,
  borderRadius: 5,
  [`&.${linearProgressClasses.colorPrimary}`]: {
    backgroundbuttonColor:
      theme.palette.grey[theme.palette.mode === "light" ? 200 : 800],
  },
}));

// UploadContent component contains the main upload functionality
function UploadContent({
  parentId,
  parentKey,
  onFinish,
  onUpload,
  linkId,
}: Omit<Props, "isOverlay" | "onClose">) {
  const theme = useTheme();
  interface FileMetadata {
    name: string;
    isDirectory: boolean;
  }

  const [files, setFiles] = useState<File[]>([]);
  const [fileMeta, setFileMeta] = useState<FileMetadata[]>([]);
  const [fileStatuses, setFileStatuses] = useState<
    Record<string, UploadStatus>
  >({});
  const { showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        totalChunks,
        processedChunks: 0,
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
          processedChunks,
          totalChunks,
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
                {
                  method: "POST",
                  credentials: import.meta.env.DEV ? "include" : "same-origin",
                  body: chunkBlob,
                },
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
      setFiles((prevFiles) => [...prevFiles, ...uploadedFiles]);

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
      setFileStatuses((prev) => {
        const tempFileStatuses: Record<string, UploadStatus> = { ...prev };
        metadata.forEach((meta) => {
          tempFileStatuses[meta.name] = {
            status: "waiting",
          };
        });
        console.log(tempFileStatuses);
        return tempFileStatuses;
      });
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

    if (files.length === 0) {
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

    let successCount = 0;
    let errorCount = 0;

    // Leverage Promise.allSettled to handle multiple file uploads concurrently
    await Promise.allSettled(
      files.map(async (file, index) => {
        try {
          // Update status to show we're working on this file
          setFileStatuses((prev) => ({
            ...prev,
            [file.name]: { status: "pending", totalChunks: 1 },
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
                  totalChunks: 1,
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
                [file.name]: { status: "pending", totalChunks: 1 },
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
              [file.name]: { status: "pending", totalChunks: 1 },
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
    if (errorCount !== 0) {
      if (successCount === 0) {
        showError(`All ${errorCount} files failed to upload.`);
      } else {
        showError(`${errorCount} files failed to upload.`);
      }
    }

    await onFinish?.();
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop: (acceptedFiles) => {
      setFiles((prevFiles) => [...prevFiles, ...acceptedFiles]);
      const metadata: FileMetadata[] = acceptedFiles.map((file) => ({
        name: file.name,
        isDirectory: Boolean(file.webkitRelativePath),
      }));
      setFileMeta((prevMeta) => [...prevMeta, ...metadata]);
      setFileStatuses((prev) => {
        const tempStatuses = { ...prev };
        metadata.forEach(
          (meta) =>
            (tempStatuses[meta.name] = {
              status: "waiting",
            }),
        );
        return tempStatuses;
      });
    },
  });

  const removeFile = (index: number) => {
    setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
    setFileMeta((prevMeta) => prevMeta.filter((_, i) => i !== index));
  };
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        maxWidth: 500,
      }}
    >
      <Paper
        elevation={3}
        sx={{
          width: "100%",
          padding: 3,
          position: "relative",
          backgroundColor: "background.paper",
          borderRadius: 2,
        }}
      >
        <Paper
          {...getRootProps()}
          elevation={0}
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: 200,
            border: `2px dashed ${theme.palette.mode === "dark" ? theme.palette.grey[700] : theme.palette.grey[400]}`,
            borderRadius: 2,
            textAlign: "center",
            cursor: "pointer",
            transition: "border 0.3s ease-in-out",
            "&:hover": {
              borderColor: "#81E6D9",
            },
            backgroundColor: "background.paper",
          }}
        >
          <input {...getInputProps()} style={{ display: "none" }} />
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CloudUpload fontSize="large" color="primary" sx={{ mb: 1 }} />
            <Typography variant="body1" gutterBottom>
              Drag & Drop Files
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Max File Size: 1GB
            </Typography>
            <Button
              variant="contained"
              color="primary"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              sx={{
                mt: 1,
                backgroundColor: "#81E6D9",
                color: "#151C29",
                "&:hover": {
                  backgroundColor: "#66DAC7",
                },
                zIndex: 100,
              }}
            >
              Browse Files
            </Button>
          </Box>
        </Paper>
        <input
          type="file"
          multiple
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        {files.length > 0 && (
          <Paper
            elevation={0}
            sx={{
              width: "100%",
              maxHeight: 150,
              overflowY: "auto",
              mt: 2,
              p: 1,
              border: `1px solid ${theme.palette.mode === "dark" ? theme.palette.grey[700] : theme.palette.grey[300]}`,
              borderRadius: 1,
              backgroundColor: "background.paper",
            }}
          >
            <List sx={{ p: 0 }}>
              {fileMeta.map((meta, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <Divider variant="fullWidth" component="li" />}
                  <ListItem
                    sx={{
                      py: 1,
                      color:
                        fileStatuses[meta.name]?.status === "success"
                          ? "success.main"
                          : fileStatuses[meta.name]?.status === "error"
                            ? "error.main"
                            : "text.primary",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                    secondaryAction={
                      <IconButton
                        edge="end"
                        onClick={() => removeFile(index)}
                        size="small"
                        color="error"
                      >
                        <Close fontSize="small" />
                      </IconButton>
                    }
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: "flex", alignItems: "center" }}>
                          <Typography
                            variant="body2"
                            noWrap
                            sx={{ maxWidth: { xs: 120, sm: 180, md: 250 } }}
                          >
                            {meta.name}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ ml: 0.5 }}
                          >
                            {/* meta.isDirectory ? "(Directory)" : "(File)" */}
                          </Typography>
                        </Box>
                      }
                    />

                    <Box
                      sx={{
                        position: "relative",
                        display: "inline-flex",
                        mr: 4,
                      }}
                    >
                      {fileStatuses[meta.name]?.status === "pending" && (
                        <CircularProgress
                          size={24}
                          variant={
                            (fileStatuses[meta.name] as PendingStatus)
                              .totalChunks === 1
                              ? "indeterminate"
                              : "determinate"
                          }
                          value={
                            (fileStatuses[meta.name] as PendingStatus)
                              .totalChunks === 1
                              ? undefined
                              : (((fileStatuses[meta.name] as PendingStatus)
                                  .processedChunks || 0) /
                                  (fileStatuses[meta.name] as PendingStatus)
                                    .totalChunks) *
                                100
                          }
                          sx={{ ml: 1 }}
                        />
                      )}
                      {fileStatuses[meta.name]?.status === "success" && (
                        <Box
                          sx={{
                            position: "relative",
                            display: "inline-flex",
                            ml: 1,
                          }}
                        >
                          <CircularProgress
                            variant="determinate"
                            value={100}
                            color="success"
                            size={28}
                            thickness={5}
                          />
                          <Box
                            sx={{
                              top: 0,
                              left: 0,
                              bottom: 0,
                              right: 0,
                              position: "absolute",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Check fontSize="small" />
                          </Box>
                        </Box>
                      )}
                      {fileStatuses[meta.name]?.status === "error" && (
                        <Box
                          sx={{
                            position: "relative",
                            display: "inline-flex",
                            ml: 1,
                          }}
                        >
                          <CircularProgress
                            variant="determinate"
                            value={100}
                            color="error"
                            size={28}
                            thickness={5}
                          />
                          <Box
                            sx={{
                              top: 0,
                              left: 0,
                              bottom: 0,
                              right: 0,
                              position: "absolute",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Close fontSize="small" />
                          </Box>
                        </Box>
                      )}
                    </Box>
                  </ListItem>
                </React.Fragment>
              ))}
            </List>
          </Paper>
        )}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            width: "100%",
            mt: 2,
            mb: 1,
          }}
        >
          {files.length > 0 && (
            <Button variant="contained" onClick={handleSubmit} fullWidth>
              Upload Files
            </Button>
          )}
        </Box>

        {/* Progress bar with file segments */}
        {files.length > 0 && (
          <Box sx={{ mt: 2, width: "100%" }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Upload Progress:
            </Typography>
            <Stack
              direction="row"
              spacing={0}
              sx={{
                height: 10,
                width: "100%",
                borderRadius: 5,
                overflow: "hidden",
                bgcolor:
                  theme.palette.grey[
                    theme.palette.mode === "light" ? 200 : 800
                  ],
              }}
            >
              {fileMeta.map((meta, index) => {
                const status = fileStatuses[meta.name]?.status || "pending";
                const segmentWidth = `${100 / files.length}%`;

                // Determine color based on status
                let color;
                if (status === "success") color = theme.palette.success.main;
                else if (status === "error") color = theme.palette.error.main;
                else color = theme.palette.primary.main;

                // For pending files with chunks, show progress within the segment
                const isPendingWithChunks =
                  status === "pending" &&
                  (fileStatuses[meta.name] as PendingStatus)?.totalChunks > 1;

                const progress = isPendingWithChunks
                  ? (((fileStatuses[meta.name] as PendingStatus)
                      .processedChunks || 0) /
                      (fileStatuses[meta.name] as PendingStatus).totalChunks) *
                    100
                  : status === "success"
                    ? 100
                    : status === "pending"
                      ? 70
                      : 0;

                return (
                  <Tooltip
                    key={index}
                    title={`${meta.name}: ${
                      status === "success"
                        ? "Completed"
                        : status === "error"
                          ? "Failed - " +
                            (fileStatuses[meta.name] as ErrorStatus).message
                          : isPendingWithChunks
                            ? `${(fileStatuses[meta.name] as PendingStatus).processedChunks || 0}/${(fileStatuses[meta.name] as PendingStatus).totalChunks} chunks`
                            : "In progress"
                    }`}
                    arrow
                  >
                    <Box
                      sx={{
                        width: segmentWidth,
                        height: "100%",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <BorderLinearProgress
                        variant="determinate"
                        value={progress}
                        sx={{
                          height: "100%",
                          position: "absolute",
                          width: "100%",
                          borderRadius: 0,
                          "& .MuiLinearProgress-bar": {
                            backgroundColor: color,
                          },
                        }}
                      />
                    </Box>
                  </Tooltip>
                );
              })}
            </Stack>
            <Box
              sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}
            >
              <Typography variant="caption">
                Success:{" "}
                {
                  Object.values(fileStatuses).filter(
                    (s) => s.status === "success",
                  ).length
                }
              </Typography>
              <Typography variant="caption">
                Pending:{" "}
                {
                  Object.values(fileStatuses).filter(
                    (s) => s.status === "pending",
                  ).length
                }
              </Typography>
              <Typography variant="caption">
                Failed:{" "}
                {
                  Object.values(fileStatuses).filter(
                    (s) => s.status === "error",
                  ).length
                }
              </Typography>
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

// UploadOverlay component wraps the UploadContent component in a Dialog
function UploadOverlay({
  open,
  onClose,
  ...props
}: Props & { isOverlay: true; open: boolean }) {
  const modalBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalBoxRef.current &&
        !modalBoxRef.current.contains(event.target as Node)
      ) {
        onClose?.();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  return (
    <Dialog
      open={open}
      onClose={() => onClose?.()}
      maxWidth="md"
      PaperProps={{
        ref: modalBoxRef,
        sx: {
          backgroundColor: "background.paper",
          borderRadius: 2,
          width: "100%",
          maxWidth: 500,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pb: 1,
        }}
      >
        <Typography>Upload Files</Typography>
        <IconButton onClick={() => onClose?.()} size="small">
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 3 }}>
        <UploadContent {...props} />
      </DialogContent>
    </Dialog>
  );
}

// Main Upload component that decides whether to render the content directly or wrapped in a dialog
export default function Upload(props: Props) {
  if (props.isOverlay && props.open !== undefined) {
    return <UploadOverlay {...props} isOverlay={true} open={props.open} />;
  }

  return <UploadContent {...props} />;
}
