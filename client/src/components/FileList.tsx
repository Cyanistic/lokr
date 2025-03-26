import { useEffect, useState } from "react"
import DefaultProfile from "/default-profile.webp"
import {
  DataGrid,
  type GridColDef,
  GridColumnVisibilityModel,
  type GridRenderCellParams,
  type GridSortModel,
} from "@mui/x-data-grid"
import { Avatar, Box, Typography } from "@mui/material"
import { FileMetadata } from "../types"
import { PublicUser } from "../myApi"
import { getFileIcon } from "../pages/FileExplorer"
import { BASE_URL, formatBytes } from "../utils"
import FolderOffIcon from '@mui/icons-material/FolderOff';
import { useWindowSize } from "./hooks/useWindowSize"
import { FileContextMenu } from "./FileMenu"

function CustomNoRowsOverlay() {
  return (
    <Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
      <FolderOffIcon sx={{ fontSize: 42 }} />
      <Typography variant="body1">{"No files found"}</Typography>
    </Box>
  );
}


interface FileListProps {
  files: FileMetadata[],
  users: Record<string, PublicUser>,
  loading?: boolean
  onRowDoubleClick: (fileId: string) => void;
}

export default function FileList({ files, users, loading, onRowDoubleClick: onRowClick }: FileListProps) {
  const [sortModel, setSortModel] = useState<GridSortModel>([
    {
      field: "name",
      sort: "asc",
    },
  ])

  const [columnVisibility, setColumnVisibility] = useState<GridColumnVisibilityModel>({
    name: true,
    size: true,
    createdAtDate: true,
    modifiedAtDate: true,
    uploaderId: true,
    ownerId: true,
    actions: true,
  })

  // Get window size for responsive design
  const { width } = useWindowSize()

  // Update column visibility based on screen size
  useEffect(() => {
    if (width < 800) {
      // Extra small screens: Only show name, size, and actions
      setColumnVisibility({
        name: true,
        size: true,
        createdAtDate: false,
        modifiedAtDate: false,
        uploaderId: false,
        ownerId: false,
        actions: true,
      })
    } else if (width < 1000) {
      // Small screens: Show name, size, modified date, and actions
      setColumnVisibility({
        name: true,
        size: true,
        createdAtDate: false,
        modifiedAtDate: true,
        uploaderId: false,
        ownerId: false,
        actions: true,
      })
    } else if (width < 1200) {
      // Medium screens: Show all except created date
      setColumnVisibility({
        name: true,
        size: true,
        createdAtDate: false,
        modifiedAtDate: true,
        uploaderId: true,
        ownerId: false,
        actions: true,
      })
    } else if (width < 1400) {
      // Medium screens: Show all except created date
      setColumnVisibility({
        name: true,
        size: true,
        createdAtDate: false,
        modifiedAtDate: true,
        uploaderId: true,
        ownerId: false,
        actions: true,
      })
    } else {
      // Large screens: Show all columns
      setColumnVisibility({
        name: true,
        size: true,
        createdAtDate: true,
        modifiedAtDate: true,
        uploaderId: true,
        ownerId: true,
        actions: true,
      })
    }
  }, [width])

  // Define columns for DataGrid
  const columns: GridColDef[] = [
    {
      field: "name",
      headerName: "Name",
      flex: 1,
      minWidth: 100,
      renderCell: (params: GridRenderCellParams) => {
        if (!params?.row?.name) return null
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, pt: 1.5 }}>
            {getFileIcon(params.row.mimeType)}
            <Typography variant="body2" noWrap title={params.row.name}>
              {params.row.name}
            </Typography>
          </Box>
        )
      },
    },
    {
      field: "size",
      headerName: "Size",
      width: 90,
      valueFormatter: (value: number, params) => {
        if (params?.isDirectory) {
          return "";
        }
        return formatBytes(value);
      }
    },
    {
      field: "createdAtDate",
      headerName: "Created",
      width: 120,
      valueFormatter: (value: Date) => {
        if (new Date().toDateString() === value.toDateString()) {
          return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
          return value.toLocaleDateString();
        }
      }
    },
    {
      field: "modifiedAtDate",
      headerName: "Modified",
      width: 120,
      valueFormatter: (value: Date) => {
        if (new Date().toDateString() === value.toDateString()) {
          return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
          return value.toLocaleDateString();
        }
      }
    },
    {
      field: "uploaderId",
      headerName: "Uploader",
      width: 150,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.row || !params.row.uploaderId) return null
        const uploader = users[params.row.uploaderId];
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, pt: 1.5 }}>
            <Avatar src={uploader.avatarExtension ? `${BASE_URL}/api/avatars/${uploader.id}.${uploader.avatarExtension}` : DefaultProfile}
              alt={uploader.username} sx={{ width: 24, height: 24 }} />
            <Typography variant="body2" noWrap>{uploader.username}</Typography>
          </Box>
        )
      },
    },
    {
      field: "ownerId",
      headerName: "Owner",
      width: 150,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.row || !params.row.ownerId) return null
        const owner = users[params.row.ownerId];
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, pt: 1.5 }}>
            <Avatar src={owner.avatarExtension ? `${BASE_URL}/api/avatars/${owner.id}.${owner.avatarExtension}` : DefaultProfile}
              alt={owner.username} sx={{ width: 24, height: 24 }} />
            <Typography variant="body2" noWrap>{owner.username}</Typography>
          </Box>
        )
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 80,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.row) return null
        return <FileContextMenu
          fileId={params.row.id as string}
          // TODO: Handle actions on the action button
          onAction={() => {}}
        />
      },
    },
  ]

  return (
    <Box sx={{ flexDirection: "column", minWidth: 0, flexGrow: 1, flexBasis: 0, flexShrink: 0 }}>
      <DataGrid
        rows={files}
        columns={columns}
        initialState={{
          pagination: {
            paginationModel: { page: 0, pageSize: 10 },
          },
        }}
        pageSizeOptions={[5, 10, 25]}
        sortModel={sortModel}
        onSortModelChange={setSortModel}
        disableRowSelectionOnClick
        slots={{
          noRowsOverlay: CustomNoRowsOverlay
        }}
        slotProps={{
          loadingOverlay: {
            variant: 'skeleton',
            noRowsVariant: 'skeleton',
          },
        }}
        columnVisibilityModel={columnVisibility}
        onColumnVisibilityModelChange={(newModel) => {
          setColumnVisibility(newModel)
        }}
        onCellClick={(params) => {
          if (params.field === "actions") {
            return;
          }
          onRowClick(params.row.id as string);
        }}
        sx={{
          "& .MuiDataGrid-cell": {
            borderBottom: "none"
          },
          // border: 1,
          borderColor: "divider",
          borderRadius: 4,
          "& .MuiDataGrid-columnHeaders": {
            backgroundColor: "background.paper",
            // borderBottom: 1,
            borderColor: "divider",
          },
          "& .MuiDataGrid-columnSeparator": {
            display: "none"
          },
          "& .MuiDataGrid-cell:focus": {
            outline: 'none'
          },
          "& .MuiDataGrid-cell:focus-within": {
            outline: 'none'
          }
        }}
        loading={loading}
      />
    </Box>
  )
}

