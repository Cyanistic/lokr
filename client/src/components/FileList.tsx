import { useEffect, useState } from "react";
import DefaultProfile from "/default-profile.webp";
import {
  DataGrid,
  type GridColDef,
  GridColumnVisibilityModel,
  type GridRenderCellParams,
  type GridSortModel,
} from "@mui/x-data-grid";
import { Avatar, Box, Tooltip, Typography } from "@mui/material";
import { FileMetadata } from "../types";
import { FileSortOrder, PublicUser } from "../myApi";
import { getFileIcon } from "../pages/FileExplorer";
import { BASE_URL, formatBytes, getExtension, gridToList } from "../utils";
import FolderOffIcon from "@mui/icons-material/FolderOff";
import { useWindowSize } from "./hooks/useWindowSize";
import { FileContextMenu } from "./FileMenu";

export function NoFilesFound() {
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <FolderOffIcon sx={{ fontSize: 42 }} />
      <Typography variant="body1">{"No files found"}</Typography>
    </Box>
  );
}

interface FileListProps {
  files: FileMetadata[];
  users: Record<string, PublicUser>;
  loading?: boolean;
  onRowClick: (fileId: string) => void;
  onAction: (action: string, fileId: string) => Promise<void>;
  owner: boolean;
  onSortModelChange: (model: GridSortModel) => void;
  sortBy: FileSortOrder;
  sortOrder: "asc" | "desc";
}

