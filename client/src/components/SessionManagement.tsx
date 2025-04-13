/*File contains code for displaying Session Management section on the Profile page*/

import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Stack,
} from "@mui/material";
import {
  Computer,
  Smartphone,
  Tablet,
  Warning as AlertTriangle,
  Info,
  Logout,
} from "@mui/icons-material";
import { API } from "../utils";
import { UAParser } from "ua-parser-js";
import { useToast } from "./ToastProvider";
import { Session } from "../myApi";
import { useProfile } from "./ProfileProvider";

export default function SessionManagement() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const { showError } = useToast();
  const [error, setError] = useState<string | null>(null);
  const { profile } = useProfile();

  useEffect(() => {
    // Fetch sessions
    const fetchSessions = async () => {
      try {
        setLoading(true);

        const response = await API.api.getSessions();

        if (!response.ok) throw response.error;

        setSessions(response.data);
      } catch (err) {
        showError("Failed to load session data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, [profile]);

  const handleTerminateSession = async (sessionNumber: number) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to log out this device?",
    );
    if (!confirmDelete) return;

    try {
      const response = await API.api.deleteSession(sessionNumber);

      if (!response.ok) throw response.error;
      // Remove deleted session from the state
      setSessions((prev) =>
        prev.filter((session) => session.number !== sessionNumber),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete session");
      showError("Failed to delete session", err);
    }
  };

  const parseDeviceInfo = (userAgent: string | null | undefined) => {
    if (!userAgent) {
      return {
        deviceType: "unknown",
        os: "Unknown",
        browser: "Unknown",
        formattedString: "Unknown device",
        version: "",
        model: "",
        vendor: "",
        cpu: "",
      };
    }

    // Use UA-Parser-JS for more accurate and detailed device detection
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    // Extract detailed information
    const browser = result.browser.name || "Unknown";
    const browserVersion = result.browser.version || "";
    const os = result.os.name || "Unknown";
    const osVersion = result.os.version || "";
    const deviceVendor = result.device.vendor || "";
    const deviceModel = result.device.model || "";
    const deviceType = result.device.type || "desktop";
    const cpu = result.cpu.architecture || "";

    // Create a formatted string with the most relevant information
    let formattedString = `${os}${osVersion ? ` ${osVersion}` : ""} • ${browser}${browserVersion ? ` ${browserVersion}` : ""}`;

    // Add device model information if available
    if (deviceVendor && deviceModel) {
      formattedString = `${deviceVendor} ${deviceModel} • ${formattedString}`;
    }

    return {
      deviceType,
      os,
      osVersion,
      browser,
      browserVersion,
      model: deviceModel,
      vendor: deviceVendor,
      cpu,
      formattedString,
    };
  };

  const getDeviceIcon = (deviceInfo: ReturnType<typeof parseDeviceInfo>) => {
    switch (deviceInfo.deviceType) {
      case "mobile":
        return <Smartphone fontSize="small" />;
      case "tablet":
        return <Tablet fontSize="small" />;
      case "desktop":
      case "console":
      case "embedded":
      default:
        return <Computer fontSize="small" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: true,
    });
  };

  const getTimeSinceLastActive = (lastUsedAt: string) => {
    const lastUsed = new Date(lastUsedAt);
    const now = new Date();
    const diffInMs = now.getTime() - lastUsed.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));

    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hours ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return "1 day ago";
    return `${diffInDays} days ago`;
  };

  // Determine if a session might be suspicious based on patterns
  const isSuspiciousSession = (session: Session, index: number) => {
    if (index === 0) return false; // Current session is not suspicious

    const deviceInfo = parseDeviceInfo(session.userAgent);
    const lastActive = new Date(session.lastUsedAt);
    const now = new Date();
    const inactiveDays = Math.floor(
      (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Sessions inactive for more than 30 days might be suspicious
    if (inactiveDays > 30) return true;

    // Unknown device types might be suspicious
    if (deviceInfo.deviceType === "unknown") return true;

    return false;
  };

  if (loading) {
    return (
      <Box sx={{ textAlign: "center", py: 4 }}>
        <CircularProgress size={24} sx={{ mr: 1 }} />
        <Typography variant="body1">Loading session data...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          p: 1.25,
          borderRadius: 0.5,
          bgcolor: "rgba(231, 76, 60, 0.1)",
          color: "#e74c3c",
          border: "1px solid #e74c3c",
        }}
      >
        <AlertTriangle fontSize="small" />
        <Typography variant="body2">{error}</Typography>
      </Alert>
    );
  }

  return (
    <Paper
      elevation={1}
      sx={{
        mt: 3.75,
        p: { xs: 1.5, sm: 2.5 },
        borderRadius: 1.25,
        bgcolor: (theme) =>
          theme.palette.mode === "dark" ? "background.paper" : "#f9f9f9",
        border: 1,
        borderColor: (theme) =>
          theme.palette.mode === "dark" ? "#304b53" : "#e2e8f0",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          mb: 2.5,
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "flex-start", sm: "center" },
          gap: { xs: 1.25, sm: 0 },
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600, m: 0 }}>
          Sessions
        </Typography>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            color: (theme) =>
              theme.palette.mode === "dark" ? "#a0aec0" : "#666",
            fontSize: "0.875rem",
          }}
        >
          <Info fontSize="small" />
          <Typography variant="body2">
            Devices currently logged into your account
          </Typography>
        </Box>
      </Box>

      {sessions.length === 0 ? (
        <Box
          sx={{
            textAlign: "center",
            py: 2.5,
            color: (theme) =>
              theme.palette.mode === "dark" ? "#a0aec0" : "#666",
          }}
        >
          <Typography variant="body1">No active sessions found</Typography>
        </Box>
      ) : (
        <>
          {/* Current Session */}
          {sessions.length > 0 && (
            <Box sx={{ mb: 3.125 }}>
              <Typography
                variant="subtitle1"
                sx={{
                  fontSize: "1rem",
                  fontWeight: 500,
                  mb: 1.5,
                }}
              >
                Current Session
              </Typography>
              <Paper
                elevation={0}
                sx={{
                  p: { xs: 1.25, sm: 1.875 },
                  mb: 1.875,
                  bgcolor: (theme) =>
                    theme.palette.mode === "dark" ? "#151c29" : "#fff",
                  borderRadius: 1,
                  border: 1,
                  borderColor: (theme) =>
                    theme.palette.mode === "dark" ? "#304b53" : "#e2e8f0",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: { xs: "column", sm: "row" },
                    alignItems: "flex-start",
                    gap: 1.875,
                  }}
                >
                  {sessions[0] && (
                    <>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          bgcolor: (theme) =>
                            theme.palette.mode === "dark"
                              ? "#304b53"
                              : "#e2e8f0",
                          color: (theme) =>
                            theme.palette.mode === "dark"
                              ? "#81e6d9"
                              : "#304b53",
                          flexShrink: 0,
                        }}
                      >
                        {getDeviceIcon(parseDeviceInfo(sessions[0].userAgent))}
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: { xs: "column", sm: "row" },
                            alignItems: { xs: "flex-start", sm: "center" },
                            gap: { xs: 0.5, sm: 1.25 },
                            mb: 0.625,
                          }}
                        >
                          <Typography
                            variant="body1"
                            sx={{ fontWeight: "bold", wordBreak: "break-word" }}
                          >
                            {
                              parseDeviceInfo(sessions[0].userAgent)
                                .formattedString
                            }
                          </Typography>
                          <Chip
                            label="Current"
                            size="small"
                            sx={{
                              bgcolor: "#81e6d9",
                              color: "#151c29",
                              fontSize: "0.75rem",
                              fontWeight: 500,
                              borderRadius: 0.5,
                              height: "auto",
                              py: 0.25,
                              mt: { xs: 0.5, sm: 0 },
                            }}
                          />
                        </Box>
                        <Box
                          sx={{
                            fontSize: "0.875rem",
                            color: (theme) =>
                              theme.palette.mode === "dark"
                                ? "#a0aec0"
                                : "#666",
                          }}
                        >
                          <Typography variant="body2" sx={{ my: 0.375 }}>
                            Created: {formatDate(sessions[0].createdAt)}
                          </Typography>
                          <Typography variant="body2" sx={{ my: 0.375 }}>
                            Last Used: {formatDate(sessions[0].lastUsedAt)}
                          </Typography>
                          {parseDeviceInfo(sessions[0].userAgent).cpu && (
                            <Typography variant="body2" sx={{ my: 0.375 }}>
                              CPU: {parseDeviceInfo(sessions[0].userAgent).cpu}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </>
                  )}
                </Box>
              </Paper>
            </Box>
          )}

          {/* Other Sessions */}
          {sessions.length > 1 && (
            <Box sx={{ mb: 3.125 }}>
              <Typography
                variant="subtitle1"
                sx={{
                  fontSize: "1rem",
                  fontWeight: 500,
                  mb: 1.5,
                }}
              >
                Other Sessions
              </Typography>
              <Stack spacing={1.875}>
                {sessions.slice(1).map((session, index) => {
                  const deviceInfo = parseDeviceInfo(session.userAgent);
                  const suspicious = isSuspiciousSession(session, index + 1);

                  return (
                    <Paper
                      key={session.number}
                      elevation={0}
                      sx={{
                        p: { xs: 1.25, sm: 1.875 },
                        bgcolor: (theme) =>
                          theme.palette.mode === "dark" ? "#151c29" : "#fff",
                        borderRadius: 1,
                        border: 1,
                        borderColor: suspicious
                          ? "#e74c3c"
                          : (theme) =>
                              theme.palette.mode === "dark"
                                ? "#304b53"
                                : "#e2e8f0",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: { xs: "flex-start", sm: "center" },
                        flexDirection: { xs: "column", sm: "row" },
                        gap: { xs: 1.875, sm: 0 },
                        position: "relative",
                        ...(suspicious && {
                          "&::before": {
                            content: '""',
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "4px",
                            height: "100%",
                            backgroundColor: "#e74c3c",
                            borderTopLeftRadius: "4px",
                            borderBottomLeftRadius: "4px",
                          },
                        }),
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 1.875,
                          width: { xs: "100%", sm: "auto" },
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 40,
                            height: 40,
                            borderRadius: "50%",
                            bgcolor: (theme) =>
                              theme.palette.mode === "dark"
                                ? "#304b53"
                                : "#e2e8f0",
                            color: (theme) =>
                              theme.palette.mode === "dark"
                                ? "#81e6d9"
                                : "#304b53",
                            flexShrink: 0,
                          }}
                        >
                          {getDeviceIcon(deviceInfo)}
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Box
                            sx={{
                              display: "flex",
                              flexDirection: { xs: "column", sm: "row" },
                              alignItems: { xs: "flex-start", sm: "center" },
                              gap: { xs: 0.5, sm: 1 },
                              mb: 0.625,
                            }}
                          >
                            <Typography
                              variant="body1"
                              sx={{
                                fontWeight: "bold",
                                wordBreak: "break-word",
                              }}
                            >
                              {deviceInfo.formattedString}
                            </Typography>
                            {suspicious && (
                              <Chip
                                label="Suspicious"
                                size="small"
                                color="error"
                                sx={{
                                  fontSize: "0.75rem",
                                  fontWeight: 500,
                                  borderRadius: 0.5,
                                  height: "auto",
                                  py: 0.25,
                                  mt: { xs: 0.5, sm: 0 },
                                }}
                              />
                            )}
                          </Box>
                          <Box
                            sx={{
                              fontSize: "0.875rem",
                              color: (theme) =>
                                theme.palette.mode === "dark"
                                  ? "#a0aec0"
                                  : "#666",
                            }}
                          >
                            <Typography variant="body2" sx={{ my: 0.375 }}>
                              Last Active:{" "}
                              {getTimeSinceLastActive(session.lastUsedAt)}
                            </Typography>
                            <Typography variant="body2" sx={{ my: 0.375 }}>
                              Created: {formatDate(session.createdAt)}
                            </Typography>
                            {deviceInfo.model && (
                              <Typography variant="body2" sx={{ my: 0.375 }}>
                                Device: {deviceInfo.vendor} {deviceInfo.model}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </Box>
                      <Button
                        variant="outlined"
                        color="error"
                        startIcon={<Logout fontSize="small" />}
                        onClick={() => handleTerminateSession(session.number)}
                        sx={{
                          mt: { xs: 1.875, sm: 0 },
                          alignSelf: { xs: "stretch", sm: "center" },
                          borderColor: "#e74c3c",
                          color: "#e74c3c",
                          "&:hover": {
                            bgcolor: "#e74c3c",
                            color: "white",
                            borderColor: "#e74c3c",
                          },
                        }}
                      >
                        Log Out
                      </Button>
                    </Paper>
                  );
                })}
              </Stack>
            </Box>
          )}
        </>
      )}
    </Paper>
  );
}
