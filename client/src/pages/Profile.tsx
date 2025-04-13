"use client"

import { useState, useEffect } from "react"
import { API, BASE_URL, isValidValue } from "../utils"
import DefaultProfile from "/default-profile.webp"
import {
  base64ToArrayBuffer,
  bufferToBase64,
  deriveKeyFromPassword,
  encryptPrivateKey,
  hashPassword,
} from "../cryptoFunctions"
import localforage from "localforage"
import { useSearchParams } from "react-router-dom"
import type { FileSortOrder, UserUpdate } from "../myApi"
import { useToast } from "../components/ToastProvider"
import { useProfile } from "../components/ProfileProvider"
import { Box, Container, Paper, Grid, Tabs, Tab, Typography, useTheme, useMediaQuery } from "@mui/material"
import { useMuiTheme } from "../components/MuiThemeProvider"

// Import section components
import PreferencesSection from "../components/ProfilePref"
import SecuritySettingsSection from "../components/SecuritySettings"

// Valid profile sections
const Sections = ["profile", "security", "notifications"] as const

function Profile() {
  type RegenerateTOTPRequest = { type: "regenerate"; password: string }
  type VerifyTOTPRequest = { type: "verify"; code: string }
  type EnableTOTPRequest = {
    type: "enable"
    enable: boolean
    password: string
  }
  type Session = {
    number: number
    createdAt: string
    lastUsedAt: string
    userAgent?: string | null
  }

  const { profile, loading: loadingProfile, refreshProfile } = useProfile()
  const [editingField, setEditingField] = useState<string | null>(null)
  const [updatedValue, setUpdatedValue] = useState<string>("")
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true) // Loading state for fetching user data
  const [params, setParams] = useSearchParams()
  const [avatarUrl, setAvatarUrl] = useState<string>(DefaultProfile)
  const activeSection = isValidValue(params.get("section"), Sections) ?? "profile"
  const { showError } = useToast()
  const [sessions, setSessions] = useState<Session[]>([])
  const [showTotpWarningModal, setShowTotpWarningModal] = useState(false)
  const [showTOTPSetup, setShowTOTPSetup] = useState(false) // State to control TOTP setup
  const [totpInputCode, setTOTPInputCode] = useState("")
  const [totpVerified, setTOTPVerified] = useState(false)

  const { mode, setTheme } = useMuiTheme()
  const [selectedSortOrder, setSelectedSortOrder] = useState<FileSortOrder>("name")

  // Fetch user data
  useEffect(() => {
    const getData = async () => {
      if (!profile) return
      if (profile.avatarExtension) {
        setAvatarUrl(
          `${getAvatarUrl({
            id: profile.id,
            avatarExtension: profile.avatarExtension,
          })}/?q=${Math.random()}`,
        )
      }
    }
    setLoading(true)
    try {
      getData()
    } finally {
      if (profile) {
        setLoading(false)
      }
    }
  }, [loadingProfile, profile])

  // Update selected preferences when profile data changes
  useEffect(() => {
    if (profile) {
      setSelectedSortOrder(profile.sortOrder || "name")
    }
  }, [profile])

  // Fetch Sessions
  useEffect(() => {
    API.api
      .getSessions()
      .then((response) => {
        if (!response.ok) throw response.error
        return response.json()
      })
      .then((sessionData) => {
        setSessions(sessionData)
      })
      .catch((err) => {
        showError("Error loading sessions", err)
      })
  }, [])

  const getAvatarUrl = (user: { id: string; avatarExtension: string }) => {
    if (user) {
      return user.avatarExtension ? `${BASE_URL}/api/avatars/${user.id}.${user.avatarExtension}` : DefaultProfile
    }
    return DefaultProfile
  }

  // Regenerate TOTP
  const handleRegenerateTOTP = async () => {
    try {
      const password = prompt("Enter your current password:")
      if (!password) {
        showError("Password is required!")
        return
      }
      const passwordSalt: Uint8Array | null = await localforage.getItem("passwordSalt")
      const hashedPassword = await hashPassword(password, passwordSalt)
      const requestBody: RegenerateTOTPRequest = {
        type: "regenerate",
        password: hashedPassword,
      }

      const response = await API.api.updateTotp(requestBody)
      if (!response.ok) {
        const errorText = await response.text()
        showError("Server Error", errorText)
        return
      }
      const responseData = await response.json()

      // Ensure the QR code has the correct format
      let qrCode = responseData.qrCode
      if (!qrCode.startsWith("data:image/png;base64,")) {
        qrCode = `data:image/png;base64,${qrCode}`
      }
      setQrCode(qrCode)
      setShowTOTPSetup(true)
      setTOTPVerified(false)
      setTOTPInputCode("")
    } catch (err) {
      showError("Failed to regenerate TOTP.")
    }
  }

  // Verify TOTP
  const handleVerifyInline = async () => {
    try {
      const responseBody: VerifyTOTPRequest = {
        type: "verify",
        code: totpInputCode,
      }
      const response = await API.api.updateTotp(responseBody)
      if (!response.ok) {
        throw new Error(await response.text())
      }
      alert("TOTP verified successfully! You can now enable TOTP.")
      setTOTPVerified(true)

      //Hides after verification
      setShowTOTPSetup(false)
      setQrCode(null)
      setTOTPInputCode("")
    } catch (err) {
      alert("Invalid TOTP code.")
    }
  }

  // Enable/Disable TOTP
  const handleEnableTOTP = async () => {
    try {
      const password = prompt("Enter your current password:")
      if (!password) {
        showError("Password is required!")
        return
      }

      const passwordSalt: Uint8Array | null = await localforage.getItem("passwordSalt")
      if (!passwordSalt) {
        throw new Error("Password salt not found")
      }

      const hashedPassword = await hashPassword(password, passwordSalt)
      const enable = !profile?.totpEnabled
      const requestBody: EnableTOTPRequest = {
        type: "enable",
        enable,
        password: hashedPassword,
      }
      const response = await API.api.updateTotp(requestBody)

      if (!response.ok) {
        const errorText = await response.text()
        showError(`Error: ${errorText}`)
        return
      }

      showError(`TOTP ${enable ? "enabled" : "disabled"} successfully!`)
      await refreshProfile()
    } catch (err) {
      showError("Failed to update TOTP settings.", err)
    }
  }

  // Start editing a field
  const handleEdit = (field: string, currentValue: string | null) => {
    setEditingField(field)
    setUpdatedValue(currentValue || "")
  }

  // Save edit to backend
  const handleSave = async (field: "username" | "password" | "email") => {
    try {
      const passwordSalt: Uint8Array | null = profile?.passwordSalt
        ? new Uint8Array(base64ToArrayBuffer(profile?.passwordSalt))
        : null
      const password = prompt("Enter your current password to confirm change")
      if (!password) {
        throw new Error("Password confirmation is required.")
      }

      let requestBody: UserUpdate
      if (field === "username") {
        if (updatedValue.length < 3 || updatedValue.length > 20) {
          throw new Error("Username must be 3-20 characters long.")
        }
      } else if (field === "password") {
        if (updatedValue.length < 8) {
          throw new Error("Password must be at least 8 characters long.")
        }
      }

      // We're setting a new password so we need to regenerate the
      // encryptPrivateKey. We also want to regenerate the iv and salt
      // for security reasons.
      if (field === "password") {
        // Step 1: Generate Salt for PBKDF2
        const salt = crypto.getRandomValues(new Uint8Array(16))
        const privateKey: CryptoKey | null = await localforage.getItem("privateKey")

        if (!privateKey) {
          throw new Error("Could not find private key")
        }

        const masterKey = await deriveKeyFromPassword(updatedValue, salt)
        const { encrypted: encryptedPrivateKey, iv } = await encryptPrivateKey(privateKey, masterKey)

        requestBody = {
          type: "password",
          newValue: await hashPassword(updatedValue),
          password: await hashPassword(password, passwordSalt),
          encryptedPrivateKey: bufferToBase64(encryptedPrivateKey),
          iv: bufferToBase64(iv),
          salt: bufferToBase64(salt),
        }
      } else {
        requestBody = {
          type: field,
          newValue: updatedValue,
          password: await hashPassword(password, passwordSalt),
        } as UserUpdate
      }
      const response = await API.api.updateUser(requestBody)
      if (!response.ok) throw response.error

      await refreshProfile()
      if (field === "email") {
        setShowTotpWarningModal(true)
      }
      setEditingField(null)
    } catch (err) {
      showError(`Error updating ${field}: ${err instanceof Error ? err.message : "Unknown error"}`, err)
    }
  }

  // Toggle grid (list) view for the profile
  const toggleGridView = async () => {
    if (!profile) return
    const newView = !profile.gridView
    const currentSortOrder = selectedSortOrder
    try {
      const response = await API.api.updatePreferences({
        gridView: newView,
        sortOrder: currentSortOrder,
        theme: mode,
      })
      if (!response.ok) throw response.error
      refreshProfile()
    } catch (err) {
      showError(`Error updating view mode.`, err)
    }
  }

  const updatePreferences = async () => {
    if (!profile) return
    try {
      const response = await API.api.updatePreferences({
        sortOrder: selectedSortOrder,
        gridView: profile.gridView,
        theme: mode,
      })
      if (!response.ok) throw response.error
      refreshProfile()
    } catch (err) {
      showError(`Error updating preferences`, err)
    }
  }

  // Wrapper function that ignores the return value
  const handleRefreshProfile = async (): Promise<void> => {
    await refreshProfile()
    // Return nothing (void)
  }

  // Render the appropriate section based on activeSection
  const renderSection = () => {
    if (!profile) return null

    switch (activeSection) {
      case "profile":
        return (
          <PreferencesSection
            profile={profile}
            loading={loading}
            avatarUrl={avatarUrl}
            selectedSortOrder={selectedSortOrder}
            setSelectedSortOrder={setSelectedSortOrder}
            mode={mode}
            setTheme={setTheme}
            editingField={editingField}
            updatedValue={updatedValue}
            setEditingField={setEditingField}
            setUpdatedValue={setUpdatedValue}
            handleEdit={handleEdit}
            handleSave={handleSave}
            toggleGridView={toggleGridView}
            updatePreferences={updatePreferences}
            refreshProfile={handleRefreshProfile}
          />
        )
      case "security":
        return (
          <SecuritySettingsSection
            profile={profile}
            loading={loading}
            editingField={editingField}
            updatedValue={updatedValue}
            setUpdatedValue={setUpdatedValue}
            handleEdit={handleEdit}
            handleSave={handleSave}
            sessions={sessions}
            setSessions={setSessions}
            showTotpWarningModal={showTotpWarningModal}
            setShowTotpWarningModal={setShowTotpWarningModal}
            showTOTPSetup={showTOTPSetup}
            totpInputCode={totpInputCode}
            setTOTPInputCode={setTOTPInputCode}
            totpVerified={totpVerified}
            qrCode={qrCode}
            handleRegenerateTOTP={handleRegenerateTOTP}
            handleVerifyInline={handleVerifyInline}
            handleEnableTOTP={handleEnableTOTP}
            showError={showError}
          />
        )
        case "notifications":
          return (
            <Box sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography variant="h5" gutterBottom>
                Notifications Settings
              </Typography>
              <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
                <Typography variant="body1">Notification settings will be available soon.</Typography>
              </Paper>
            </Box>
          )
        default:
          return (
            <Box sx={{ p: 3 }}>
              <Typography variant="h5" gutterBottom>
                Preferences
              </Typography>
            </Box>
          )
    }
  }

  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down("md"))

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, height: { xs: "auto", md: "calc(100vh - 100px)" } }}>
      <Paper
        elevation={2}
        sx={{
          borderRadius: 2,
          overflow: "hidden",
          bgcolor: (theme) => theme.palette.background.paper,
          height: { xs: "auto", md: "100%" }, // Adjust height for mobile
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Grid container sx={{ height: { xs: "auto", md: "100%" } }}>
          {/* Left Sidebar with buttons - Convert to horizontal tabs on mobile */}
          <Grid
            item
            xs={12}
            md={3}
            sx={{
              borderRight: { xs: 0, md: 1 },
              borderBottom: { xs: 1, md: 0 },
              borderColor: "divider",
              height: { xs: "auto", md: "100%" },
            }}
          >
            <Box sx={{ p: { xs: 1, sm: 2 }, height: "100%", overflow: "auto" }}>
              <Tabs
                orientation={isMobile ? "horizontal" : "vertical"}
                variant={isMobile ? "fullWidth" : "standard"}
                value={activeSection}
                onChange={(_, newValue) => {
                  setParams((prev) => {
                    prev.set("section", newValue)
                    return prev
                  })
                }}
                sx={{
                  borderRight: { xs: 0, md: 1 },
                  borderColor: "divider",
                  "& .MuiTab-root": {
                    alignItems: { xs: "center", md: "flex-start" },
                    textAlign: { xs: "center", md: "left" },
                    py: { xs: 1, md: 2 },
                    minHeight: { xs: 48, md: "auto" },
                  },
                }}
              >
                <Tab
                  label="Preferences"
                  value="profile"
                  sx={{
                    fontWeight: activeSection === "profile" ? 600 : 400,
                    color:
                      activeSection === "profile"
                        ? (theme) => theme.palette.primary.main
                        : (theme) => theme.palette.text.primary,
                  }}
                />
                <Tab
                  label="Security"
                  value="security"
                  sx={{
                    fontWeight: activeSection === "security" ? 600 : 400,
                    color:
                      activeSection === "security"
                        ? (theme) => theme.palette.primary.main
                        : (theme) => theme.palette.text.primary,
                  }}
                />
                <Tab
                  label="Notifications"
                  value="notifications"
                  sx={{
                    fontWeight: activeSection === "notifications" ? 600 : 400,
                    color:
                      activeSection === "notifications"
                        ? (theme) => theme.palette.primary.main
                        : (theme) => theme.palette.text.primary,
                  }}
                />
              </Tabs>
            </Box>
          </Grid>

          {/* Right content area - Make this scrollable */}
          <Grid
            item
            xs={12}
            md={9}
            sx={{ height: { xs: "auto", md: "100%" }, overflow: { xs: "visible", md: "hidden" } }}
          >
            <Box sx={{ height: { xs: "auto", md: "100%" }, overflow: { xs: "visible", md: "auto" } }}>
              {renderSection()}
            </Box>
          </Grid>
        </Grid>
      </Paper>
    </Container>
  )
}

export default Profile
