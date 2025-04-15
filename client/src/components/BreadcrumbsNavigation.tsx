import { ChevronRight, Folder, Home } from "@mui/icons-material";
import {
  Breadcrumbs,
  Link,
  Typography,
  Box,
  useTheme,
  useMediaQuery,
  Skeleton,
  Fade,
} from "@mui/material";

interface BreadcrumbsNavigationProps {
  path: string[];
  onNavigate: (index: number) => void;
  loading?: boolean;
}

export function BreadcrumbsNavigation({
  path,
  onNavigate,
  loading = false,
}: BreadcrumbsNavigationProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Calculate how many segments to show based on screen size
  const getVisiblePath = () => {
    if (isMobile && path.length > 2) {
      // On mobile with long paths, show only first and last segments
      return [path[0], "...", path[path.length - 1]];
    }

    // On larger screens or with shorter paths, show all segments
    return path;
  };

  const visiblePath = getVisiblePath();

  // Loading state breadcrumbs
  if (loading) {
    return (
      <Box
        sx={{
          mb: 2,
          mt: 1,
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Breadcrumbs
          separator={
            <ChevronRight
              style={{
                height: 16,
                width: 16,
                color: theme.palette.text.disabled,
              }}
            />
          }
          aria-label="file system navigation"
          sx={{
            "& .MuiBreadcrumbs-ol": {
              flexWrap: "wrap",
            },
          }}
        >
          {/* Root/Home breadcrumb - always visible even during loading */}
          <Link
            underline="hover"
            sx={{
              display: "flex",
              alignItems: "center",
              color: "text.secondary",
              pointerEvents: "none",
            }}
            component="span"
          >
            <Home style={{ height: 16, width: 16, marginRight: 4 }} />
            <Typography
              variant="body2"
              sx={{
                display: { xs: "none", sm: "block" },
              }}
            >
              Home
            </Typography>
          </Link>

          {/* Path segments */}
          {visiblePath.map((segment, index) => {
            // Skip rendering for ellipsis placeholder
            if (segment === "...") {
              return (
                <Typography
                  key="ellipsis"
                  variant="body2"
                  color="text.secondary"
                >
                  ...
                </Typography>
              );
            }

            // Calculate the actual index in the original path array
            const actualIndex =
              isMobile && path.length > 2 && index === 2
                ? path.length - 1
                : index;

            // For the last item, don't make it a link
            const isLastItem = index === visiblePath.length - 1;

            if (isLastItem) {
              return (
                <Typography
                  key={segment}
                  variant="body2"
                  color="text.primary"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    fontWeight: 500,
                  }}
                >
                  <Folder
                    style={{
                      height: 16,
                      width: 16,
                      marginRight: 4,
                      color: theme.palette.primary.main,
                    }}
                  />
                  {segment}
                </Typography>
              );
            }

            // For other items, make them clickable links
            return (
              <Link
                key={segment}
                underline="hover"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  color: "text.primary",
                  "&:hover": {
                    color: "primary.main",
                  },
                }}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(actualIndex + 1); // +1 because Home is index 0
                }}
              >
                <Folder style={{ height: 16, width: 16, marginRight: 4 }} />
                <Typography variant="body2">{segment}</Typography>
              </Link>
            );
          })}

          {/* Current location skeleton */}
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Folder
              style={{
                height: 16,
                width: 16,
                marginRight: 4,
                color: theme.palette.primary.main,
              }}
            />
            <Skeleton variant="text" width={100} height={24} animation="wave" />
          </Box>
        </Breadcrumbs>
      </Box>
    );
  }

  // Regular breadcrumbs when not loading
  return (
    <Box
      sx={{
        mb: 2,
        mt: 1,
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <Fade in={!loading} timeout={300}>
        <Breadcrumbs
          separator={
            <ChevronRight
              style={{
                height: 16,
                width: 16,
                color: theme.palette.text.secondary,
              }}
            />
          }
          aria-label="file system navigation"
          sx={{
            "& .MuiBreadcrumbs-ol": {
              flexWrap: "wrap",
            },
          }}
        >
          {/* Root/Home breadcrumb */}
          <Link
            underline="hover"
            sx={{
              display: "flex",
              alignItems: "center",
              color: "text.primary",
              "&:hover": {
                color: "primary.main",
              },
            }}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onNavigate(0);
            }}
          >
            <Home style={{ height: 16, width: 16, marginRight: 4 }} />
            <Typography
              variant="body2"
              sx={{
                display: { xs: "none", sm: "block" },
              }}
            >
              Home
            </Typography>
          </Link>

          {/* Path segments */}
          {visiblePath.map((segment, index) => {
            // Skip rendering for ellipsis placeholder
            if (segment === "...") {
              return (
                <Typography
                  key="ellipsis"
                  variant="body2"
                  color="text.secondary"
                >
                  ...
                </Typography>
              );
            }

            // Calculate the actual index in the original path array
            const actualIndex =
              isMobile && path.length > 2 && index === 2
                ? path.length - 1
                : index;

            // For the last item, don't make it a link
            const isLastItem = index === visiblePath.length - 1;

            if (isLastItem) {
              return (
                <Typography
                  key={segment}
                  variant="body2"
                  color="text.primary"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    fontWeight: 500,
                  }}
                >
                  <Folder
                    style={{
                      height: 16,
                      width: 16,
                      marginRight: 4,
                      color: theme.palette.primary.main,
                    }}
                  />
                  {segment}
                </Typography>
              );
            }

            // For other items, make them clickable links
            return (
              <Link
                key={segment}
                underline="hover"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  color: "text.primary",
                  "&:hover": {
                    color: "primary.main",
                  },
                }}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(actualIndex + 1); // +1 because Home is index 0
                }}
              >
                <Folder style={{ height: 16, width: 16, marginRight: 4 }} />
                <Typography variant="body2">{segment}</Typography>
              </Link>
            );
          })}
        </Breadcrumbs>
      </Fade>
    </Box>
  );
}
