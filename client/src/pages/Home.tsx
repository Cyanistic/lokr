import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import InstagramIcon from "@mui/icons-material/Instagram";
import LinkIcon from "@mui/icons-material/Link";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import LockIcon from "@mui/icons-material/Lock";
import EncryptionIcon from "@mui/icons-material/LockOutlined";
import SecurityIcon from "@mui/icons-material/Security";
import TwitterIcon from "@mui/icons-material/Twitter";
import {
  AppBar,
  Box,
  Button,
  Container,
  Divider,
  Grid,
  IconButton,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";

export default function Home(){
  // Navigation links data
  const navLinks = [
    { title: "Features", active: true },
    { title: "Security", active: false },
    { title: "Pricing", active: false },
    { title: "Support", active: false },
  ];

  // Security features data
  const securityFeatures = [
    {
      icon: <LinkIcon />,
      title: "Secure Link Sharing",
      description:
        "Generate secure, expiring links for file sharing with optional password protection.",
    },
    {
      icon: <SecurityIcon />,
      title: "2FA Protection",
      description:
        "Add an extra layer of security with two-factor authentication for your account.",
    },
    {
      icon: <EncryptionIcon />,
      title: "End-to-End Encryption",
      description:
        "Military-grade encryption ensures your files remain private and secure.",
    },
  ];

  // Footer links data
  const footerSections = [
    {
      title: "Product",
      links: ["Features", "Security", "Pricing"],
    },
    {
      title: "Company",
      links: ["About", "Blog", "Careers"],
    },
    {
      title: "Support",
      links: ["Help Center", "Contact", "Status"],
    },
    {
      title: "Legal",
      links: ["Privacy", "Terms", "Cookie Policy"],
    },
  ];

  return (
    <Box sx={{ bgcolor: "#1a202c", color: "white", minHeight: "100vh" }}>
      {/* Header */}
      <AppBar
        position="static"
        sx={{
          bgcolor: "rgba(26, 32, 44, 0.95)",
          borderBottom: 1,
          borderColor: "grey.800",
        }}
      >
        <Container maxWidth="lg">
          <Toolbar disableGutters>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ mr: 2 }}
            >
              <LockIcon />
              <Typography variant="h5" fontWeight="bold">
                Lokr
              </Typography>
            </Stack>

            <Stack direction="row" spacing={3} sx={{ flexGrow: 1 }}>
              {navLinks.map((link) => (
                <Typography
                  key={link.title}
                  sx={{
                    color: link.active ? "white" : "#a0aec0",
                    cursor: "pointer",
                    "&:hover": { color: "white" },
                  }}
                >
                  {link.title}
                </Typography>
              ))}
            </Stack>

            <Stack direction="row" spacing={2} alignItems="center">
              <Typography
                sx={{
                  color: "#a0aec0",
                  cursor: "pointer",
                  "&:hover": { color: "white" },
                }}
              >
                Sign In
              </Typography>
              <Button
                variant="contained"
                sx={{
                  bgcolor: "#81e6d9",
                  color: "#1a202c",
                  "&:hover": { bgcolor: "#4fd1c5" },
                }}
              >
                Get Started
              </Button>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      {/* Hero Section */}
      <Box sx={{ py: 8 }}>
        <Container maxWidth="lg">
          <Grid container spacing={6} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography
                variant="h3"
                component="h1"
                fontWeight="bold"
                gutterBottom
              >
                Secure File Sharing Made{" "}
                <Box component="span" sx={{ color: "#81e6d9" }}>
                  Simple
                </Box>
              </Typography>
              <Typography variant="h6" sx={{ color: "#a0aec0", mb: 4 }}>
                Share files with confidence using military-grade encryption and
                advanced privacy features.
              </Typography>
              <Stack direction="row" spacing={2}>
                <Button
                  variant="contained"
                  sx={{
                    bgcolor: "#81e6d9",
                    color: "#1a202c",
                    "&:hover": { bgcolor: "#4fd1c5" },
                  }}
                >
                  Start Sharing
                </Button>
                <Button
                  variant="outlined"
                  sx={{
                    borderColor: "#81e6d9",
                    color: "#81e6d9",
                    "&:hover": { borderColor: "#4fd1c5", color: "#4fd1c5" },
                  }}
                >
                  Learn More
                </Button>
              </Stack>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper
                elevation={0}
                sx={{
                  bgcolor: "rgba(31, 41, 55, 0.5)",
                  border: "2px dashed rgba(129, 230, 217, 0.3)",
                  borderRadius: 2,
                  p: 4,
                  textAlign: "center",
                }}
              >
                <Box
                  sx={{
                    width: 80,
                    height: 80,
                    bgcolor: "rgba(129, 230, 217, 0.1)",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    mx: "auto",
                    mb: 3,
                  }}
                >
                  <CloudUploadIcon sx={{ fontSize: 36, color: "#81e6d9" }} />
                </Box>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Drag & Drop Files
                </Typography>
                <Typography sx={{ color: "#a0aec0", mb: 2 }}>or</Typography>
                <Button
                  variant="contained"
                  sx={{
                    bgcolor: "rgba(129, 230, 217, 0.2)",
                    color: "#81e6d9",
                    "&:hover": { bgcolor: "rgba(129, 230, 217, 0.3)" },
                    mb: 2,
                  }}
                >
                  Browse Files
                </Button>
                <Typography variant="body2" sx={{ color: "#a0aec0" }}>
                  Maximum file size: 2GB
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Features Section */}
      <Box sx={{ py: 8, bgcolor: "rgba(17, 24, 39, 0.5)" }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: "center", mb: 6 }}>
            <Typography
              variant="h4"
              component="h2"
              fontWeight="bold"
              gutterBottom
            >
              Advanced Security Features
            </Typography>
            <Typography sx={{ color: "#a0aec0" }}>
              Protect your files with industry-leading security measures
            </Typography>
          </Box>

          <Grid container spacing={4}>
            {securityFeatures.map((feature, index) => (
              <Grid item xs={12} md={4} key={index}>
                <Paper
                  elevation={0}
                  sx={{
                    bgcolor: "rgba(31, 41, 55, 0.5)",
                    borderRadius: 2,
                    p: 3,
                    height: "100%",
                  }}
                >
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      bgcolor: "rgba(129, 230, 217, 0.1)",
                      borderRadius: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      mb: 3,
                    }}
                  >
                    <Box sx={{ color: "#81e6d9" }}>{feature.icon}</Box>
                  </Box>
                  <Typography variant="h6" fontWeight="semibold" gutterBottom>
                    {feature.title}
                  </Typography>
                  <Typography sx={{ color: "#a0aec0" }}>
                    {feature.description}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Footer */}
      <Box sx={{ bgcolor: "gray.900", py: 6 }}>
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            {footerSections.map((section, index) => (
              <Grid item xs={6} md={3} key={index}>
                <Typography
                  variant="subtitle1"
                  fontWeight="semibold"
                  gutterBottom
                >
                  {section.title}
                </Typography>
                <Stack spacing={2}>
                  {section.links.map((link, linkIndex) => (
                    <Typography
                      key={linkIndex}
                      sx={{
                        color: "#a0aec0",
                        cursor: "pointer",
                        "&:hover": { color: "white" },
                      }}
                    >
                      {link}
                    </Typography>
                  ))}
                </Stack>
              </Grid>
            ))}
          </Grid>

          <Divider sx={{ my: 4, borderColor: "gray.800" }} />

          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography variant="body2" sx={{ color: "#a0aec0" }}>
              © 2025 Lokr. All rights reserved.
            </Typography>
            <Stack direction="row" spacing={2}>
              <IconButton size="small" sx={{ color: "#a0aec0" }}>
                <TwitterIcon />
              </IconButton>
              <IconButton size="small" sx={{ color: "#a0aec0" }}>
                <InstagramIcon />
              </IconButton>
              <IconButton size="small" sx={{ color: "#a0aec0" }}>
                <LinkedInIcon />
              </IconButton>
            </Stack>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
};

