import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  IconButton,
  Button,
  Box,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: {
    name: string;
    type: string;
    url: string;
  } | null;
}

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ isOpen, onClose, file }) => {
  const [loading, setLoading] = useState(true);
  const [textContent, setTextContent] = useState<string>('');

  useEffect(() => {
    if (isOpen && file) {
      setLoading(true);
      setTextContent('');
    }
  }, [isOpen, file]);

  useEffect(() => {
    const fetchTextContent = async () => {
      if (isOpen && file && (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt'))) {
        try {
          const response = await fetch(file.url);
          const text = await response.text();
          setTextContent(text);
          setLoading(false);
        } catch (error) {
          console.error('Error fetching text file:', error);
          setLoading(false);
        }
      }
    };

    fetchTextContent();
  }, [isOpen, file]);

  if (!file) return null;

  const fileExtension = file.name.split('.').pop()?.toLowerCase();
  const fileType = file.type.split('/')[0];

  const renderContent = () => {
    if (fileType === 'image') {
      return (
        <img
          src={file.url}
          alt={file.name}
          onLoad={() => setLoading(false)}
          style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
        />
      );
    }

    if (fileType === 'video') {
      return (
        <video
          controls
          autoPlay
          onLoadedData={() => setLoading(false)}
          style={{ maxHeight: '100%', maxWidth: '100%' }}
        >
          <source src={file.url} type={file.type} />
        </video>
      );
    }

    if (file.type === 'application/pdf' || fileExtension === 'pdf') {
      return (
        <iframe
          src={file.url}
          title="PDF Preview"
          onLoad={() => setLoading(false)}
          style={{ width: '100%', height: '100%' }}
        />
      );
    }

    if (file.type === 'text/plain' || fileExtension === 'txt') {
      return (
        <Box 
          sx={{ 
            width: '100%', 
            height: '100%', 
            padding: 2, 
            overflow: 'auto',
            backgroundColor: 'white',
            border: '1px solid #e0e0e0',
            borderRadius: 1,
            whiteSpace: 'pre-wrap',
            fontFamily: 'monospace'
          }}
        >
          {textContent}
        </Box>
      );
    }

    setLoading(false); // fallback
    return (
      <Box textAlign="center">
        <Typography variant="h6" gutterBottom>
          File preview not available
        </Typography>
        <Button variant="contained" href={file.url} download={file.name}>
          Download File
        </Button>
      </Box>
    );
  };

  return (
    <Dialog open={isOpen} onClose={onClose} fullWidth maxWidth="md" scroll="body">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography noWrap>{decodeURIComponent(file.name)}</Typography>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{
          height: '70vh',
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          bgcolor: '#f8f8f8',
        }}
      >
        {renderContent()}

        {loading && (
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <CircularProgress />
            <Typography variant="body2" mt={2}>
              Loading preview...
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Typography variant="caption" sx={{ flexGrow: 1 }}>
          {file.type}
        </Typography>
        <Button href={file.url} download={file.name} variant="outlined">
          Download
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FilePreviewModal;