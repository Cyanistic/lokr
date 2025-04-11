import { Select, MenuItem } from "@mui/material";
import type React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  IconButton,
  Box,
  CircularProgress,
  Typography,
  InputBase,
  Slider,
  Fade,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DownloadIcon from "@mui/icons-material/Download";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import Tooltip from "@mui/material/Tooltip";
import Replay10Icon from "@mui/icons-material/Replay10";
import Forward10Icon from "@mui/icons-material/Forward10";
import FullscreenIcon from "@mui/icons-material/Fullscreen";

import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import mammoth from "mammoth";
import { getFileIcon } from "../pages/FileExplorer";
import { FileMetadata } from "../types";
import { API, getExtension } from "../utils";
import { useToast } from "./ToastProvider";
import { base64ToArrayBuffer } from "../cryptoFunctions";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

interface FilePreviewModalProps {
  open: boolean;
  onClose: () => void;
  file?: FileMetadata;
  onLoad?: (blobUrl?: string) => void;
  linkId?: string;
}

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  open,
  onClose,
  onLoad,
  file,
  linkId,
}) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [fallback, setFallback] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [textContent, setTextContent] = useState("");
  const [wordDocContent, setWordDocContent] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0); // Playback speed state
  const fileExtension = getExtension(file || "");
  const { showError } = useToast();

  // States for feedback animations
  const [showRewindFeedback, setShowRewindFeedback] = useState(false);
  const [showFastForwardFeedback, setShowFastForwardFeedback] = useState(false);

  // For double tap detection
  const [lastTap, setLastTap] = useState(0);
  // Touch gesture handling for mobile pinch zoom
  const imageRef = useRef<HTMLImageElement>(null);
  const [pinchStartDistance, setPinchStartDistance] = useState<number | null>(
    null,
  );
  const [pinchStartScale, setPinchStartScale] = useState(1);
  const [dragState, setDragState] = useState({
    isDragging: false,
    lastX: 0,
    lastY: 0,
    translateX: 0,
    translateY: 0,
  });

  // PDF document reference for pinch zoom
  const pdfContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && file) {
      setScale(1.0);
      setLoading(true);
      setFallback(false);
      setPageNumber(1);
      setTextContent("");
      setWordDocContent("");
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setVolume(1);
      setIsMuted(false);
    }
  }, [open, file]);

  // Fetch and decrypt file when component mounts or file changes
  useEffect(() => {
    // Make sure we have all required properties before proceeding
    if (!file || !file.id || !file.key || !file.fileNonce) {
      return;
    }

    // Use cached blob URL if available
    if (file.blobUrl) {
      setLoading(false);
      onLoad?.();
      return;
    }

    const fetchAndDecryptFile = async () => {
      setLoading(true);

      try {
        // Fetch the encrypted file
        const response = await API.api.getFile(file.id, {
          linkId: linkId ?? undefined,
        });
        if (!response.ok) throw response.error;

        // Convert response to ArrayBuffer
        const dataBuffer = await response.arrayBuffer();

        // Ensure we have the key and nonce before decrypting
        if (!file.key) {
          throw new Error("File encryption key not found");
        }

        if (!file.fileNonce) {
          throw new Error("File nonce not found");
        }

        // TypeScript needs this additional check even though we checked above
        const key = file.key as CryptoKey;
        const fileNonceBuffer = base64ToArrayBuffer(file.fileNonce);

        const fileData = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: fileNonceBuffer },
          key,
          dataBuffer,
        );

        // Create a blob URL for the decrypted data
        const blob = new Blob([fileData], { type: file.mimeType });
        const url = URL.createObjectURL(blob);

        // Store the blob URL in the file metadata (handled at parent level)
        if (onLoad) {
          // We can use onLoad as a hook to inform the parent to update the file metadata
          // Pass the generated blob URL to the parent component
          onLoad(url);
        }
      } catch (err) {
        showError("Error decrypting file.", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAndDecryptFile();
  }, [file, onLoad, linkId]);

  // Keyboard navigation for video playback
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keyboard events if a video is being displayed
      if (
        open &&
        file &&
        (file?.mimeType?.startsWith("video/") ||
          ["mp4", "mov", "webm"].includes(fileExtension || ""))
      ) {
        switch (e.key) {
          case "ArrowLeft":
            // Left arrow - rewind 10 seconds
            if (videoRef.current) {
              const newTime = Math.max(videoRef.current.currentTime - 10, 0);
              videoRef.current.currentTime = newTime;
              setCurrentTime(newTime);
              handleUserActivity();

              setShowRewindFeedback(true);
              setTimeout(() => {
                setShowRewindFeedback(false);
              }, 500);
            }
            break;

          case "ArrowRight":
            // Right arrow - fast forward 10 seconds
            if (videoRef.current) {
              const newTime = Math.min(
                videoRef.current.currentTime + 10,
                duration,
              );
              videoRef.current.currentTime = newTime;
              setCurrentTime(newTime);
              handleUserActivity();

              setShowFastForwardFeedback(true);
              setTimeout(() => {
                setShowFastForwardFeedback(false);
              }, 500);
            }
            break;

          case " ":
            // Space bar - toggle play/pause
            if (
              document.activeElement?.tagName !== "INPUT" &&
              document.activeElement?.tagName !== "TEXTAREA"
            ) {
              togglePlay();
              handleUserActivity();
              e.preventDefault(); // Prevent page scrolling
            }
            break;
        }
      }
    };

    // Add event listener
    window.addEventListener("keydown", handleKeyDown);

    // Remove event listener on cleanup
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, file, fileExtension, duration]);

  useEffect(() => {
    const loadText = async () => {
      if (
        open &&
        file &&
        (file.mimeType === "text/plain" || fileExtension === "txt") &&
        file.blobUrl
      ) {
        try {
          const res = await fetch(file?.blobUrl);
          const text = await res.text();
          setTextContent(text);
          setLoading(false);
        } catch (err) {
          showError("Failed to load text preview content.", err);
          setLoading(false);
        }
      }
    };

    loadText();
  }, [open, file, fileExtension]);

  useEffect(() => {
    const loadWordDoc = async () => {
      if (
        open &&
        file &&
        (file.mimeType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          fileExtension === "docx" ||
          fileExtension === "doc") &&
        file.blobUrl
      ) {
        try {
          const res = await fetch(file.blobUrl);
          const blob = await res.blob();
          const arrayBuffer = await blob.arrayBuffer();

          const result = await mammoth.convertToHtml({ arrayBuffer });
          setWordDocContent(result.value);
          setLoading(false);
        } catch (err) {
          showError("Failed to load Word document.", err);
          setLoading(false);
        }
      }
    };

    loadWordDoc();
  }, [open, file, fileExtension]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  };

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.2, 5));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.2));
  const handleResetZoom = () => {
    setScale(1.0);
    // Reset any pan translation if we're using it
    if (typeof setDragState === "function") {
      setDragState({
        isDragging: false,
        lastX: 0,
        lastY: 0,
        translateX: 0,
        translateY: 0,
      });
    }
  };

  const handleUserActivity = () => {
    setShowControlsBar(true);
    setShowTopBar(true);
    if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    hideControlsTimeout.current = setTimeout(() => {
      setShowControlsBar(false);
      setShowTopBar(false);
    }, 1000); // hide after 1s idle for videos
  };

  const handleMouseLeaveVideo = () => {
    // Hide controls immediately when mouse leaves the video container
    if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    setShowControlsBar(false);
  };

  // Add event listener for fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        // We are in fullscreen mode
        setShowControlsBar(true);
        // Hide controls after 1 second
        if (hideControlsTimeout.current)
          clearTimeout(hideControlsTimeout.current);
        hideControlsTimeout.current = setTimeout(() => {
          setShowControlsBar(false);
        }, 1000);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const scrollToPage = (page: number) => {
    const container = containerRef.current;
    if (!container) return;
    const pageElement = container.querySelector(`[data-page-number="${page}"]`);
    if (pageElement) {
      (pageElement as HTMLElement).scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  const handleNext = () => {
    if (pageNumber < (numPages || 1)) scrollToPage(pageNumber + 1);
  };

  const handlePrev = () => {
    if (pageNumber > 1) scrollToPage(pageNumber - 1);
  };

  const handleVisiblePages = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .map((entry) => Number(entry.target.getAttribute("data-page-number")));

      if (visible.length > 0) {
        const closest = Math.min(...visible);
        setPageNumber(closest);
      }
    },
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !numPages) return;

    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(handleVisiblePages, {
      root: container,
      rootMargin: "0px 0px -70% 0px",
      threshold: 0.1,
    });

    for (let i = 1; i <= numPages; i++) {
      const pageEl = container.querySelector(`[data-page-number="${i}"]`);
      if (pageEl) observer.current.observe(pageEl);
    }

    return () => observer.current?.disconnect();
  }, [numPages, scale, handleVisiblePages]);

  // Audio/Video controls
  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    } else if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = (
    e: React.SyntheticEvent<HTMLAudioElement | HTMLVideoElement>,
  ) => {
    setCurrentTime(e.currentTarget.currentTime);
  };

  const handleLoadedMetadata = (
    e: React.SyntheticEvent<HTMLAudioElement | HTMLVideoElement>,
  ) => {
    setDuration(e.currentTarget.duration);
    setLoading(false);
  };

  const handleSeek = (_: Event, value: number | number[]) => {
    const newTime = typeof value === "number" ? value : value[0];
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    } else if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  const handleVolumeChange = (_: Event, value: number | number[]) => {
    const newVolume = typeof value === "number" ? value : value[0];
    setVolume(newVolume);
    setIsMuted(newVolume === 0);

    if (audioRef.current) {
      audioRef.current.volume = newVolume;
      audioRef.current.muted = newVolume === 0;
    } else if (videoRef.current) {
      videoRef.current.volume = newVolume;
      videoRef.current.muted = newVolume === 0;
    }

    // update previous volume if volume isn't 0
    if (newVolume > 0) {
      setPreviousVolume(newVolume);
    }
  };

  const [previousVolume, setPreviousVolume] = useState(1);
  const toggleMute = () => {
    if (isMuted) {
      // Unmuting: restore previous volume
      const restoredVolume = previousVolume || 1;
      setVolume(restoredVolume);
      if (audioRef.current) {
        audioRef.current.volume = restoredVolume;
        audioRef.current.muted = false;
      } else if (videoRef.current) {
        videoRef.current.volume = restoredVolume;
        videoRef.current.muted = false;
      }
    } else {
      // Muting: save current volume and set to 0
      setPreviousVolume(volume);
      setVolume(0);
      if (audioRef.current) {
        audioRef.current.volume = 0;
        audioRef.current.muted = true;
      } else if (videoRef.current) {
        videoRef.current.volume = 0;
        videoRef.current.muted = true;
      }
    }
    setIsMuted(!isMuted);
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes < 10 ? "0" : ""}${minutes}:${secs < 10 ? "0" : ""}${secs}`;
    }
    return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const renderPdf = () => {
    if (fallback) {
      return (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center", // Align to top so first page is visible
            height: "100%",
            width: "100%",
            overflow: "auto",
          }}
          onClick={handleUserActivity}
          onMouseMove={handleUserActivity}
          onTouchStart={handleUserActivity}
        >
          <iframe
            src={`${file!.blobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
            title="PDF Preview"
            onLoad={() => setLoading(false)}
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        </Box>
      );
    }

    // Touch handlers for PDF pinch zoom
    const handlePdfTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2) {
        // Pinch gesture detected
        const distance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        setPinchStartDistance(distance);
        setPinchStartScale(scale);
        e.preventDefault();
      }
    };

    const handlePdfTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2 && pinchStartDistance !== null) {
        // Handle pinch zoom
        e.preventDefault();
        e.stopPropagation();

        const distance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );

        const scaleFactor = distance / pinchStartDistance;
        const newScale = pinchStartScale * scaleFactor;

        // Limit scale to reasonable bounds
        setScale(Math.min(Math.max(newScale, 0.2), 5));
      }
    };

    const handlePdfTouchEnd = () => {
      setPinchStartDistance(null);
    };

    return (
      <div
        ref={pdfContainerRef}
        onTouchStart={(e) => {
          handlePdfTouchStart(e);
          handleUserActivity();
        }}
        onTouchMove={handlePdfTouchMove}
        onTouchEnd={handlePdfTouchEnd}
        onMouseMove={handleUserActivity}
        onClick={(e) => {
          handleUserActivity();
          handleContentBackgroundClick(e);
        }}
        style={{
          width: "100%",
          height: "100%",
          overflow: "auto",
          touchAction: "pan-x pan-y",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            minHeight: "100%",
            padding: "20px 0",
          }}
        >
          <Document
            file={file!.blobUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={(error) => {
              console.error("react-pdf failed, falling back to iframe:", error);
              setFallback(true);
            }}
            renderMode="canvas"
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
        </div>
      </div>
    );
  };

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
        onClick={(e) => {
          handleUserActivity();
          handleContentBackgroundClick(e); // Close modal when clicking outside audio player
        }}
        onMouseMove={handleUserActivity}
        onTouchStart={handleUserActivity}
      >
        <Box
          sx={{
            width: "80%",
            maxWidth: 600,
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
            {/* Wrap the whole audio play area with a tooltip */}
            <Tooltip title={isPlaying ? "Pause Audio" : "Play Audio"}>
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
                onClick={(e) => {
                  togglePlay();
                  handleUserActivity();
                  e.stopPropagation(); // Prevent close when clicking on audio player
                }}
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
                {!loading && (
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
                    {isPlaying ? (
                      <PauseIcon sx={{ fontSize: 40, color: "#333" }} />
                    ) : (
                      <PlayArrowIcon sx={{ fontSize: 40, color: "#333" }} />
                    )}
                  </Box>
                )}
              </Box>
            </Tooltip>
          </Box>

          <audio
            ref={audioRef}
            src={file!.blobUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setIsPlaying(false)}
            style={{ display: "none" }}
          />

          <Box sx={{ width: "100%", mb: 1 }}>
            <Slider
              value={currentTime}
              max={duration || 100}
              onChange={(e, value) => {
                handleSeek(e, value);
                handleUserActivity();
              }}
              onMouseDown={handleUserActivity}
              onMouseUp={handleUserActivity}
              onTouchStart={handleUserActivity}
              onTouchEnd={handleUserActivity}
              aria-label="Time"
              sx={{ color: "#1976d2" }}
            />
            <Box
              sx={{ display: "flex", justifyContent: "space-between", px: 1 }}
            >
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
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Tooltip title="Toggle Mute">
                <IconButton
                  onClick={(e) => {
                    toggleMute();
                    handleUserActivity(); // Reset timer when mute is toggled
                    e.stopPropagation(); // Prevent event bubbling
                  }}
                  sx={{
                    color: "white",
                    padding: "6px",
                    zIndex: 2,
                  }}
                >
                  {isMuted ? <VolumeOffIcon /> : <VolumeUpIcon />}
                </IconButton>
              </Tooltip>

              <Slider
                value={volume}
                min={0}
                max={1}
                step={0.01}
                onChange={(e, value) => {
                  handleVolumeChange(e, value);
                  handleUserActivity();
                }}
                onMouseDown={handleUserActivity}
                onMouseUp={handleUserActivity}
                onTouchStart={handleUserActivity}
                onTouchEnd={handleUserActivity}
                aria-label="Volume"
                sx={{
                  color: "white",
                  width: 100,
                  ml: 0.5,
                }}
              />
            </Box>

            <Tooltip title={isPlaying ? "Pause" : "Play"}>
              <IconButton
                onClick={(e) => {
                  togglePlay();
                  handleUserActivity();
                  e.stopPropagation();
                }}
                sx={{
                  backgroundColor: "#81e6d9",
                  color: "white",
                  "&:hover": { backgroundColor: "#81e6d9" },
                }}
              >
                {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>
    );
  };

  const [showControlsBar, setShowControlsBar] = useState(true);
  const [showTopBar, setShowTopBar] = useState(true);
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("mousemove", handleUserActivity);
    container.addEventListener("touchstart", handleUserActivity);

    // Add a passive touch handler to prevent default browser behavior that might interfere with our custom pinch-zoom
    const preventDefaultTouchHandler = (e: TouchEvent) => {
      if (
        e.touches.length > 1 &&
        (file?.mimeType?.startsWith("image/") ||
          ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(
            fileExtension || "",
          ) ||
          file?.mimeType === "application/pdf" ||
          fileExtension === "pdf")
      ) {
        e.preventDefault();
      }
    };

    container.addEventListener("touchstart", preventDefaultTouchHandler, {
      passive: false,
    });

    // Show controls initially, then hide after delay
    handleUserActivity();

    return () => {
      container.removeEventListener("mousemove", handleUserActivity);
      container.removeEventListener("touchstart", handleUserActivity);
      container.removeEventListener("touchstart", preventDefaultTouchHandler);
      if (hideControlsTimeout.current)
        clearTimeout(hideControlsTimeout.current);
    };
  }, [file, fileExtension]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Add wheel event listener for image zooming
    const wheelHandler = (e: WheelEvent) => {
      // Check if we're displaying an image
      if (
        file &&
        (file?.mimeType?.startsWith("image/") ||
          ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(
            fileExtension || "",
          ))
      ) {
        // Force preventDefault to stop scrolling behavior
        e.preventDefault();
        e.stopPropagation();

        // Use a smaller zoom factor for more precise control
        const zoomFactor = 0.1;

        if (e.deltaY < 0) {
          // Scroll up - zoom in
          setScale((prev) => Math.min(prev + zoomFactor, 5));
        } else {
          // Scroll down - zoom out
          setScale((prev) => Math.max(prev - zoomFactor, 0.2));
        }
      }
    };

    // Capture in the capture phase to ensure we get the event first
    container.addEventListener("wheel", wheelHandler, {
      passive: false,
      capture: true,
    });

    return () => {
      container.removeEventListener("wheel", wheelHandler, { capture: true });
    };
  }, [file, fileExtension]);

  // Replace the renderVideo function with this updated version that better matches Google Drive's player
  const renderVideo = () => {
    // Add these new functions for fast forward and rewind
    const handleFastForward = () => {
      if (videoRef.current) {
        const newTime = Math.min(videoRef.current.currentTime + 10, duration);
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
        handleUserActivity(); // Reset timer when controls are used

        // Show fast forward feedback
        setShowFastForwardFeedback(true);
        setTimeout(() => {
          setShowFastForwardFeedback(false);
        }, 500);
      }
    };

    const handleRewind = () => {
      if (videoRef.current) {
        const newTime = Math.max(videoRef.current.currentTime - 10, 0);
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
        handleUserActivity(); // Reset timer when controls are used

        // Show rewind feedback
        setShowRewindFeedback(true);
        setTimeout(() => {
          setShowRewindFeedback(false);
        }, 500);
      }
    };

    // Handle double tap for rewind/fast forward
    const handleVideoTap = (e: React.TouchEvent<HTMLVideoElement>) => {
      const now = new Date().getTime();
      const DOUBLE_TAP_THRESHOLD = 300; // ms
      const x = e.touches[0].clientX;
      const videoWidth = e.currentTarget.clientWidth;

      handleUserActivity(); // Always handle user activity

      // Check if it's a double tap (second tap within threshold time)
      if (now - lastTap < DOUBLE_TAP_THRESHOLD) {
        // Check if tap was on left or right side of video
        if (x < videoWidth / 2) {
          // Left side - rewind
          handleRewind();
        } else {
          // Right side - fast forward
          handleFastForward();
        }
        e.preventDefault(); // Prevent default behavior like zoom
      }

      // Update last tap time
      setLastTap(now);
    };

    // Fixed fullscreen implementation for TypeScript
    const toggleFullScreen = () => {
      const videoContainer = document.getElementById("video-container");
      if (!videoContainer) return;

      if (!document.fullscreenElement) {
        videoContainer.requestFullscreen?.().catch((err) => {
          console.error(
            `Error attempting to enable fullscreen: ${err.message}`,
          );
        });

        // Make sure controls are visible when entering fullscreen
        setShowControlsBar(true);
        // Reset timeout to hide controls after 1 second
        if (hideControlsTimeout.current)
          clearTimeout(hideControlsTimeout.current);
        hideControlsTimeout.current = setTimeout(() => {
          setShowControlsBar(false);
        }, 1000);
      } else {
        document.exitFullscreen?.().catch((err) => {
          console.error(`Error attempting to exit fullscreen: ${err.message}`);
        });
      }
    };

    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center", // Center vertically
          backgroundColor: "transparent",
          position: "relative",
          py: 2,
        }}
        onClick={(e) => {
          handleUserActivity(); // Reset timer when container is clicked
          handleContentBackgroundClick(e); // Close modal when clicking outside video
        }}
        onMouseMove={handleUserActivity} // Reset timer when mouse moves in container
        onMouseLeave={handleMouseLeaveVideo} // Hide controls when mouse leaves
        onTouchStart={handleUserActivity} // Reset timer when touch starts in container
      >
        {/* Video Player Container */}
        <Box
          id="video-container"
          className="no-tap-highlight"
          sx={{
            backgroundColor: "transparent",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 1,
            marginTop: "auto", // Push down from top
            marginBottom: "auto", // Push up from bottom
            overflow: "hidden", // Ensure controls don't overflow
            width: "calc(100% - 34px)", // Adjust width to account for padding
            maxHeight: "calc(100% - 128px)",
          }}
          onMouseMove={handleUserActivity}
          onMouseLeave={handleMouseLeaveVideo}
          onTouchStart={handleUserActivity}
        >
          <video
            ref={videoRef}
            src={file?.blobUrl}
            controls={false}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={(e) => {
              handleLoadedMetadata(e);
              e.currentTarget.playbackRate = playbackSpeed;
            }}
            onEnded={() => {
              setIsPlaying(false);
            }}
            onClick={(e) => {
              togglePlay();
              handleUserActivity(); // Reset timer when video is clicked
              e.stopPropagation(); // Prevent event bubbling
            }}
            onMouseMove={handleUserActivity}
            onTouchStart={(e) => {
              handleVideoTap(e);
              handleUserActivity();
            }}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              cursor: "pointer",
              backgroundColor: "black",
              WebkitTapHighlightColor: "transparent", // Prevent blue highlight on tap
              WebkitTouchCallout: "none", // Prevent callout to copy image on long press
              userSelect: "none", // Prevent text selection
            }}
          />

          {/* Overlay Play Button */}
          {!isPlaying && !loading && (
            <Tooltip title="Play Video">
              <Box
                onClick={togglePlay}
                sx={{
                  position: "absolute",
                  width: "68px",
                  height: "68px",
                  borderRadius: "50%",
                  backgroundColor: "#81e6d9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "transform 0.2s",
                  "&:hover": {
                    transform: "scale(1.1)",
                    backgroundColor: "#81e6d9",
                  },
                }}
              >
                <PlayArrowIcon sx={{ fontSize: 40, color: "white" }} />
              </Box>
            </Tooltip>
          )}

          {loading && (
            <CircularProgress
              size={48}
              sx={{
                position: "absolute",
                color: "white",
              }}
            />
          )}

          {/* Visual feedback indicators for rewind/fast-forward */}
          <Fade in={showRewindFeedback} timeout={200}>
            <Box
              sx={{
                position: "absolute",
                left: "25%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                borderRadius: "50%",
                width: 60,
                height: 60,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 5,
              }}
            >
              <Replay10Icon sx={{ fontSize: 40, color: "white" }} />
            </Box>
          </Fade>

          <Fade in={showFastForwardFeedback} timeout={200}>
            <Box
              sx={{
                position: "absolute",
                right: "25%",
                top: "50%",
                transform: "translate(50%, -50%)",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                borderRadius: "50%",
                width: 60,
                height: 60,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 5,
              }}
            >
              <Forward10Icon sx={{ fontSize: 40, color: "white" }} />
            </Box>
          </Fade>

          {/* Floating Bottom Controls Bar - positioned at bottom of video container */}
          <Box
            className="no-tap-highlight"
            sx={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "16px 24px",
              background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
              display: "flex",
              flexDirection: "column",
              gap: 1,
              opacity: showControlsBar ? 1 : 0,
              transition: "opacity 0.3s ease-in-out",
              width: "100%", // Ensure it spans the width of the video
              zIndex: 10,
              pointerEvents: showControlsBar ? "auto" : "none",
            }}
            onClick={handleUserActivity}
            onMouseMove={handleUserActivity}
            onTouchStart={handleUserActivity}
          >
            <Slider
              value={currentTime}
              max={duration || 100}
              onChange={(e, value) => {
                handleSeek(e, value);
                handleUserActivity(); // Reset timer when seeking
              }}
              onMouseDown={handleUserActivity} // Reset timer on any slider interaction
              onMouseUp={handleUserActivity}
              onTouchStart={handleUserActivity}
              onTouchEnd={handleUserActivity}
              aria-label="Time"
              sx={{
                height: 4,
                "& .MuiSlider-thumb": {
                  width: 12,
                  height: 12,
                  "&:hover": {
                    boxShadow: "0px 0px 0px 8px rgba(219, 68, 55, 0.16)",
                  },
                },
                "& .MuiSlider-rail": {
                  opacity: 0.28,
                },
              }}
            />
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                px: 1,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center" }}>
                {/* Add Rewind Button */}
                <Tooltip title="Rewind 10 seconds">
                  <IconButton
                    onClick={(e) => {
                      handleRewind();
                      handleUserActivity();
                      e.stopPropagation();
                    }}
                    sx={{
                      color: "white",
                      mr: 1,
                    }}
                  >
                    <Replay10Icon />
                  </IconButton>
                </Tooltip>

                <Tooltip title={isPlaying ? "Pause Video" : "Play Video"}>
                  <IconButton
                    onClick={(e) => {
                      togglePlay();
                      handleUserActivity(); // Reset timer when play/pause is clicked
                      e.stopPropagation(); // Prevent event bubbling
                    }}
                    sx={{
                      backgroundColor: "#81e6d9",
                      color: "white",
                      "&:hover": { backgroundColor: "#81e6d9" },
                    }}
                  >
                    {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
                  </IconButton>
                </Tooltip>

                {/* Add Fast Forward Button */}
                <Tooltip title="Fast Forward 10 seconds">
                  <IconButton
                    onClick={(e) => {
                      handleFastForward();
                      handleUserActivity();
                      e.stopPropagation();
                    }}
                    sx={{
                      color: "white",
                      ml: 1,
                    }}
                  >
                    <Forward10Icon />
                  </IconButton>
                </Tooltip>

                <Typography variant="caption" sx={{ color: "white", ml: 1 }}>
                  {formatTime(currentTime)} / {formatTime(duration)}
                </Typography>
              </Box>

              <Box sx={{ display: "flex", alignItems: "center" }}>
                {/* Playback speed selector - now visible in fullscreen */}
                <Box
                  sx={{
                    display: { xs: "none", sm: "block" }, // Hide on extra small screens (typical mobile)
                  }}
                >
                  <Tooltip title="Change playback speed">
                    <Select
                      value={playbackSpeed}
                      onChange={(e) => {
                        const speed = Number(e.target.value);
                        setPlaybackSpeed(speed);
                        if (videoRef.current) {
                          videoRef.current.playbackRate = speed;
                        }
                        handleUserActivity(); // Reset timer when speed is changed
                      }}
                      sx={{
                        color: "white",
                        fontSize: "13px",
                        mr: 2,
                        ".MuiOutlinedInput-notchedOutline": { border: "none" },
                        "& .MuiSvgIcon-root": { color: "white" },
                        backgroundColor: "rgba(255,255,255,0.1)",
                        borderRadius: "4px",
                        WebkitTapHighlightColor: "transparent", // Prevent blue highlight on tap
                      }}
                      MenuProps={{
                        PaperProps: {
                          sx: {
                            backgroundColor: "#333",
                            color: "white",
                            zIndex: 9999, // Ensure it appears above other elements in fullscreen
                          },
                        },
                        // Position the dropdown above the selector
                        anchorOrigin: {
                          vertical: "top",
                          horizontal: "center",
                        },
                        transformOrigin: {
                          vertical: "bottom",
                          horizontal: "center",
                        },
                      }}
                    >
                      {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                        <MenuItem key={speed} value={speed}>
                          {speed === 1 ? "Normal" : `${speed}x`}
                        </MenuItem>
                      ))}
                    </Select>
                  </Tooltip>
                </Box>

                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                  className="no-tap-highlight"
                >
                  <Tooltip title="Toggle Mute">
                    <IconButton
                      onClick={toggleMute}
                      sx={{
                        color: "white",
                        padding: "6px",
                        zIndex: 2,
                        WebkitTapHighlightColor: "transparent",
                      }}
                      className="no-tap-highlight"
                    >
                      {isMuted ? <VolumeOffIcon /> : <VolumeUpIcon />}
                    </IconButton>
                  </Tooltip>

                  <Slider
                    value={volume}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(e, value) => {
                      handleVolumeChange(e, value);
                      handleUserActivity(); // Reset timer when volume is changed
                    }}
                    onMouseDown={handleUserActivity}
                    onMouseUp={handleUserActivity}
                    onTouchStart={handleUserActivity}
                    onTouchEnd={handleUserActivity}
                    aria-label="Volume"
                    className="no-tap-highlight"
                    sx={{
                      color: "white",
                      width: 80,
                      ml: 0.5,
                      WebkitTapHighlightColor: "transparent",
                    }}
                  />
                </Box>

                {/* Add Full Screen Button */}
                <Tooltip title="Toggle Fullscreen">
                  <IconButton
                    onClick={(e) => {
                      toggleFullScreen();
                      handleUserActivity(); // Reset timer when fullscreen is toggled
                      e.stopPropagation(); // Prevent event bubbling
                    }}
                    sx={{
                      color: "white",
                      ml: 1,
                      WebkitTapHighlightColor: "transparent",
                    }}
                    className="no-tap-highlight"
                  >
                    <FullscreenIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  };

  const renderImage = () => {
    // Handle mouse drag for panning images
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault(); // Prevent default behavior
      setDragState({
        ...dragState,
        isDragging: true,
        lastX: e.clientX,
        lastY: e.clientY,
      });
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
      handleUserActivity();
      if (!dragState.isDragging) return;

      e.preventDefault(); // Prevent default behavior

      setDragState({
        ...dragState,
        translateX: dragState.translateX + (e.clientX - dragState.lastX),
        translateY: dragState.translateY + (e.clientY - dragState.lastY),
        lastX: e.clientX,
        lastY: e.clientY,
      });
    };

    const handleMouseUp = () => {
      setDragState({
        ...dragState,
        isDragging: false,
      });
    };

    // Double click to reset zoom and position
    const handleDoubleClick = () => {
      setScale(1.0);
      setDragState({
        isDragging: false,
        lastX: 0,
        lastY: 0,
        translateX: 0,
        translateY: 0,
      });
    };

    // Directly handle wheel events on the image container
    const handleImageWheel = (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const zoomFactor = 0.1;
      if (e.deltaY < 0) {
        // Zoom in
        setScale((prev) => Math.min(prev + zoomFactor, 5));
      } else {
        // Zoom out
        setScale((prev) => Math.max(prev - zoomFactor, 0.2));
      }
    };

    // Handle touch gestures for pinch zoom
    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2) {
        // Pinch gesture detected
        const distance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        setPinchStartDistance(distance);
        setPinchStartScale(scale);
        e.preventDefault();
      } else if (e.touches.length === 1) {
        // Single touch for panning
        setDragState({
          ...dragState,
          isDragging: true,
          lastX: e.touches[0].clientX,
          lastY: e.touches[0].clientY,
        });
      }
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2 && pinchStartDistance !== null) {
        // Handle pinch zoom
        e.preventDefault();
        e.stopPropagation();

        const distance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );

        const scaleFactor = distance / pinchStartDistance;
        const newScale = pinchStartScale * scaleFactor;

        // Limit scale to reasonable bounds
        setScale(Math.min(Math.max(newScale, 0.2), 5));
      } else if (e.touches.length === 1 && dragState.isDragging) {
        // Handle pan
        e.preventDefault();
        setDragState({
          ...dragState,
          translateX:
            dragState.translateX + (e.touches[0].clientX - dragState.lastX),
          translateY:
            dragState.translateY + (e.touches[0].clientY - dragState.lastY),
          lastX: e.touches[0].clientX,
          lastY: e.touches[0].clientY,
        });
      }
    };

    const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length < 2) {
        // Reset pinch zoom tracking when fingers are lifted
        setPinchStartDistance(null);
      }

      if (e.touches.length === 0) {
        // Reset drag state when all fingers are lifted
        setDragState({
          ...dragState,
          isDragging: false,
        });
      }
    };

    return (
      <Box
        sx={{
          position: "relative",
          height: "100%",
          width: "100%",
          backgroundColor: "transparent",
          cursor: dragState.isDragging ? "grabbing" : "grab",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          touchAction: "none", // Disable browser default touch actions
        }}
        onClick={onClose}
        onWheel={handleImageWheel}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100%",
            width: "100%",
            overflow: "hidden",
          }}
        >
          <img
            ref={imageRef}
            src={file!.blobUrl || "/placeholder.svg"}
            alt={file!.name}
            onMouseDown={handleMouseDown}
            onMouseMove={(e) => {
              handleMouseMove(e);
            }}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={(e) => {
              handleUserActivity();
              e.stopPropagation();
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              transformOrigin: "center",
              transform: `scale(${scale}) translate(${dragState.translateX / scale}px, ${dragState.translateY / scale}px)`,
              maxWidth: "100%",
              maxHeight: "100%",
              display: "block",
              margin: "0 auto",
              userSelect: "none",
              pointerEvents: "auto", // Change to auto so we can handle clicks
              transition: dragState.isDragging
                ? "none"
                : "transform 0.15s ease-out",
            }}
            onLoad={() => setLoading(false)}
            onDoubleClick={handleDoubleClick}
          />
        </Box>

        {/* Bottom Bar - only visible when controls should be shown */}
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
            opacity: showControlsBar ? 1 : 0,
            transition: "opacity 0.3s ease-in-out",
            pointerEvents: showControlsBar ? "auto" : "none",
          }}
        >
          <Typography variant="caption" sx={{ color: "#fff", mx: 1 }}>
            {Math.round(scale * 100)}%
          </Typography>

          <Tooltip title="Zoom out">
            <IconButton
              onClick={(e) => {
                handleZoomOut();
                handleUserActivity();
                e.stopPropagation();
              }}
              size="small"
              sx={{ color: "#fff" }}
            >
              <ZoomOutIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Zoom in">
            <IconButton
              onClick={(e) => {
                handleZoomIn();
                handleUserActivity();
                e.stopPropagation();
              }}
              size="small"
              sx={{ color: "#fff" }}
            >
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Reset zoom">
            <IconButton
              onClick={(e) => {
                handleResetZoom();
                handleUserActivity();
                e.stopPropagation();
              }}
              size="small"
              sx={{ color: "#fff" }}
            >
              <RestartAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Typography
            variant="caption"
            sx={{ color: "#fff", mx: 1, opacity: 0.7 }}
          >
            Scroll to zoom
          </Typography>
        </Box>
      </Box>
    );
  };

  const renderWordDoc = () => {
    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
        }}
        onClick={(e) => {
          handleUserActivity();
          handleContentBackgroundClick(e); // Close modal when clicking outside document
        }}
      >
        {/* Word document content container */}
        <Box
          sx={{
            width: "100%",
            height: "100%",
            overflow: "auto",
            backgroundColor: "white",
            "& *": { color: "#000 !important" },
          }}
        >
          <Box
            sx={{
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              width: `calc(100% / ${scale})`,
            }}
          >
            <div
              dangerouslySetInnerHTML={{ __html: wordDocContent }}
              style={{
                fontFamily: "Arial, sans-serif",
                lineHeight: "1.5",
                padding: "16px",
                boxSizing: "border-box",
              }}
              onClick={(e) => {
                e.stopPropagation(); // Prevent closing when clicking on the document content
              }}
            />
          </Box>
        </Box>

        {/* Bottom Bar (same as for PDF) */}
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
            opacity: showControlsBar ? 1 : 0,
            transition: "opacity 0.3s ease-in-out",
            pointerEvents: showControlsBar ? "auto" : "none",
          }}
        >
          <Tooltip title="Zoom out">
            <IconButton
              onClick={handleZoomOut}
              size="small"
              sx={{ color: "#fff" }}
            >
              <ZoomOutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom in">
            <IconButton
              onClick={handleZoomIn}
              size="small"
              sx={{ color: "#fff" }}
            >
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reset zoom">
            <IconButton
              onClick={handleResetZoom}
              size="small"
              sx={{ color: "#fff" }}
            >
              <RestartAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    );
  };

  const renderContent = () => {
    if (!file) return null;

    if (file.mimeType === "application/pdf" || fileExtension === "pdf") {
      return renderPdf();
    }

    if (file.mimeType === "text/plain" || fileExtension === "txt") {
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
          onClick={(e) => {
            // Only close if clicking directly on the container background (not the text itself)
            if (e.target === e.currentTarget) {
              onClose();
            }
            e.stopPropagation();
          }}
        >
          {textContent}
        </Box>
      );
    }

    if (
      file?.mimeType?.startsWith("audio/") ||
      fileExtension === "mp3" ||
      fileExtension === "wav" ||
      fileExtension === "m4a"
    ) {
      return renderAudio();
    }

    if (
      file?.mimeType?.startsWith("video/") ||
      fileExtension === "mp4" ||
      fileExtension === "mov" ||
      fileExtension === "webm"
    ) {
      return renderVideo();
    }

    if (
      file?.mimeType?.startsWith("image/") ||
      ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(
        fileExtension || "",
      )
    ) {
      return renderImage();
    }

    if (
      file.mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileExtension === "doc" ||
      fileExtension === "docx"
    ) {
      return renderWordDoc();
    }

    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "transparent",
        }}
        onClick={onClose}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255, 255, 255, 0.1)",
            backdropFilter: "blur(10px)",
            borderRadius: 4,
            padding: 4,
            width: { xs: "80%", sm: "60%", md: "40%" },
            maxWidth: 400,
          }}
        >
          <Box
            sx={{
              backgroundColor: "rgba(0, 0, 0, 0.1)",
              borderRadius: "50%",
              width: 120,
              height: 120,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mb: 3,
            }}
          >
            {getFileIcon(file?.mimeType, 64, 64)}
          </Box>
          <Typography
            variant="h6"
            align="center"
            sx={{ color: "white", mb: 1 }}
          >
            Unsupported File Type
          </Typography>
          <Typography
            variant="body2"
            align="center"
            sx={{ color: "rgba(255, 255, 255, 0.7)" }}
          >
            Preview is not available for{" "}
            {fileExtension ? `.${fileExtension} files` : "this file"}
          </Typography>
        </Box>
      </Box>
    );
  };

  if (!file) return null;

  // Also update the Dialog component to remove borders and make it more like Google Drive
  // Function to handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    // Check if the click is on the backdrop (not on the content)
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Close modal when clicking on background areas around media elements
  const handleContentBackgroundClick = (e: React.MouseEvent) => {
    // Only close if clicking directly on the container background
    // (not on controls, media elements, or their direct children)
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth={false}
      slotProps={{
        paper: {
          sx: {
            width: "100dvw",
            height: "100dvh",
            maxWidth: "100dvw",
            maxHeight: "100dvh",
            borderRadius: 0,
            overflow: "hidden",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            m: 0,
            // Fix gray background
            backgroundImage: "none",
            // Add meta viewport tag for proper mobile scaling
            "&::before": {
              content: '""',
              height: 0,
            },
          },
        },
      }}
      BackdropProps={{
        sx: {
          backgroundColor: "rgba(0, 0, 0, 0.5)",
        },
        onClick: handleBackdropClick,
      }}
    >
      {
        <Box
          className="a-b-K a-b-K-Hyc8Sd"
          role="toolbar"
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            px: 1.5,
            py: 0.75,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            color: "#e8eaed",
            height: "64px",
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1200,
            transition: "opacity 0.3s ease-in-out",
            opacity: showTopBar ? 1 : 0,
            pointerEvents: showTopBar ? "auto" : "none",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", flex: 1 }}>
            <IconButton
              onClick={onClose}
              sx={{ color: "#C4C7C5", mr: 1 }}
              aria-label="Close"
            >
              <CloseIcon />
            </IconButton>

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
              }}
            >
              {/* File icon based on type */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 24,
                }}
              >
                {getFileIcon(file?.mimeType)}
              </Box>

              {/* File name */}
              <Typography
                variant="body1"
                sx={{
                  color: "#e8eaed",
                  fontWeight: 700,
                  fontSize: "15px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: { xs: "200px", sm: "300px", md: "400px" },
                }}
              >
                {file?.name ? file.name : "Encrypted File"}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            {/* Download button */}
            <Tooltip title="Download">
              <IconButton
                href={file?.blobUrl || ""}
                download={file?.name}
                sx={{ color: "#e8eaed" }}
                aria-label="Download"
              >
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      }

      <DialogContent
        sx={{
          height: "100vh",
          p: 0,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "transparent",
          border: "none",
          boxSizing: "border-box",
          touchAction: "none", // Disable default browser touch actions to prevent conflicts with our pinch zoom
        }}
        onClick={handleBackdropClick}
      >
        <Box
          ref={containerRef}
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start", // Start from the top for PDFs
            overflow: "auto",
            width: "100%",
            height: "100%", // Ensure full height
            background: "transparent",
            "& .react-pdf__Document": {
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              paddingTop: "20px", // Add padding at top
            },
          }}
          onClick={handleContentBackgroundClick}
          onWheel={(e) => {
            // Check if we're displaying an image
            if (
              file &&
              (file?.mimeType?.startsWith("image/") ||
                ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(
                  fileExtension || "",
                ))
            ) {
              e.preventDefault();

              // Apply zoom directly from the React synthetic event
              const zoomFactor = 0.1;
              if (e.deltaY < 0) {
                // Zoom in
                setScale((prev) => Math.min(prev + zoomFactor, 5));
              } else {
                // Zoom out
                setScale((prev) => Math.max(prev - zoomFactor, 0.2));
              }
            }
          }}
          onTouchStart={(e) => {
            // Global touch handler for all file types
            // This ensures that user activity is tracked even on touch devices
            handleUserActivity();

            // Handle PDF and image pinch zooms at container level
            if (
              e.touches.length === 2 &&
              (file?.mimeType?.startsWith("image/") ||
                ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(
                  fileExtension || "",
                ) ||
                file?.mimeType === "application/pdf" ||
                fileExtension === "pdf")
            ) {
              const distance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY,
              );
              setPinchStartDistance(distance);
              setPinchStartScale(scale);
            }
          }}
          onTouchMove={(e) => {
            // Handle pinch zoom at container level
            if (
              e.touches.length === 2 &&
              pinchStartDistance !== null &&
              (file?.mimeType?.startsWith("image/") ||
                ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(
                  fileExtension || "",
                ) ||
                file?.mimeType === "application/pdf" ||
                fileExtension === "pdf")
            ) {
              e.preventDefault();

              const distance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY,
              );

              const scaleFactor = distance / pinchStartDistance;
              const newScale = pinchStartScale * scaleFactor;

              // Limit scale to reasonable bounds
              setScale(Math.min(Math.max(newScale, 0.2), 5));
            }
          }}
          onTouchEnd={() => {
            setPinchStartDistance(null);
          }}
        >
          {renderContent()}
        </Box>

        {/* Bottom Bar for PDFs */}
        {!fallback &&
          numPages &&
          (file.mimeType === "application/pdf" || fileExtension === "pdf") && (
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
                opacity: showControlsBar ? 1 : 0,
                transition: "opacity 0.3s ease-in-out",
                pointerEvents: showControlsBar ? "auto" : "none",
              }}
              onClick={(e) => {
                handleUserActivity();
                e.stopPropagation();
              }}
              onMouseMove={(e) => {
                handleUserActivity();
                e.stopPropagation();
              }}
              onTouchStart={(e) => {
                handleUserActivity();
                e.stopPropagation();
              }}
            >
              <IconButton
                onClick={(e) => {
                  handlePrev();
                  handleUserActivity();
                  e.stopPropagation();
                }}
                size="small"
                sx={{ color: "#fff" }}
              >
                <ArrowBackIosNewIcon fontSize="small" />
              </IconButton>

              <Typography variant="body2" mx={1}>
                Page
              </Typography>

              <InputBase
                value={pageNumber}
                onChange={(e) => {
                  const value = Number.parseInt(e.target.value);
                  if (!isNaN(value)) scrollToPage(value);
                  handleUserActivity();
                }}
                onClick={(e) => {
                  handleUserActivity();
                  e.stopPropagation();
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

              <IconButton
                onClick={(e) => {
                  handleNext();
                  handleUserActivity();
                  e.stopPropagation();
                }}
                size="small"
                sx={{ color: "#fff" }}
              >
                <ArrowForwardIosIcon fontSize="small" />
              </IconButton>

              <Box
                sx={{ mx: 1, height: "20px", borderLeft: "1px solid #666" }}
              />

              <Tooltip title="Zoom out">
                <IconButton
                  onClick={handleZoomOut}
                  size="small"
                  sx={{ color: "#fff" }}
                >
                  <ZoomOutIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Zoom in">
                <IconButton
                  onClick={handleZoomIn}
                  size="small"
                  sx={{ color: "#fff" }}
                >
                  <ZoomInIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Reset zoom">
                <IconButton
                  onClick={handleResetZoom}
                  size="small"
                  sx={{ color: "#fff" }}
                >
                  <RestartAltIcon fontSize="small" />
                </IconButton>
              </Tooltip>
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
  );
};

// Helper component for audio icon
const AudioIcon = ({ size = 24 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 16C10.9 16 9.88 15.61 9.11 14.88C8.35 14.16 7.94 13.18 7.94 12.12C7.94 10.06 9.73 8.27 11.79 8.27C11.97 8.27 12.15 8.29 12.33 8.32C11.89 8.95 11.65 9.71 11.65 10.5C11.65 11.27 11.86 11.99 12.26 12.61C12.66 13.23 13.22 13.69 13.89 13.97C13.45 15.19 12.69 16 12 16Z"
      fill="#FFF"
    />
  </svg>
);

export default FilePreviewModal;
