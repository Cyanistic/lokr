import { useState, useEffect, useRef } from "react";
import { Box, CircularProgress } from "@mui/material";
import { decryptFile } from "../cryptoFunctions";
import type { FileMetadata } from "../types";
import { getFileIcon } from "../pages/FileExplorer";
import { useSearchParams } from "react-router-dom";

interface FileGridPreviewAttachmentProps {
  file: FileMetadata;
  width?: number | string;
  height?: number | string;
  onLoad?: (blobUrl?: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Component for previewing files in grid view mode.
 * Handles images and videos with previews, and displays appropriate icons for other file types.
 */
export default function FileGridPreviewAttachment({
  file,
  width = "100%",
  height = "100%",
  onLoad,
  onError,
}: FileGridPreviewAttachmentProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [params] = useSearchParams();

  const isImage = file.mimeType?.startsWith("image/");
  const isVideo = file.mimeType?.startsWith("video/");
  const isPreviewable = isImage || isVideo;
  const linkId = params.get("linkId");

  // Clean up preview URL when component unmounts or file changes
  // We only revoke the URL if we created it and it's not stored in the file metadata
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl !== file.blobUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl, file.blobUrl]);

  // Fetch and decrypt file when component mounts or file changes
  useEffect(() => {
    // Make sure we have all required properties before proceeding
    if (!file.id || !isPreviewable) {
      return;
    }

    // Use cached blob URL if available
    if (file.blobUrl) {
      setPreviewUrl(file.blobUrl);
      setLoading(false);
      onLoad?.();
      return;
    }

    const fetchAndDecryptFile = async () => {
      setLoading(true);
      setError(false);

      try {
        const blob = await decryptFile(file);
        const url = URL.createObjectURL(blob!);

        setPreviewUrl(url);

        // Store the blob URL in the file metadata (handled at parent level)
        if (onLoad) {
          // We can use onLoad as a hook to inform the parent to update the file metadata
          // Pass the generated blob URL to the parent component
          onLoad(url);
        }
      } catch (err) {
        console.error("Error decrypting file:", err);
        setError(true);
        onError?.(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setLoading(false);
      }
    };

    fetchAndDecryptFile();
  }, [
    file.id,
    file.key,
    file.fileNonce,
    file.mimeType,
    isPreviewable,
    onLoad,
    onError,
    linkId,
  ]);

  // For video files, generate a thumbnail from the first frame
  useEffect(() => {
    if (isVideo && previewUrl && videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      video.onloadeddata = () => {
        // Set canvas dimensions
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Seek to the first frame
        video.currentTime = 0.1;
      };

      video.onseeked = () => {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // Draw the video frame on the canvas
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
      };
    }
  }, [isVideo, previewUrl]);

  // If loading, show a loading spinner
  if (loading) {
    return (
      <Box
        sx={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "background.paper",
        }}
      >
        <CircularProgress size={24} />
      </Box>
    );
  }

  // If error or not a previewable file type, show the file icon
  if (error || !isPreviewable || !previewUrl) {
    // This is the key change - we're styling the icon container to match the original
    return (
      <Box
        sx={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "background.paper",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            "& > svg": {
              width: "40%", // Make icon larger
              height: "40%", // Make icon larger
              fontSize: "3rem", // Increase font size for icon
            },
          }}
        >
          {getFileIcon(file.mimeType)}
        </Box>
      </Box>
    );
  }

  // For image files, show the image preview
  if (isImage && previewUrl) {
    return (
      <Box
        component="img"
        src={previewUrl}
        alt={file.name || "File preview"}
        sx={{
          width,
          height,
          objectFit: "cover",
          borderRadius: 1,
        }}
        onError={() => setError(true)}
      />
    );
  }

  // For video files, show the video thumbnail
  if (isVideo && previewUrl) {
    return (
      <Box sx={{ position: "relative", width, height }}>
        {/* Hidden video element for generating thumbnail */}
        <video
          ref={videoRef}
          src={previewUrl}
          style={{ display: "none" }}
          crossOrigin="anonymous"
        />

        {/* Canvas to display the video thumbnail */}
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "4px",
          }}
        />
      </Box>
    );
  }

  // Fallback (should never reach here due to earlier conditions)
  return (
    <Box
      sx={{
        width,
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          "& > svg": {
            width: "40%",
            height: "40%",
            fontSize: "3rem",
          },
        }}
      >
        {getFileIcon(file.mimeType)}
      </Box>
    </Box>
  );
}
