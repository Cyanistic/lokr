import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Box,
  Collapse,
  Paper,
  useMediaQuery,
  useTheme,
  alpha,
  Slide,
  Avatar,
  Divider,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import LockIcon from "@mui/icons-material/Lock";

// Assuming these functions are imported from elsewhere
import { isAuthenticated, logout } from "../utils"; // Import your auth functions
import { Close } from "@mui/icons-material";

export default function Navigation() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Handle scroll effect for navbar
  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 10;
      if (isScrolled !== scrolled) {
        setScrolled(isScrolled);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [scrolled]);

  const handleLogout = async (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    if (await logout()) {
      navigate("/home");
      if (dropdownOpen) setDropdownOpen(false);
    }
  };

  const toggleDropdown = () => {
    setDropdownOpen(!dropdownOpen);
  };

  const navLinks = [
    {
      title: "About",
      path: "/about",
      authRequired: false,
      onClick: undefined,
      isButton: false,
    },
    {
      title: "Share Files",
      path: "/test",
      authRequired: true,
      onClick: undefined,
      isButton: false,
    },
    {
      title: "Files",
      path: "/files",
      authRequired: true,
      onClick: undefined,
      isButton: false,
    },
  ];

  const authLinks = isAuthenticated()
    ? [
        { title: "Profile", path: "/profile", isButton: false },
        {
          title: "Logout",
          path: "/home",
          onClick: handleLogout,
          isButton: false,
        },
      ]
    : [
        { title: "Sign in", path: "/login" },
        {
          title: "Get Started",
          path: "/register",
          onClick: undefined,
          isButton: true,
        },
      ];

  // Animated dropdown menu for mobile
  const renderMobileDropdown = () => (
    <>
      <IconButton
        edge="end"
        color="inherit"
        aria-label="menu"
        onClick={toggleDropdown}
        sx={{
          transition: "transform 0.3s ease",
          transform: dropdownOpen ? "rotate(90deg)" : "rotate(0deg)",
        }}
      >
        {dropdownOpen ? <Close /> : <MenuIcon />}
      </IconButton>

      <Collapse
        in={dropdownOpen}
        timeout={300}
        sx={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          zIndex: 1000,
        }}
      >
        <Slide direction="down" in={dropdownOpen} mountOnEnter unmountOnExit>
          <Paper
            elevation={4}
            sx={{
              borderRadius: "0 0 16px 16px",
              overflow: "hidden",
              bgcolor: alpha(theme.palette.background.paper, 0.95),
              backdropFilter: "blur(10px)",
            }}
          >
            <Box sx={{ p: 2 }}>
              {navLinks.map(
                (link) =>
                  (!link.authRequired ||
                    (link.authRequired && isAuthenticated())) && (
                    <Button
                      key={link.title}
                      component={Link}
                      to={link.path}
                      fullWidth
                      onClick={() => setDropdownOpen(false)}
                      sx={{
                        justifyContent: "flex-start",
                        py: 1.5,
                        textAlign: "left",
                        borderRadius: 2,
                        mb: 1,
                        color: theme.palette.text.primary,
                        "&:hover": {
                          bgcolor: alpha(theme.palette.primary.main, 0.1),
                        },
                      }}
                    >
                      {link.title}
                    </Button>
                  ),
              )}

              <Divider sx={{ my: 2 }} />

              {authLinks.map((link) => (
                <Button
                  key={link.title}
                  component={Link}
                  to={link.path}
                  fullWidth
                  variant={link.isButton ? "contained" : "text"}
                  onClick={link.onClick || (() => setDropdownOpen(false))}
                  sx={{
                    justifyContent: "flex-start",
                    py: 1.5,
                    textAlign: "left",
                    borderRadius: 2,
                    mb: 1,
                    ...(link.isButton
                      ? {
                          bgcolor: theme.palette.primary.main,
                          color: theme.palette.primary.contrastText,
                          "&:hover": {
                            bgcolor: theme.palette.primary.dark,
                          },
                        }
                      : {
                          color: theme.palette.text.primary,
                          "&:hover": {
                            bgcolor: alpha(theme.palette.primary.main, 0.1),
                          },
                        }),
                  }}
                >
                  {link.title}
                </Button>
              ))}
            </Box>
          </Paper>
        </Slide>
      </Collapse>
    </>
  );

  // Desktop navigation
  const renderDesktopNav = () => (
    <>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Typography
          variant="h5"
          component={Link}
          to="/home"
          sx={{
            mr: 4,
            display: "flex",
            alignItems: "center",
            color: "inherit",
            textDecoration: "none",
            fontWeight: 700,
            letterSpacing: "0.5px",
          }}
        >
          <LockIcon sx={{ mr: 1, fontSize: 28 }} />
          Lokr
        </Typography>
        <Box sx={{ display: "flex" }}>
          {navLinks.map(
            (link) =>
              (!link.authRequired ||
                (link.authRequired && isAuthenticated())) && (
                <Button
                  key={link.title}
                  component={Link}
                  to={link.path}
                  color="inherit"
                  sx={{
                    mr: 2,
                    position: "relative",
                    "&::after": {
                      content: '""',
                      position: "absolute",
                      width: "0%",
                      height: "2px",
                      bottom: "0",
                      left: "50%",
                      transform: "translateX(-50%)",
                      backgroundColor: theme.palette.primary.main,
                      transition: "width 0.3s ease",
                    },
                    "&:hover::after": {
                      width: "70%",
                    },
                  }}
                >
                  {link.title}
                </Button>
              ),
          )}
        </Box>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        {
          //
          //          <IconButton onClick={toggleTheme} color="inherit" sx={{ mr: 1 }}>
          //            {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
          //          </IconButton>
        }

        {authLinks.map((link) =>
          link.isButton ? (
            <Button
              key={link.title}
              component={Link}
              to={link.path}
              variant="contained"
              onClick={link.onClick}
              sx={{
                ml: 2,
                px: 3,
                py: 1,
                borderRadius: "24px",
                boxShadow: 2,
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
                "&:hover": {
                  transform: "translateY(-2px)",
                  boxShadow: 4,
                },
              }}
            >
              {link.title}
            </Button>
          ) : (
            <Button
              key={link.title}
              component={Link}
              to={link.path}
              color="inherit"
              onClick={link.onClick}
              sx={{ ml: 2 }}
            >
              {link.title}
            </Button>
          ),
        )}

        {isAuthenticated() && (
          <Avatar
            sx={{
              ml: 2,
              width: 36,
              height: 36,
              bgcolor: theme.palette.primary.main,
              cursor: "pointer",
              transition: "transform 0.2s",
              "&:hover": {
                transform: "scale(1.1)",
              },
            }}
            component={Link}
            to="/profile"
          >
            U
          </Avatar>
        )}
      </Box>
    </>
  );

  return (
    <AppBar
      position="sticky"
      sx={{
        bgcolor: scrolled
          ? alpha(theme.palette.background.paper, 0.9)
          : theme.palette.background.paper,
        color: theme.palette.text.primary,
        backdropFilter: scrolled ? "blur(10px)" : "none",
        boxShadow: scrolled ? 2 : 0,
        transition: "background-color 0.3s ease, box-shadow 0.3s ease",
      }}
    >
      <Toolbar
        sx={{
          justifyContent: "space-between",
          py: { xs: 1, md: 0.5 },
          px: { xs: 2, md: 4 },
        }}
      >
        {isMobile ? (
          <>
            <Typography
              variant="h5"
              component={Link}
              to="/home"
              sx={{
                display: "flex",
                alignItems: "center",
                color: "inherit",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              <LockIcon sx={{ mr: 1, fontSize: 24 }} />
              Lokr
            </Typography>
            {renderMobileDropdown()}
          </>
        ) : (
          renderDesktopNav()
        )}
      </Toolbar>
    </AppBar>
  );
}
