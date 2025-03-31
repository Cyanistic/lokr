import { useState, useEffect } from 'react';
import AvatarUpload from './ProfileAvatar';
import { API, BASE_URL, isValidValue } from '../utils';
import DefaultProfile from "/default-profile.webp";
import { bufferToBase64, deriveKeyFromPassword, encryptPrivateKey, hashPassword } from '../cryptoFunctions';
import localforage from 'localforage';
import { useSearchParams } from 'react-router-dom';
import { UserUpdate } from '../myApi';
import { useErrorToast } from '../components/ErrorToastProvider';
import "./Profile.css"

// Valid profile sections 
const Sections = ["profile", "security", "notifications"] as const;

function Profile() {
  type RegenerateTOTPRequest = { type: "regenerate"; password: string };
  type VerifyTOTPRequest = { type: "verify"; code: string };
  type EnableTOTPRequest = { type: "enable"; enable: boolean; password: string };
  type Session = { number: number; createdAt: string; lastUsedAt: string; userAgent?: string | null; };

  const [user, setUser] = useState<{ username: string; email: string | null; id: string; avatarExtension: string | null } | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [updatedValue, setUpdatedValue] = useState<string>("");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [totpStatus, setTotpStatus] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true); // Loading state for fetching user data
  const [params, setParams] = useSearchParams();
  const [avatarUrl, setAvatarUrl] = useState<string>(DefaultProfile);
  const activeSection = isValidValue(params.get("section"), Sections) ?? "profile";
  const { showError } = useErrorToast();
  const [sessions, setSessions] = useState<Session[]>([]);

  const [showTOTPSetup, setShowTOTPSetup] = useState(false); // State to control TOTP setup
  const [totpInputCode, setTOTPInputCode] = useState("");
  const [totpVerified, setTOTPVerified] = useState(false);

  //Fetch User data
  useEffect(() => {
    const getData = async () => {
      try {
        const response = await API.api.getLoggedInUser();
        if (!response.ok) throw response.error;
        const data = await response.json();
        setUser(data);
        setAvatarUrl(getAvatarUrl(data));
        if (data.totpEnabled !== undefined) {
          setTotpStatus(data.totpEnabled); //Store TOTP status
        }
      } catch (err: any) {
        showError("Failed to fetch user data. Please try again.", err);
      }
      setLoading(false);
    }
    getData()
  }, []);

  //Fetch Sessions
  useEffect(() => {
    fetch(`${BASE_URL}/api/sessions`, {
      credentials: "include",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch sessions");
        }
        return response.json();
      })
      .then((sessionData) => {
        setSessions(sessionData);
      })
      .catch((err) => {
        console.error("Failed to fetch sessions:", err);
      });
  }, []);

  const getAvatarUrl = (user: { id: string; avatarExtension: string }) => {
    if (user) {
      return user.avatarExtension
        ? `${BASE_URL}/api/avatars/${user.id}.${user.avatarExtension}` // Construct the URL using user.id and user.avatarExtension
        : DefaultProfile; // Default avatar URL
    }
    return DefaultProfile; // Default avatar if user is null
  };

  //Regenerate TOTP
  const handleRegenerateTOTP = async () => {
    try {
      const password = prompt("Enter your current password:");
      if (!password) {
        showError("Password is required!");
        return;
      }

      const passwordSalt: Uint8Array | null = await localforage.getItem("passwordSalt");
      const hashedPassword = await hashPassword(password, passwordSalt);
      const requestBody: RegenerateTOTPRequest = { type: "regenerate", password: hashedPassword };
      
      const response = await API.api.updateTotp(requestBody);

      if (!response.ok) {
        const errorText = await response.text();
        showError("Server Error", errorText);
        return;
      }
      const responseData = await response.json();
      console.log("TOTP Regenerate Response:", responseData);

      // Ensure the QR code has the correct format
      let qrCode = responseData.qrCode;
      if (!qrCode.startsWith("data:image/png;base64,")) {
        qrCode = `data:image/png;base64,${qrCode}`; // Manually add prefix
      }
      setQrCode(qrCode);
      setShowTOTPSetup(true);
      setTOTPVerified(false);
      setTOTPInputCode("");

    } catch (err) {
      console.error("Error regenerating TOTP:", err);
      showError("Failed to regenerate TOTP.");
    }
  };

  //Verify TOTP
  const handleVerifyInline = async () => {
    try {
      const responseBody: VerifyTOTPRequest = { type: "verify", code: totpInputCode };
      const response = await API.api.updateTotp(responseBody);
      if (!response.ok) { throw new Error(await response.text()) }

      alert ("TOTP verified successfully! You can now enable TOTP.");
      setTOTPVerified(true);

      //Hides after verification
      setShowTOTPSetup(false);
      setQrCode(null);
      setTOTPInputCode("");

    } catch (err) {
      console.error("TOTP verification failed", err);
      alert("Invalid TOTP code.");
    }
  };



  /*old Verify TOTP
  const handleVerifyTOTP = async () => {
    try {
      const code = prompt("Enter the 6-digit TOTP code:");
      if (!code) {
        showError("TOTP code is required!");
        return;
      }

      const requestBody: VerifyTOTPRequest = { type: "verify", code };
      console.log("Verifying TOTP:", JSON.stringify(requestBody, null, 2));

      const response = await API.api.updateTotp(requestBody);

      console.log("Response status:", response.status);
      if (!response.ok) throw response.error;

      showError("TOTP verified successfully! You can now enable TOTP.");
    } catch (err) {
      showError("Failed to verify TOTP. Please check the code and try again.", err);
    }
  };
  */



  //Enable/Disable TOTP
  const handleEnableTOTP = async () => {
    try {
      const password = prompt("Enter your current password:");
      if (!password) {
        showError("Password is required!");
        return;
      }

      const passwordSalt: Uint8Array | null = await localforage.getItem("passwordSalt");
      if (!passwordSalt){
        throw new Error("Passsword salt not found");
      }

      const hashedPassword = await hashPassword(password, passwordSalt);
      const enable = !totpStatus;
      const requestBody: EnableTOTPRequest = { type: "enable", enable, password: hashedPassword };

      console.log(`Sending TOTP ${enable ? "Enable" : "Disable"} Request:`, JSON.stringify(requestBody, null, 2));

      const response = await API.api.updateTotp(requestBody);

      console.log("Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Server Error:", errorText);
        showError(`Error: ${errorText}`);
        return;
      }

      showError(`TOTP ${enable ? "enabled" : "disabled"} successfully!`);
      setTotpStatus(enable); //Updates status UI
    } catch (err) {
      console.error("Error toggling TOTP:", err);
      showError("Failed to update TOTP settings.");
    }
  };

  //Delete session
  const handleDeleteSession = async (sessionNumber: number) => {
    const confirmDelete = confirm("Are you sure you want to delete session #${sessionNumber}?");
    if (!confirmDelete) return;

    try {
      const response = await fetch(`${BASE_URL}/api/session/${sessionNumber}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      alert("Session deleted");

      //Remove deleted session from the state
      setSessions(prev => prev.filter(session => session.number !== sessionNumber));
    } catch (err) {
      console.error("Error deleting session:", err);
      alert("Failed to delete session.");
    }

  }


  //Start editing a field
  const handleEdit = (field: string, currentValue: string | null) => {
    setEditingField(field);
    setUpdatedValue(currentValue || "");
  }

  //Save edit to backend
  const handleSave = async (field: "username" | "password" | "email") => {
    try {
      const passwordSalt: Uint8Array | null = await localforage.getItem("passwordSalt") as Uint8Array | null;
      const password = prompt("Enter your current password to confirm change");
      let requestBody: UserUpdate;

      if (!password) {
        throw new Error("Password confirmation is required.");
      }

      if (field === "password") {
        requestBody = {
          type: "password",
          newValue: updatedValue,
          password: await hashPassword(password, passwordSalt),
          encryptedPrivateKey: "",
        }
        // Encrypt the user's private key with their new password
        const salt: string | undefined | null = await localforage.getItem("salt");
        const privateKey: CryptoKey | undefined | null = await localforage.getItem("privateKey");
        const iv: string | undefined | null = await localforage.getItem("iv");
        if (!salt) {
          throw new Error("Could not find master key salt");
        }
        if (!privateKey) {
          throw new Error("Could not find private key");
        }
        if (!iv) {
          throw new Error("Could not find iv");
        }
        const masterKey = await deriveKeyFromPassword(updatedValue, salt);
        const { iv: _, encrypted: encryptedPrivateKey } = await encryptPrivateKey(privateKey, masterKey, iv);
        requestBody.encryptedPrivateKey = bufferToBase64(encryptedPrivateKey);
        // Hash the new password for the backend
        requestBody.newValue = await hashPassword(requestBody.newValue, passwordSalt);
      } else {
        requestBody = {
          type: field,
          newValue: updatedValue,
          password: await hashPassword(password, passwordSalt),
        }
      }

      console.log("Sending request:", JSON.stringify(requestBody, null, 2)); // Log formatted request

      const response = await API.api.updateUser(requestBody);

      console.log("Response status:", response.status); // Log response status

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Server Response:", errorData);
        throw new Error(`Failed to update ${field}: ${errorData.message || response.statusText}`);
      }

      setUser({ ...user!, [field]: updatedValue });
      setEditingField(null);
    } catch (err) {
      showError(`Error updating ${field}: ${err instanceof Error ? err.message : "Unknown error"}`, err);
    }
  };

  // Define sections as separate components or elements
  const renderContent = () => {


    switch (activeSection) {
      case 'profile':
        if (loading) {
          return (
            <div className="profileInfo">
              <h3>Profile Information Section</h3>
              <p>Loading user data...</p>
            </div>
          )
        }
        // if (error) {
        //   <div className="profileInfo">
        //     <h3>Security and Privacy Section</h3>
        //     <p style={{ color: "red" }}>Error: {error}</p>
        //   </div>
        // }
        return (
          <div className="profileInfo">
            <h3>Profile Information Section</h3>
            <div>
              <div className='userInfo'>
                <p ><strong>Username:</strong> {user!.username} </p>
                <p ><strong>Email:</strong> {user!.email || "No email provided"}</p>
                <h3>Upload your avatar</h3>
                <AvatarUpload avatarUrl={avatarUrl} onAvatarChange={(newExt: string) => {
                  setUser({ ...user!, avatarExtension: newExt })
                  setAvatarUrl(`${getAvatarUrl({ id: user!.id, avatarExtension: newExt })}?v=${Math.random()}`)
                }
                } />
              </div>
              <p>
                <strong>Username:</strong>{" "}
                {editingField === "username" ? (
                  <>
                    <input
                      type="text"
                      value={updatedValue}
                      onChange={(e) => setUpdatedValue(e.target.value)}
                    />
                    <button className='b1' onClick={() => handleSave("username")}>Save</button>
                  </>
                ) : (
                  <>
                    {user!.username}{" "}
                    <button className='b1' onClick={() => handleEdit("username", user!.username)}>Edit</button>
                  </>
                )}
              </p>
              <p>
                <strong>Password:</strong>{" "}
                {editingField === "password" ? (
                  <>
                    <input
                      type="password"
                      placeholder="Enter new password"
                      value={updatedValue}
                      onChange={(e) => setUpdatedValue(e.target.value)}
                    />
                    <button className='b1' onClick={() => handleSave("password")}>Save</button>
                  </>
                ) : (
                  <>
                    ••••••••{" "}
                    <button className='b1' onClick={() => handleEdit("password", "")}>Change Password</button>
                  </>
                )}
              </p>
            </div>
          </div >

        );
      case 'security':
        if (loading) {
          return (
            <div className="profileInfo">
              <h3>Security and Privacy Section</h3>
              <p>Loading user data...</p>
            </div>
          )
        }
        // if (error) {
        //   <div className="profileInfo">
        //     <h3>Security and Privacy Section</h3>
        //     <p style={{ color: "red" }}>Error: {error}</p>
        //   </div>
        // }
        return (
          <div className="profileInfo">
            <h3>Security and Privacy Section</h3>
            {/* Display TOTP Status */}
            <p>
              TOTP is currently: <strong>{totpStatus ? "Enabled" : "Disabled"}</strong>
            </p>

            <button className='b1' onClick={handleRegenerateTOTP}>Regenerate TOTP</button>

            {/* QR code display */}
            {showTOTPSetup && (
              <div style={{ marginTop: "20px" }}>
              <h4>Scan this QR Code with your Authenticator App</h4>
              <img src={qrCode!} alt="TOTP QR Code" style={{ width: "250px", height: "250px" }} />

              <div style={{ marginTop: "10px" }}>
                <input
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={totpInputCode}
                  onChange={(e) => setTOTPInputCode(e.target.value)}
                  maxLength={6}
                  style={{ padding: "8px", width: "200px" }}
                />
                <button
                  onClick={handleVerifyInline}
                  style={{ marginLeft: "10px", padding: "8px 16px" }}>
                    Verify
                </button>
            </div>
          </div>
          )}
  

            {totpVerified && (
            <button onClick={handleEnableTOTP}>
              {totpStatus ? "Disable TOTP" : "Enable TOTP"}
            </button>
            )}


            {/* Sessions List */}
            <div style={sessionStyles.container}>
              <h4>Sessions</h4>
              {sessions.length === 0 ? (
                <p>No sessions found.</p>
              ) : (
                <ul style={sessionStyles.list}>
                  {sessions.map((session, index) => (
                    <li key={session.number} style={sessionStyles.item}>
                      <p>
                        <strong>{index === 0 ? "Current Session" : `Session #${session.number}`}</strong>
                      </p>
                      <p><strong>Created:</strong> {new Date(session.createdAt).toLocaleString()}</p>
                      <p><strong>Last Used:</strong> {new Date(session.lastUsedAt).toLocaleString()}</p>
                      <p><strong>User Agent:</strong> {session.userAgent || "Unknown"}</p>

                      {/* Delete session button except for current*/}
                      {index !== 0 && (
                        <button onClick={() => handleDeleteSession(session.number)}
                          style={{
                            marginTop: "10px",
                            backgroundColor: "#e74c3c",
                            color: "white",
                            border: "none",
                            padding: "6px 12px",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}>
                          Delete Session
                        </button>
                      )}

                    </li>
                  ))}
                </ul>
              )}
            </div>

          </div>

        );
      case 'notifications':
        return <div>Notifications Settings Section</div>;
      default:
        return <div>Profile Information Section</div>;
    }
  };

  const sessionStyles = {
    container: {
      marginTop: "30px",
      padding: "15px",
      border: "1px solid #eee",
      borderRadius: "10px",
      backgroundColor: "#f9f9f9",
    },
    list: {
      listStyle: "none",
      paddingLeft: 0,
    },
    item: {
      marginBottom: "15px",
      padding: "10px",
      backgroundColor: "#fff",
      borderRadius: "5px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    },
  };

  return (
    <div className='main'>
      <div className="profile-container">
        {/* Left Sidebar with buttons */}
        <div className="profile-sidebar">
          <button
            className={`profile-button ${activeSection === 'profile' ? 'active' : ''}`}
            onClick={() => setParams(prev => {
              prev.set("section", 'profile');
              return prev
            })}
          >
            Profile Information
          </button>
          <button
            className={`profile-button ${activeSection === 'security' ? 'active' : ''}`}
            onClick={() => setParams(prev => {
              prev.set("section", 'security');
              return prev
            })}
          >
            Security and Privacy
          </button>
          <button
            className={`profile-button ${activeSection === 'notifications' ? 'active' : ''}`}
            onClick={() => setParams(prev => {
              prev.set("section", 'notifications');
              return prev
            })}
          >
            Notifications
          </button>
        </div>
        {/* Right content area */}
        <div className="profile-content">
          {renderContent()}
        </div>
      </div>
    </div>

  )

}

export default Profile;
