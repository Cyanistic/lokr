/*File contains code displaying the Preferences section of the Profile page*/

import {
  Typography,
  Box,
  Paper,
  Grid,
  Stack,
  Divider,
  Button,
  TextField,
  FormControl,
  Select,
  MenuItem,
  IconButton,
  Avatar,
  CircularProgress,
} from "@mui/material"
import { Edit as EditIcon } from "@mui/icons-material"
import AvatarUpload from "../pages/ProfileAvatar"
import type { FileSortOrder, Theme } from "../myApi"

interface PreferencesSectionProps {
    profile: any
    loading: boolean
    avatarUrl: string
    selectedSortOrder: FileSortOrder
    setSelectedSortOrder: (value: FileSortOrder) => void
    mode: "light" | "dark" | "system"
    setTheme: (theme: "light" | "dark" | "system") => void
    editingField: string | null
    updatedValue: string
    setEditingField: (field: string | null) => void
    setUpdatedValue: (value: string) => void
    handleEdit: (field: string, currentValue: string | null) => void
    handleSave: (field: "username" | "password" | "email") => Promise<void>
    toggleGridView: () => Promise<void>
    updatePreferences: () => Promise<void>
    refreshProfile: () => Promise<any>
  }
  
  export default function PreferencesSection({
    profile,
    loading,
    avatarUrl,
    selectedSortOrder,
    setSelectedSortOrder,
    mode,
    setTheme,
    editingField,
    updatedValue,
    setEditingField,
    setUpdatedValue,
    handleEdit,
    handleSave,
    toggleGridView,
    updatePreferences,
    refreshProfile,
  }: PreferencesSectionProps) {
    if (loading) {
      return (
        <Box sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>
            Preferences
          </Typography>
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress />
          </Box>
        </Box>
      )
    }
  
    return (
      <Box sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h5" gutterBottom>
          Preferences
        </Typography>
        <Grid container spacing={{ xs: 2, md: 4 }}>
          {/* Left column: username, email, theme, view mode, sort order */}
          <Grid item xs={12} md={7} order={{ xs: 2, md: 1 }}>
            <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
              <Stack spacing={{ xs: 1.5, sm: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: { xs: "column", sm: "row" },
                    alignItems: { xs: "flex-start", sm: "center" },
                    justifyContent: "space-between",
                  }}
                >
                  <Box sx={{ width: "100%" }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
                      Username:
                    </Typography>
                    {editingField === "username" ? (
                      <Box sx={{ display: "flex", alignItems: "center", mt: 1, gap: 1, width: "100%" }}>
                        <TextField
                          size="small"
                          value={updatedValue}
                          onChange={(e) => setUpdatedValue(e.target.value)}
                          fullWidth
                        />
                        <Button
                          variant="contained"
                          onClick={() => handleSave("username")}
                          sx={{
                            bgcolor: (theme) => theme.palette.secondary.main,
                            "&:hover": {
                              bgcolor: (theme) => theme.palette.secondary.dark,
                            },
                          }}
                        >
                          Save
                        </Button>
                      </Box>
                    ) : (
                      <Box sx={{ display: "flex", alignItems: "center", mt: 1 }}>
                        <Typography variant="body1">{profile.username}</Typography>
                        <IconButton size="small" onClick={() => handleEdit("username", profile.username)} sx={{ ml: 1 }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    )}
                  </Box>
                </Box>
  
                <Divider />
  
                <Box sx={{ p: { xs: 1, sm: 2 } }}>
                  <Typography variant="h6">Theme Preferences</Typography>
                  <FormControl fullWidth sx={{ mt: 2 }}>
                    <Select
                      labelId="theme-select-label"
                      value={mode}
                      onChange={(e) => setTheme(e.target.value as "light" | "dark" | "system")}
                      size="small"
                    >
                      <MenuItem value="light">Light</MenuItem>
                      <MenuItem value="dark">Dark</MenuItem>
                      <MenuItem value="system">System</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
  
                <Divider />
  
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
                    View Mode:
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", mt: 1, gap: 2 }}>
                    <Typography variant="body1">{profile.gridView ? "Grid" : "List"}</Typography>
                    <Button variant="outlined" onClick={toggleGridView} size="small">
                      Toggle
                    </Button>
                  </Box>
                </Box>
  
                <Divider />
  
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: "bold", mb: 1 }}>
                    Sort Order:
                  </Typography>
                  <FormControl fullWidth size="small">
                    <Select
                      value={selectedSortOrder}
                      onChange={(e) => setSelectedSortOrder(e.target.value as FileSortOrder)}
                    >
                      <MenuItem value="name">Name</MenuItem>
                      <MenuItem value="size">Size</MenuItem>
                      <MenuItem value="created">Creation Date</MenuItem>
                      <MenuItem value="modified">Modification Date</MenuItem>
                      <MenuItem value="owner">Owner</MenuItem>
                      <MenuItem value="uploader">Uploader</MenuItem>
                      <MenuItem value="extension">Extension</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
  
                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="contained"
                    onClick={updatePreferences}
                    sx={{
                      bgcolor: (theme) => theme.palette.secondary.main,
                      "&:hover": {
                        bgcolor: (theme) => theme.palette.secondary.dark,
                      },
                    }}
                  >
                    Save Preferences
                  </Button>
                </Box>
              </Stack>
            </Paper>
          </Grid>
  
          {/* Right column: avatar - Move to top on mobile */}
          <Grid item xs={12} md={5} order={{ xs: 1, md: 2 }}>
            <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2, textAlign: "center" }}>
              <Typography variant="h6" gutterBottom>
                Avatar
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Avatar
                  src={avatarUrl}
                  alt="Profile Avatar"
                  sx={{
                    width: { xs: 150, sm: 200, md: 250 },
                    height: { xs: 150, sm: 200, md: 250 },
                    mb: 2,
                  }}
                />
                <AvatarUpload
                  avatarUrl={avatarUrl}
                  onAvatarChange={() => {
                    refreshProfile()
                  }}
                />
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    )
  }