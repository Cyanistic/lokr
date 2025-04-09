import { useEffect } from "react";
import { Button, Container, Typography, Box } from "@mui/material";
import { useToast } from "./ToastProvider";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { showError } = useToast();

  useEffect(() => {
    // Log the error to an error reporting service
    showError(error.message);
    console.log(error.message);
  }, [error]);

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "50vh",
          textAlign: "center",
          py: 4,
        }}
      >
        <Typography variant="h4" component="h1" gutterBottom>
          Something went wrong!
        </Typography>
        <Typography variant="body1" color="text.secondary" component="p">
          We apologize for the inconvenience. Please try again or contact
          support if the issue persists.
        </Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={() => reset()}
          sx={{ mt: 2 }}
        >
          Try again
        </Button>
      </Box>
    </Container>
  );
}