export default function FileList({
  files,
  users,
  loading,
  onRowClick,
  onAction,
  onSortModelChange,
  sortBy,
  sortOrder,
  owner,
}: FileListProps) {
  const [columnVisibility, setColumnVisibility] =
    useState<GridColumnVisibilityModel>({
      name: true,
      extension: true,
      size: true,
      createdAtDate: true,
      modifiedAtDate: true,
      uploaderId: true,
      ownerId: true,
      actions: true,
    });

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    fileId: string;
    editor: boolean;
  } | null>(null);

  // Get window size for responsive design
  const { width } = useWindowSize();

  // Update column visibility based on screen size
  useEffect(() => {
    if (width < 800) {
      // Extra small screens: Only show name, size, and actions
      setColumnVisibility({
        name: true,
        extension: false,
        size: true,
        createdAtDate: false,
        modifiedAtDate: false,
        uploaderId: false,
        ownerId: false,
        actions: true,
      });
    } else if (width < 1000) {
      // Small screens: Show name, size, modified date, and actions
      setColumnVisibility({
        name: true,
        extension: false,
        size: true,
        createdAtDate: false,
        modifiedAtDate: true,
        uploaderId: false,
        ownerId: false,
        actions: true,
      });
    } else if (width < 1200) {
      // Medium screens: Show all except created date
      setColumnVisibility({
        name: true,
        extension: false,
        size: true,
        createdAtDate: false,
        modifiedAtDate: true,
        uploaderId: true,
        ownerId: false,
        actions: true,
      });
    } else if (width < 1400) {
      // Medium screens: Show all except created date
      setColumnVisibility({
        name: true,
        extension: true,
        size: true,
        createdAtDate: false,
        modifiedAtDate: true,
        uploaderId: true,
        ownerId: false,
        actions: true,
      });
    } else {
      // Large screens: Show all columns
      setColumnVisibility({
        name: true,
        size: true,
        extension: true,
        createdAtDate: true,
        modifiedAtDate: true,
        uploaderId: true,
        ownerId: true,
        actions: true,
      });
    }
  }, [width]);

  // Define columns for DataGrid
  const columns: GridColDef[] = [
    {
      field: "name",
      headerName: "Name",
      flex: 1,
      minWidth: 100,
      renderCell: (params: GridRenderCellParams) => {
        if (!params?.row?.name) return null;
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, pt: 1.5 }}>
            {getFileIcon(params.row.mimeType)}
            <Typography variant="body2" noWrap title={params.row.name}>
              {params.row.name}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: "extension",
      headerName: "Ext",
      width: 90,
      valueGetter: (_, row) => {
        if (!row?.name) return "";
        return getExtension(row.name);
      },
    },
    {
      field: "size",
      headerName: "Size",
      width: 120,
      valueFormatter: (value: number, params) => {
        if (params?.isDirectory) {
          return "";
        }
        return formatBytes(value);
      },
    },
    {
      field: "createdAtDate",
      headerName: "Created",
      width: 120,
      renderCell: (params: GridRenderCellParams) => {
        const value: Date | undefined = params.value;
        let dateString;
        if (new Date().toDateString() === value?.toDateString()) {
          dateString = value.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
        } else {
          dateString = value?.toLocaleDateString();
        }
        return (
          <Tooltip title={(value ?? new Date()).toLocaleString()}>
            <span>
              {dateString ??
                new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
            </span>
          </Tooltip>
        );
      },
    },
    {
      field: "modifiedAtDate",
      headerName: "Modified",
      width: 120,
      renderCell: (params: GridRenderCellParams) => {
        const value: Date | undefined = params.value;
        let dateString;
        if (new Date().toDateString() === value?.toDateString()) {
          dateString = value.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
        } else {
          dateString = value?.toLocaleDateString();
        }
        return (
          <Tooltip title={(value ?? new Date()).toLocaleString()}>
            <span>
              {dateString ??
                new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
            </span>
          </Tooltip>
        );
      },
    },
    {
      field: "uploaderId",
      headerName: "Uploader",
      width: 150,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.row) return null;
        const uploader: PublicUser | undefined = users[params.row.uploaderId];
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, pt: 1.5 }}>
            <Avatar
              src={
                uploader?.avatarExtension
                  ? `${BASE_URL}/api/avatars/${uploader.id}.${uploader.avatarExtension}`
                  : DefaultProfile
              }
              alt={uploader?.username ?? "Anonymous"}
              sx={{ width: 24, height: 24 }}
            />
            <Typography variant="body2" noWrap>
              {uploader?.username ?? "Anonymous"}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: "ownerId",
      headerName: "Owner",
      width: 150,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.row || !params.row.ownerId) return null;
        const owner: PublicUser | undefined = users[params.row.ownerId];
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, pt: 1.5 }}>
            <Avatar
              src={
                owner?.avatarExtension
                  ? `${BASE_URL}/api/avatars/${owner.id}.${owner.avatarExtension}`
                  : DefaultProfile
              }
              alt={owner.username}
              sx={{ width: 24, height: 24 }}
            />
            <Typography variant="body2" noWrap>
              {owner.username}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 80,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.row) return null;
        return (
          <FileContextMenu
            fileId={params.row?.id as string}
            onAction={onAction}
            owner={owner}
            editor={params.row?.editPermission}
          />
        );
      },
    },
  ];

  // Handle right-click on row
  const handleContextMenu = (
    event: React.MouseEvent,
    fileId: string,
    editor: boolean,
  ) => {
    event.preventDefault();
    setContextMenu({
      mouseX: event.clientX,
      mouseY: event.clientY,
      fileId,
      editor,
    });
  };

  // Handle closing the context menu
  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        flexGrow: 1,
        overflow: "hidden", // Prevent overflow outside the container
      }}
    >
      <DataGrid
        rows={files}
        columns={columns}
        initialState={{
          pagination: {
            paginationModel: { page: 0, pageSize: 20 },
          },
        }}
        pageSizeOptions={[20, 100, { value: -1, label: "All" }]}
        sortModel={[{ field: gridToList(sortBy), sort: sortOrder }]}
        onSortModelChange={onSortModelChange}
        disableRowSelectionOnClick
        slots={{
          noRowsOverlay: NoFilesFound,
        }}
        slotProps={{
          loadingOverlay: {
            variant: "skeleton",
            noRowsVariant: "skeleton",
          },
          row: {
            onContextMenu: (event: React.MouseEvent) => {
              const rowId = event.currentTarget.getAttribute("data-id");
              const rowData = files.find((file) => file.id === rowId);
              if (rowId && rowData) {
                handleContextMenu(event, rowId, !!rowData.editPermission);
              }
            },
          },
        }}
        columnVisibilityModel={columnVisibility}
        onColumnVisibilityModelChange={(newModel) => {
          setColumnVisibility(newModel);
        }}
        onCellClick={(params) => {
          if (params.field === "actions") {
            return;
          }
          onRowClick(params.row.id as string);
        }}
        sx={{
          "& .MuiDataGrid-cell": {
            borderBottom: "none",
          },
          "& .MuiDataGrid-columnHeaders": {
            backgroundColor: "background.paper",
            // borderBottom: 1,
            borderColor: "divider",
          },
          "& .MuiDataGrid-columnSeparator": {
            display: "none",
          },
          "& .MuiDataGrid-cell:focus": {
            outline: "none",
          },
          "& .MuiDataGrid-cell:focus-within": {
            outline: "none",
          },
          "& *": {
            minWidth: 0,
          },
          // Ensure scrollbars are visible and consistent
          "& .MuiDataGrid-virtualScroller": {
            "&::-webkit-scrollbar": {
              width: "8px",
              height: "8px",
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: "rgba(0,0,0,0.2)",
              borderRadius: "4px",
            },
            "&::-webkit-scrollbar-thumb:hover": {
              backgroundColor: "rgba(0,0,0,0.3)",
            },
            outline: "none",
          },
        }}
        loading={loading}
      />

      {/* Right-click context menu */}

      {contextMenu && (
        <FileContextMenu
          fileId={contextMenu.fileId}
          onClose={handleCloseContextMenu} // Close the context menu when an action is taken
          onAction={async (action, fileId) => {
            handleCloseContextMenu();
            await onAction(action, fileId);
          }}
          owner={owner}
          editor={contextMenu.editor}
          anchorPosition={
            contextMenu !== null
              ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
              : undefined
          }
        />
      )}
    </Box>
  );
}
