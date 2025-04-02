"use client"

import { Select, MenuItem } from "@mui/material"
import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Dialog, DialogContent, IconButton, Box, CircularProgress, Typography, InputBase, Slider } from "@mui/material"
import CloseIcon from "@mui/icons-material/Close"
import DownloadIcon from "@mui/icons-material/Download"
import ZoomInIcon from "@mui/icons-material/ZoomIn"
import ZoomOutIcon from "@mui/icons-material/ZoomOut"
import RestartAltIcon from "@mui/icons-material/RestartAlt"
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew"
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos"
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import PauseIcon from "@mui/icons-material/Pause"
import VolumeUpIcon from "@mui/icons-material/VolumeUp"
import VolumeOffIcon from "@mui/icons-material/VolumeOff"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/esm/Page/AnnotationLayer.css"
import mammoth from "mammoth"

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js"

interface FilePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  file: {
    name: string
    type: string
    url: string
  } | null
}

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ isOpen, onClose, file }) => {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [scale, setScale] = useState(1.0)
  const [loading, setLoading] = useState(true)
  const [fallback, setFallback] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [textContent, setTextContent] = useState("")
  const [wordDocContent, setWordDocContent] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const observer = useRef<IntersectionObserver | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0) // Playback speed state
  const fileExtension = file?.name.split(".").pop()?.toLowerCase()

  useEffect(() => {
    if (isOpen && file) {
      setScale(1.0)
      setLoading(true)
      setFallback(false)
      setPageNumber(1)
      setTextContent("")
      setWordDocContent("")
      setIsPlaying(false)
      setCurrentTime(0)
      setDuration(0)
      setVolume(1)
      setIsMuted(false)
    }
  }, [isOpen, file])

  useEffect(() => {
    const loadText = async () => {
      if (isOpen && file && (file.type === "text/plain" || fileExtension === "txt")) {
        try {
          const res = await fetch(file.url)
          const text = await res.text()
          setTextContent(text)
          setLoading(false)
        } catch (err) {
          console.error("Failed to load .txt content:", err)
          setLoading(false)
        }
      }
    }

    loadText()
  }, [isOpen, file, fileExtension])

  useEffect(() => {
    const loadWordDoc = async () => {
      if (
        isOpen &&
        file &&
        (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          fileExtension === "docx" ||
          fileExtension === "doc")
      ) {
        try {
          const res = await fetch(file.url)
          const blob = await res.blob()
          const arrayBuffer = await blob.arrayBuffer()

          const result = await mammoth.convertToHtml({ arrayBuffer })
          setWordDocContent(result.value)
          setLoading(false)
        } catch (err) {
          console.error("Failed to load Word document:", err)
          setLoading(false)
        }
      }
    }

    loadWordDoc()
  }, [isOpen, file, fileExtension])

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setLoading(false)
  }

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.2, 3))
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.4))
  const handleResetZoom = () => setScale(1.0)

  const scrollToPage = (page: number) => {
    const container = containerRef.current
    if (!container) return
    const pageElement = container.querySelector(`[data-page-number="${page}"]`)
    if (pageElement) {
      ;(pageElement as HTMLElement).scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    }
  }

  const handleNext = () => {
    if (pageNumber < (numPages || 1)) scrollToPage(pageNumber + 1)
  }

  const handlePrev = () => {
    if (pageNumber > 1) scrollToPage(pageNumber - 1)
  }

  const handleVisiblePages = useCallback((entries: IntersectionObserverEntry[]) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .map((entry) => Number(entry.target.getAttribute("data-page-number")))

    if (visible.length > 0) {
      const closest = Math.min(...visible)
      setPageNumber(closest)
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !numPages) return

    if (observer.current) observer.current.disconnect()

    observer.current = new IntersectionObserver(handleVisiblePages, {
      root: container,
      rootMargin: "0px 0px -70% 0px",
      threshold: 0.1,
    })

    for (let i = 1; i <= numPages; i++) {
      const pageEl = container.querySelector(`[data-page-number="${i}"]`)
      if (pageEl) observer.current.observe(pageEl)
    }

    return () => observer.current?.disconnect()
  }, [numPages, scale, handleVisiblePages])

  // Audio/Video controls
  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    } else if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement | HTMLVideoElement>) => {
    setCurrentTime(e.currentTarget.currentTime)
  }

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLAudioElement | HTMLVideoElement>) => {
    setDuration(e.currentTarget.duration)
    setLoading(false)
  }

  const handleSeek = (_: Event, value: number | number[]) => {
    const newTime = typeof value === "number" ? value : value[0]
    setCurrentTime(newTime)
    if (audioRef.current) {
      audioRef.current.currentTime = newTime
    } else if (videoRef.current) {
      videoRef.current.currentTime = newTime
    }
  }

  const handleVolumeChange = (_: Event, value: number | number[]) => {
    const newVolume = typeof value === "number" ? value : value[0]
    setVolume(newVolume)
    if (audioRef.current) {
      audioRef.current.volume = newVolume
      setIsMuted(newVolume === 0)
    } else if (videoRef.current) {
      videoRef.current.volume = newVolume
      setIsMuted(newVolume === 0)
    }
  }

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted
    } else if (videoRef.current) {
      videoRef.current.muted = !isMuted
    }
    setIsMuted(!isMuted)
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) {
      return `${hours}:${minutes < 10 ? "0" : ""}${minutes}:${secs < 10 ? "0" : ""}${secs}`
    }
    return `${minutes}:${secs < 10 ? "0" : ""}${secs}`
  }

  const renderPdf = () => {
    if (fallback) {
      return (
        <iframe
          src={`${file!.url}#toolbar=0&navpanes=0&scrollbar=0`}
          title="PDF Preview"
          onLoad={() => setLoading(false)}
          style={{ width: "100%", height: "100%", border: "none" }}
        />
      )
    }

    return (
      <Document
        file={file!.url}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={(error) => {
          console.error("react-pdf failed, falling back to iframe:", error)
          setFallback(true)
        }}
        loading=""
      >
        {Array.from(new Array(numPages), (_, index) => (
          <Page
            key={`page_${index + 1}`}
            pageNumber={index + 1}
            scale={scale}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        ))}
      </Document>
    )
  }

  const renderAudio = () => {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          padding: 2,
        }}
      >
        <Box
          sx={{
            width: "80%",
            maxWidth: 600,
            backgroundColor: "#333",
            borderRadius: 2,
            padding: 3,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <Typography variant="h6" align="center" sx={{ color: "white" }}>
            {file!.name}
          </Typography>

          <Box sx={{ display: "flex", justifyContent: "center", my: 2 }}>
            <Box
              sx={{
                position: "relative",
                width: 200,
                height: 200,
                borderRadius: "50%",
                backgroundColor: "#555",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
                cursor: "pointer",
              }}
              onClick={togglePlay}
            >
              <AudioIcon size={80} />

              {/* Loading spinner */}
              {loading && (
                <CircularProgress
                  size={48}
                  sx={{
                    position: "absolute",
                    color: "white",
                  }}
                />
              )}

              {/* Play icon in center */}
              {!isPlaying && !loading && (
                <Box
                  sx={{
                    position: "absolute",
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    backgroundColor: "rgba(255,255,255,0.8)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <PlayArrowIcon sx={{ fontSize: 40, color: "#333" }} />
                </Box>
              )}
            </Box>
          </Box>

          <audio
            ref={audioRef}
            src={file!.url}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
            style={{ display: "none" }}
          />

          <Box sx={{ width: "100%", mb: 1 }}>
            <Slider
              value={currentTime}
              max={duration || 100}
              onChange={handleSeek}
              aria-label="Time"
              sx={{ color: "#1976d2" }}
            />
            <Box sx={{ display: "flex", justifyContent: "space-between", px: 1 }}>
              <Typography variant="caption" sx={{ color: "white" }}>
                {formatTime(currentTime)}
              </Typography>
              <Typography variant="caption" sx={{ color: "white" }}>
                {formatTime(duration)}
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <IconButton onClick={toggleMute} sx={{ color: "white" }}>
                {isMuted ? <VolumeOffIcon /> : <VolumeUpIcon />}
              </IconButton>
              <Slider
                value={volume}
                min={0}
                max={1}
                step={0.01}
                onChange={handleVolumeChange}
                aria-label="Volume"
                sx={{ color: "white", width: 100 }}
              />
            </Box>

            <IconButton
              onClick={togglePlay}
              sx={{
                backgroundColor: "white",
                color: "#333",
                "&:hover": { backgroundColor: "#eee" },
              }}
            >
              {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
            </IconButton>
          </Box>
        </Box>
      </Box>
    )
  }

  const renderVideo = () => {
    console.log("🔍 renderVideo() called")
    console.log("📂 file.type:", file?.type)
    console.log("📄 fileExtension:", fileExtension)
    console.log("🎞️ video URL:", file?.url)
    console.log("📏 currentTime:", currentTime, "| ⏱️ duration:", duration)
    console.log("🔊 volume:", volume, "| 🔇 isMuted:", isMuted)
    console.log("▶️ isPlaying:", isPlaying)
    console.log("⏩ playbackSpeed:", playbackSpeed)

    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: "#000",
          position: "relative",
        }}
      >
        {/* Video container with black background and full-width video */}
        <Box
          sx={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            backgroundColor: "#000",
          }}
        >
          <video
            ref={videoRef}
            src={file?.url}
            controls={false}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={(e) => {
              handleLoadedMetadata(e)
              e.currentTarget.playbackRate = playbackSpeed
            }}
            onEnded={() => setIsPlaying(false)}
            onClick={togglePlay}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain", // This maintains aspect ratio while filling the container
            }}
          />

          {/* Play/Pause overlay button that appears in center when paused */}
          {!isPlaying && !loading && (
            <Box
              onClick={togglePlay}
              sx={{
                position: "absolute",
                width: "68px",
                height: "68px",
                borderRadius: "50%",
                backgroundColor: "rgba(0,0,0,0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "transform 0.2s",
                "&:hover": {
                  transform: "scale(1.1)",
                  backgroundColor: "rgba(0,0,0,0.7)",
                },
              }}
            >
              <PlayArrowIcon sx={{ fontSize: 40, color: "white" }} />
            </Box>
          )}

          {/* Loading indicator */}
          {loading && (
            <CircularProgress
              size={48}
              sx={{
                position: "absolute",
                color: "white",
              }}
            />
          )}
        </Box>

        {/* Google Drive-style controls bar */}
        <Box
          sx={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            padding: "8px 16px",
            transition: "opacity 0.3s",
            opacity: isPlaying ? "0" : "1",
            "&:hover": { opacity: "1" },
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
          className="controls-container"
        >
          {/* Progress bar */}
          <Slider
            value={currentTime}
            max={duration || 100}
            onChange={handleSeek}
            aria-label="Time"
            sx={{
              color: "#DB4437", // Google Drive's red color
              height: 4,
              "& .MuiSlider-thumb": {
                width: 12,
                height: 12,
                transition: "width 0.2s, height 0.2s",
                "&:hover, &.Mui-focusVisible, &.Mui-active": {
                  boxShadow: "0px 0px 0px 8px rgba(219, 68, 55, 0.16)",
                  width: 16,
                  height: 16,
                },
              },
              "& .MuiSlider-rail": {
                opacity: 0.28,
              },
            }}
          />

          {/* Controls row */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {/* Left side controls */}
            <Box sx={{ display: "flex", alignItems: "center" }}>
              <IconButton
                onClick={togglePlay}
                sx={{
                  color: "white",
                  padding: "4px",
                }}
              >
                {isPlaying ? <PauseIcon sx={{ fontSize: "24px" }} /> : <PlayArrowIcon sx={{ fontSize: "24px" }} />}
              </IconButton>

              {/* Time display */}
              <Typography
                variant="caption"
                sx={{ color: "white", ml: 1, fontSize: "13px", fontFamily: "Roboto, Arial, sans-serif" }}
              >
                {formatTime(currentTime)} / {formatTime(duration)}
              </Typography>
            </Box>

            {/* Right side controls */}
            <Box sx={{ display: "flex", alignItems: "center" }}>
              {/* Playback speed control - Google Drive style */}
              <Select
                value={playbackSpeed}
                onChange={(e) => {
                  const speed = Number(e.target.value)
                  setPlaybackSpeed(speed)
                  if (videoRef.current) {
                    videoRef.current.playbackRate = speed
                  }
                }}
                sx={{
                  color: "white",
                  fontSize: "13px",
                  height: "28px",
                  mr: 2,
                  ".MuiOutlinedInput-notchedOutline": { border: "none" },
                  "&:hover .MuiOutlinedInput-notchedOutline": { border: "none" },
                  ".MuiSvgIcon-root": { color: "white", fontSize: "18px" },
                  ".MuiSelect-select": {
                    padding: "2px 8px",
                    paddingRight: "24px !important",
                    fontFamily: "Roboto, Arial, sans-serif",
                  },
                  backgroundColor: "transparent",
                  "&:hover": { backgroundColor: "rgba(255,255,255,0.1)" },
                  borderRadius: "4px",
                }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      backgroundColor: "#333",
                      color: "white",
                      "& .MuiMenuItem-root": {
                        fontSize: "13px",
                        fontFamily: "Roboto, Arial, sans-serif",
                        "&:hover": {
                          backgroundColor: "rgba(255,255,255,0.1)",
                        },
                        "&.Mui-selected": {
                          backgroundColor: "rgba(255,255,255,0.2)",
                        },
                      },
                    },
                  },
                }}
              >
                {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((speed) => (
                  <MenuItem key={speed} value={speed} sx={{ fontSize: "13px" }}>
                    {speed === 1 ? "Normal" : `${speed}x`}
                  </MenuItem>
                ))}
              </Select>

              {/* Volume control */}
              <Box sx={{ display: "flex", alignItems: "center", mr: 1 }}>
                <IconButton
                  onClick={toggleMute}
                  sx={{
                    color: "white",
                    padding: "4px",
                  }}
                >
                  {isMuted ? <VolumeOffIcon sx={{ fontSize: "20px" }} /> : <VolumeUpIcon sx={{ fontSize: "20px" }} />}
                </IconButton>

                <Slider
                  value={volume}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={handleVolumeChange}
                  aria-label="Volume"
                  sx={{
                    color: "white",
                    width: 80,
                    height: 4,
                    marginRight: "8px",
                    "& .MuiSlider-thumb": {
                      width: 10,
                      height: 10,
                      "&:hover, &.Mui-focusVisible": {
                        boxShadow: "0px 0px 0px 8px rgba(255, 255, 255, 0.16)",
                      },
                    },
                  }}
                />
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    )
  }

  const renderImage = () => {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          width: "100%",
          backgroundColor: "#000",
        }}
      >
        <img
          src={file!.url || "/placeholder.svg"}
          alt={file!.name}
          style={{
            transformOrigin: "center",
            transform: `scale(${scale})`,
            maxWidth: "100%",
            maxHeight: "100%",
            display: "block",
            margin: "0 auto",
          }}
          onLoad={() => setLoading(false)}
        />
      </Box>
    )
  }

  const renderWordDoc = () => {
    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
          padding: 3,
          overflow: "auto",
          backgroundColor: "white",
          color: "#000",
          maxWidth: "800px",
          margin: "0 auto",
          "& *": {
            color: "#000 !important", // ← this forces all children to be black
          },
        }}
      >
        <div
          dangerouslySetInnerHTML={{ __html: wordDocContent }}
          style={{ fontFamily: "Arial, sans-serif", lineHeight: "1.5" }}
        />
      </Box>
    )
  }

  const renderContent = () => {
    if (!file) return null

    if (file.type === "application/pdf" || fileExtension === "pdf") {
      return renderPdf()
    }

    if (file.type === "text/plain" || fileExtension === "txt") {
      return (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            padding: 2,
            overflow: "auto",
            backgroundColor: "white",
            color: "#000",
            border: "1px solid #e0e0e0",
            borderRadius: 1,
            whiteSpace: "pre-wrap",
            fontFamily: "monospace",
          }}
        >
          {textContent}
        </Box>
      )
    }

    if (
      file.type.startsWith("audio/") ||
      fileExtension === "mp3" ||
      fileExtension === "wav" ||
      fileExtension === "m4a"
    ) {
      return renderAudio()
    }

    if (
      file.type.startsWith("video/") ||
      fileExtension === "mp4" ||
      fileExtension === "mov" ||
      fileExtension === "webm"
    ) {
      return renderVideo()
    }

    if (
      file.type.startsWith("image/") ||
      ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(fileExtension || "")
    ) {
      return renderImage()
    }

    if (
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileExtension === "doc" ||
      fileExtension === "docx"
    ) {
      return renderWordDoc()
    }

    return <Typography>Unsupported file type</Typography>
  }

  if (!file) return null

  const showZoomControls =
    file.type === "application/pdf" ||
    fileExtension === "pdf" ||
    file.type.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(fileExtension || "")

  return (
    <Dialog open={isOpen} onClose={onClose} fullWidth maxWidth="md">
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          px: 2,
          py: 1,
          borderBottom: "1px solid #ddd",
        }}
      >
        <Typography
          variant="subtitle2"
          sx={{
            maxWidth: "70%",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {decodeURIComponent(file.name)}
        </Typography>

        <Box>
          <IconButton href={file.url} download={file.name} size="small">
            <DownloadIcon />
          </IconButton>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      <DialogContent
        dividers
        sx={{
          height: "75vh",
          p: 0,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          bgcolor: "#f8f8f8",
        }}
      >
        <Box
          ref={containerRef}
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            overflow: "auto",
            width: "100%",
          }}
        >
          {renderContent()}
        </Box>

        {/* Bottom Bar for PDFs */}
        {!fallback && numPages && (file.type === "application/pdf" || fileExtension === "pdf") && (
          <Box
            sx={{
              position: "absolute",
              bottom: 16,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "40px",
              backdropFilter: "blur(8px)",
              backgroundColor: "rgba(30, 30, 30, 0.6)",
              color: "#fff",
              px: 1.5,
              py: 0.5,
              gap: 1,
              zIndex: 2,
              fontSize: "0.8rem",
            }}
          >
            <IconButton onClick={handlePrev} size="small" sx={{ color: "#fff" }}>
              <ArrowBackIosNewIcon fontSize="small" />
            </IconButton>

            <Typography variant="body2" mx={1}>
              Page
            </Typography>

            <InputBase
              value={pageNumber}
              onChange={(e) => {
                const value = Number.parseInt(e.target.value)
                if (!isNaN(value)) scrollToPage(value)
              }}
              inputProps={{
                type: "number",
                min: 1,
                max: numPages,
                style: {
                  color: "#fff",
                  backgroundColor: "#111",
                  border: "none",
                  width: 28,
                  textAlign: "center",
                  fontSize: "0.75rem",
                  borderRadius: 4,
                },
              }}
            />

            <Typography variant="body2">/ {numPages}</Typography>

            <IconButton onClick={handleNext} size="small" sx={{ color: "#fff" }}>
              <ArrowForwardIosIcon fontSize="small" />
            </IconButton>

            <Box sx={{ mx: 1, height: "20px", borderLeft: "1px solid #666" }} />

            <IconButton onClick={handleZoomOut} size="small" sx={{ color: "#fff" }}>
              <ZoomOutIcon fontSize="small" />
            </IconButton>
            <IconButton onClick={handleZoomIn} size="small" sx={{ color: "#fff" }}>
              <ZoomInIcon fontSize="small" />
            </IconButton>
            <IconButton onClick={handleResetZoom} size="small" sx={{ color: "#fff" }}>
              <RestartAltIcon fontSize="small" />
            </IconButton>
          </Box>
        )}

        {/* Zoom Controls for Images */}
        {showZoomControls && !numPages && (
          <Box
            sx={{
              position: "absolute",
              bottom: 16,
              right: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "40px",
              backdropFilter: "blur(8px)",
              backgroundColor: "rgba(30, 30, 30, 0.6)",
              color: "#fff",
              px: 1.5,
              py: 0.5,
              gap: 1,
              zIndex: 2,
            }}
          >
            <IconButton onClick={handleZoomOut} size="small" sx={{ color: "#fff" }}>
              <ZoomOutIcon fontSize="small" />
            </IconButton>
            <IconButton onClick={handleZoomIn} size="small" sx={{ color: "#fff" }}>
              <ZoomInIcon fontSize="small" />
            </IconButton>
            <IconButton onClick={handleResetZoom} size="small" sx={{ color: "#fff" }}>
              <RestartAltIcon fontSize="small" />
            </IconButton>
          </Box>
        )}

        {loading && (
          <Box
            sx={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <CircularProgress />
            <Typography mt={2}>Loading preview...</Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Helper component for audio icon
const AudioIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 16C10.9 16 9.88 15.61 9.11 14.88C8.35 14.16 7.94 13.18 7.94 12.12C7.94 10.06 9.73 8.27 11.79 8.27C11.97 8.27 12.15 8.29 12.33 8.32C11.89 8.95 11.65 9.71 11.65 10.5C11.65 11.27 11.86 11.99 12.26 12.61C12.66 13.23 13.22 13.69 13.89 13.97C13.45 15.19 12.69 16 12 16Z"
      fill="#FFF"
    />
  </svg>
)

export default FilePreviewModal

