import {
  Link as LinkIcon,
  Security as SecurityIcon,
  Lock as LockIcon,
  GitHub as GitHubIcon,
  Laptop as LaptopIcon,
  Person as PersonIcon,
} from "@mui/icons-material";
import {
  Box,
  Typography,
  Button,
  Container,
  Divider,
  Stack,
  Grid,
  Link as MuiLink,
  Alert,
  Paper,
} from "@mui/material";
import Upload from "../components/Upload";
import "../SecurityFeatures.css";
import { useState } from "react";
import { FileMetadata } from "../types";
import { ErrorResponse, ShareResponse } from "../myApi";
import { isAuthenticated } from "../utils";
import { bufferToBase64 } from "../cryptoFunctions";

export function Home() {
  const [uploadResults, setUploadResults] = useState<
    {
      file: string | FileMetadata;
      result: ShareResponse | ErrorResponse;
      base64Key?: string;
    }[]
  >([]);
  async function encodeBase64(key: CryptoKey) {
    return bufferToBase64(await crypto.subtle.exportKey("raw", key));
  }
  const features = [
    {
      icon: <LinkIcon fontSize="medium" />,
      title: "Secure Link Sharing",
      description:
        "Generate secure, expiring links for file sharing with optional password protection.",
    },
    {
      icon: <SecurityIcon fontSize="medium" />,
      title: "2FA Protection",
      description:
        "Add an extra layer of security with two-factor authentication for your account.",
    },
    {
      icon: <LockIcon fontSize="medium" />,
      title: "End-to-End Encryption",
      description:
        "Military-grade encryption ensures your files remain private and secure.",
    },
    {
      icon: <GitHubIcon fontSize="medium" />,
      title: "Free & Open Source",
      description:
        "Our software is free and open source. Inspect, modify, and contribute to the codebase.",
      link: "https://github.com/Cyanistic/lokr",
    },
    {
      icon: <LaptopIcon fontSize="medium" />,
      title: "Cross-Platform Support",
      description:
        "Access your files from any device with our responsive web interface.",
    },
    {
      icon: <PersonIcon fontSize="medium" />,
      title: "Zero-Knowledge Storage",
      description:
        "We never see or store your encryption keys, ensuring complete data privacy.",
    },
  ];

  // Technologies used in the project
  const technologies = [
    {
      name: "React",
      icon: "/react.svg",
    },
    {
      name: "TypeScript",
      icon: "/typescript.svg",
    },
    {
      name: "Rust",
      icon: "/rust.svg",
    },
    { name: "Material UI", icon: "/mui.png" },
  ];

  // Social links
  const socialLinks = [
    {
      name: "GitHub",
      icon: <GitHubIcon />,
      url: "https://github.com/Cyanistic/lokr",
    },
  ];

  return (
    <Box className="main">
      <Box
        className="main-home-box"
        display="flex"
        justifyContent="space-between"
        alignItems="center"
      >
        <Box className="left-home-box">
          <Typography variant="h1" component="h1" gutterBottom>
            Secure File Sharing <br /> Made{" "}
            <span style={{ color: "#81E6D9" }}>Simple</span>
          </Typography>
          <Typography variant="body1" gutterBottom>
            Share files with confidence using encryption and advanced privacy
            features.
          </Typography>
          <Box className="home-buttons" display="flex" gap={2}>
            <Button variant="contained" color="primary" href="/register">
              Start Sharing
            </Button>
            <Button variant="outlined" color="primary" href="/about">
              Learn More
            </Button>
          </Box>
        </Box>

        <Box className="right-home-box" sx={{ gap: 2 }}>
          <Upload
            onUpload={async (
              file: string | FileMetadata,
              result: ShareResponse | ErrorResponse,
            ) => {
              const base64Key =
                typeof file === "string"
                  ? undefined
                  : await encodeBase64(file.key!);
              setUploadResults((prev) => [
                ...prev,
                {
                  file,
                  result,
                  base64Key,
                },
              ]);
            }}
          />
          {!isAuthenticated() && uploadResults.length > 0 && (
            <Box
              component={Paper}
              elevation={3}
              sx={{
                p: 2,
                width: 350,
                maxHeight: 500, // Set max height
                overflow: "auto", // Enable scrolling
                display: "flex",
                flexDirection: "column",
                gap: 1,
              }}
            >
              <Typography variant="h6" gutterBottom>
                Upload Results
              </Typography>
              <Divider sx={{ mb: 2 }} />
              {uploadResults.map(({ file, result, base64Key }, index) => {
                const displayName = typeof file === "string" ? file : file.name;

                if ("linkId" in result) {
                  const shareUrl = `${window.location.protocol}//${window.location.host}/share?linkId=${result.linkId}${base64Key ? `#${base64Key}` : ""}`;

                  return (
                    <Box key={index} sx={{ mb: 2 }}>
                      <Typography variant="body1" fontWeight="bold">
                        {displayName}
                      </Typography>
                      <MuiLink
                        href={shareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {shareUrl}
                      </MuiLink>
                    </Box>
                  );
                } else {
                  return (
                    <Alert key={index} severity="error" sx={{ mb: 2 }}>
                      <Typography variant="body1" fontWeight="bold">
                        {displayName}
                      </Typography>
                      <Typography variant="body2">
                        {(result as ErrorResponse).message}
                      </Typography>
                    </Alert>
                  );
                }
              })}
            </Box>
          )}
        </Box>
      </Box>

      <Box component="section" className="security-section" mt={4}>
        <Typography variant="h2" className="security-title" gutterBottom>
          Advanced Security Features
        </Typography>
        <Typography
          variant="subtitle1"
          className="security-subtitle"
          gutterBottom
        >
          Protect your files with industry-leading security measures
        </Typography>

        <Box
          className="security-cards"
          display="flex"
          flexWrap="wrap"
          justifyContent="center"
          gap={2}
        >
          {features.map((feature, index) => (
            <Box
              key={index}
              className="security-card"
              sx={{
                p: 2,
                boxShadow: 3,
                borderRadius: 2,
                textAlign: "center",
              }}
            >
              <Box className="icon-wrapper" mb={1}>
                {feature.icon}
              </Box>
              <Typography variant="h6">{feature.title}</Typography>
              <Typography variant="body2" paragraph>
                {feature.description}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ bgcolor: "gray.900", py: 6 }}>
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            {/* About Project Section */}
            <Grid item xs={12} md={4}>
              <Typography
                variant="subtitle1"
                fontWeight="semibold"
                gutterBottom
              >
                About Lokr
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                Lokr is an open-source secure file sharing platform focused on
                privacy and end-to-end encryption. Share files with confidence
                using military-grade encryption and zero-knowledge architecture.
              </Typography>
              <Stack
                direction="row"
                spacing={2}
                sx={{ mt: 2, justifyContent: "center" }}
              >
                {socialLinks.map((link, i) => (
                  <Button
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="outlined"
                    size="small"
                    sx={{
                      color: "#a0aec0",
                      borderColor: "#2d3748",
                      minWidth: "auto",
                      "&:hover": {
                        borderColor: "primary.main",
                        color: "white",
                      },
                    }}
                  >
                    {link.icon}
                  </Button>
                ))}
              </Stack>
            </Grid>

            {/* Built With Section */}
            <Grid item xs={12} md={4}>
              <Typography
                variant="subtitle1"
                fontWeight="semibold"
                gutterBottom
              >
                Built With
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: 2,
                  mt: 1,
                }}
              >
                {technologies.map((tech, index) => (
                  <Box
                    key={index}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      mr: 2,
                      mb: 1,
                    }}
                  >
                    <Box
                      component="img"
                      src={tech.icon}
                      alt={tech.name}
                      sx={{
                        height: 32,
                        width: 32,
                        mr: 1,
                      }}
                    />
                    <Typography variant="body2">{tech.name}</Typography>
                  </Box>
                ))}
              </Box>
            </Grid>

            {/* Security Commitment Section */}
            <Grid item xs={12} md={4}>
              <Typography
                variant="subtitle1"
                fontWeight="semibold"
                gutterBottom
              >
                Our Security Commitment
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                Your privacy is our priority. We're committed to:
              </Typography>
              <Stack spacing={1.5}>
                {[
                  "End-to-end encryption for all files",
                  "Zero-knowledge architecture",
                  "Open-source transparency",
                ].map((item, index) => (
                  <Box
                    key={index}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                    }}
                  >
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: "primary.main",
                        flexShrink: 0,
                      }}
                    />
                    <Typography variant="body2">{item}</Typography>
                  </Box>
                ))}
              </Stack>
            </Grid>
          </Grid>

          <Divider sx={{ my: 4, borderColor: "#2d3748" }} />

          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
            spacing={2}
          >
            <Box>
              <Typography variant="body2">
                © 2025 Lokr. All rights reserved.
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: "#4a5568", display: "block" }}
              >
                Version - {__COMMIT_HASH__}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: "#4a5568" }}>
              Made with ❤️ for the open-source community
            </Typography>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}

export default Home;
