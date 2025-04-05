"use client"

import { useState, useEffect, useRef } from "react"
import { Box, CircularProgress } from "@mui/material"
import { API } from "../utils"
import { base64ToArrayBuffer } from "../cryptoFunctions"
import type { FileMetadata } from "../types"
import { getFileIcon } from "../pages/FileExplorer"

interface FileGridPreviewAttachmentProps {
  file: FileMetadata
  width?: number| string;
  height?: number| string;
  onLoad?: () => void
  onError?: (error: Error) => void
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<boolean>(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const isImage = file.mimeType?.startsWith("image/")
  const isVideo = file.mimeType?.startsWith("video/")
  const isPreviewable = isImage || isVideo

  // Clean up preview URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  // Fetch and decrypt file when component mounts or file changes
  useEffect(() => {
    // Make sure we have all required properties before proceeding
    if (!file.id || !file.key || !file.fileNonce || !isPreviewable) {
      return
    }

    const fetchAndDecryptFile = async () => {
      setLoading(true)
      setError(false)

      try {
        // Fetch the encrypted file
        const response = await API.api.getFile(file.id)
        if (!response.ok) throw response.error

        // Convert response to ArrayBuffer
        const dataBuffer = await response.arrayBuffer()

        // Ensure we have the key and nonce before decrypting
        if (!file.key) {
          throw new Error("File encryption key not found")
        }

        if (!file.fileNonce) {
          throw new Error("File nonce not found")
        }

        // TypeScript needs this additional check even though we checked above
        const key = file.key as CryptoKey
        const fileNonceBuffer = base64ToArrayBuffer(file.fileNonce)

        const fileData = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fileNonceBuffer }, key, dataBuffer)

        // Create a blob URL for the decrypted data
        const blob = new Blob([fileData], { type: file.mimeType })
        const url = URL.createObjectURL(blob)

        setPreviewUrl(url)
        onLoad?.()
      } catch (err) {
        console.error("Error decrypting file:", err)
        setError(true)
        onError?.(err instanceof Error ? err : new Error("Unknown error"))
      } finally {
        setLoading(false)
      }
    }

    fetchAndDecryptFile()
  }, [file.id, file.key, file.fileNonce, file.mimeType, isPreviewable, onLoad, onError])

  // For video files, generate a thumbnail from the first frame
  useEffect(() => {
    if (isVideo && previewUrl && videoRef.current && canvasRef.current) {
      const video = videoRef.current
      const canvas = canvasRef.current

      video.onloadeddata = () => {
        // Set canvas dimensions
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight

        // Seek to the first frame
        video.currentTime = 0.1
      }

      video.onseeked = () => {
        const ctx = canvas.getContext("2d")
        if (ctx) {
          // Draw the video frame on the canvas
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        }
      }
    }
  }, [isVideo, previewUrl])

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
    )
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
    )
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
    )
  }

  // For video files, show the video thumbnail
  if (isVideo && previewUrl) {
    return (
      <Box sx={{ position: "relative", width, height }}>
        {/* Hidden video element for generating thumbnail */}
        <video ref={videoRef} src={previewUrl} style={{ display: "none" }} crossOrigin="anonymous" />

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
    )
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
  )
}

