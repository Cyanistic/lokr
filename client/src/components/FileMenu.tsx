import { Menu, MenuItem, ListItemIcon, ListItemText, Divider, type MenuProps, IconButton } from "@mui/material"
import InfoIcon from "@mui/icons-material/Info"
import DeleteIcon from "@mui/icons-material/Delete"
import FolderIcon from "@mui/icons-material/Folder"
import ShareIcon from "@mui/icons-material/Share"
import EditIcon from "@mui/icons-material/Edit"
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useState } from "react"

export interface FileContextMenuProps {
  fileId: string | null;
  anchorPosition?: { top: number; left: number };
  onAction: (action: string, fileId: string) => void;
}

export function FileContextMenu({ fileId, anchorPosition, onAction }: FileContextMenuProps) {
  // Determine which type of menu positioning to use
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuProps: Partial<MenuProps> = anchorPosition
    ? {
      anchorReference: "anchorPosition",
      anchorPosition,
    }
    : {
      anchorEl,
    }
  const open = Boolean(anchorEl)

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
  }
  const handleClose = () => {
    setAnchorEl(null)
  }

  // Handle menu actions
  const handleAction = (action: string) => {
    if (fileId !== null) {
      onAction(action, fileId)
    }
  }

  return (
    <>
      <IconButton aria-label="more" aria-controls="file-menu" aria-haspopup="true" onClick={handleClick} size="small" sx={{zIndex: 3}}>
        <MoreVertIcon />
      </IconButton>
      <Menu
        open={open}
        onClose={handleClose}
        {...menuProps}
        slotProps={{
          paper: {
            elevation: 3,
            sx: {
              minWidth: "200px",
              borderRadius: "12px",
              overflow: "hidden",
              mt: 1,
            },
          }
        }}
      >
        <MenuItem onClick={() => handleAction("info")}>
          <ListItemIcon>
            <InfoIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Info</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleAction("rename")}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Rename</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleAction("share")}>
          <ListItemIcon>
            <ShareIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Share</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => handleAction("move")}>
          <ListItemIcon>
            <FolderIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Move</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleAction("delete")} sx={{ color: "error.main" }}>
          <ListItemIcon sx={{ color: "error.main" }}>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </>
  )
}

