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
} from "@mui/material";
import Upload from "../components/Upload";
import "../SecurityFeatures.css";

export function Home() {
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

        <Box className="right-home-box">
          <Upload />
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

          <Typography variant="subtitle1" className="security-subtitle" mt={2}>
            Version - {__COMMIT_HASH__}
          </Typography>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography variant="body2" sx={{ color: "#a0aec0" }}>
              © 2025 Lokr. All rights reserved.
            </Typography>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}

export default Home;
