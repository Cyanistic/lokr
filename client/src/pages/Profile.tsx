import { useState, useEffect } from 'react';
import AvatarUpload from './ProfileAvatar';
import { BASE_URL, isValidValue } from '../utils';
import DefaultProfile from "/default-profile.webp";
import { bufferToBase64, deriveKeyFromPassword, encryptPrivateKey, hashPassword } from '../cryptoFunctions';
import localforage from 'localforage';
import { useSearchParams } from 'react-router-dom';
import { UserUpdate } from '../types';

// Valid profile sections 
const Sections = ["profile", "security", "notifications"] as const;

function Profile() {
  type RegenerateTOTPRequest = { type: "regenerate"; password: string };
  type VerifyTOTPRequest = { type: "verify"; code: string };
  type EnableTOTPRequest = { type: "enable"; enable: boolean; password: string };

  const [user, setUser] = useState<{ username: string; email: string | null; id: string; avatarExtension: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [updatedValue, setUpdatedValue] = useState<string>("");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [totpStatus, setTotpStatus] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true); // Loading state for fetching user data
  const [params, setParams] = useSearchParams();
  const [avatarUrl, setAvatarUrl] = useState<string>(DefaultProfile);
  const activeSection = isValidValue(params.get("section"), Sections) ?? "profile";

  //Fetch User data
  useEffect(() => {
    fetch(`${BASE_URL}/api/profile`, {
      credentials: "include",
    })

      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch user data");
        }
        return response.json();
      })
      .then((data) => {
        setUser(data); setAvatarUrl(getAvatarUrl(data))
        if (data.totpEnabled !== undefined) {
          setTotpStatus(data.totpEnabled); //Store TOTP status
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
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
        alert("Password is required!");
        return;
      }

      const requestBody: RegenerateTOTPRequest = { type: "regenerate", password };
      console.log("Sending TOTP Regenerate Request:", JSON.stringify(requestBody, null, 2));

      const response = await fetch("http://localhost:6969/api/totp", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      console.log("Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Server Error:", errorText);
        alert(`Error: ${errorText}`);
        return;
      }
      const responseData = await response.json();
      console.log("TOTP Regenerate Response:", responseData);

      // Ensure the QR code has the correct format
      let qrCode = responseData.qrCode;
      if (!qrCode.startsWith("data:image/png;base64,")) {
        console.warn("QR Code missing base64 prefix, fixing it...");
        qrCode = `data:image/png;base64,${qrCode}`; // Manually add prefix
      }

      console.log("Final QR Code URL:", qrCode);

      setQrCode(qrCode);

    } catch (err) {
      console.error("Error regenerating TOTP:", err);
      alert("Failed to regenerate TOTP.");
    }
  };



  //Verify TOTP
  const handleVerifyTOTP = async () => {
    try {
      const code = prompt("Enter the 6-digit TOTP code:");
      if (!code) {
        alert("TOTP code is required!");
        return;
      }

      const requestBody: VerifyTOTPRequest = { type: "verify", code };
      console.log("Verifying TOTP:", JSON.stringify(requestBody, null, 2));

      const response = await fetch("http://localhost:6969/api/totp", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      console.log("Response status:", response.status);
      if (!response.ok) throw new Error(await response.text());

      alert("TOTP verified successfully! You can now enable TOTP.");
    } catch (err) {
      console.error("Error verifying TOTP:", err);
      alert("Failed to verify TOTP. Please check the code and try again.");
    }
  };



  //Enable/Disable TOTP
  const handleEnableTOTP = async () => {
    try {
      const password = prompt("Enter your current password:");
      if (!password) {
        alert("Password is required!");
        return;
      }

      const enable = !totpStatus;
      const requestBody: EnableTOTPRequest = { type: "enable", enable, password };

      console.log(`Sending TOTP ${enable ? "Enable" : "Disable"} Request:`, JSON.stringify(requestBody, null, 2));

      const response = await fetch("http://localhost:6969/api/totp", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      console.log("Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Server Error:", errorText);
        alert(`Error: ${errorText}`);
        return;
      }

      alert(`TOTP ${enable ? "enabled" : "disabled"} successfully!`);
      setTotpStatus(enable); //Updates status UI
    } catch (err) {
      console.error("Error toggling TOTP:", err);
      alert("Failed to update TOTP settings.");
    }
  };


  //Start editing a field
  const handleEdit = (field: string, currentValue: string | null) => {
    setEditingField(field);
    setUpdatedValue(currentValue || "");
  }

  //Save edit to backend
  const handleSave = async (field: "username" | "password" | "email") => {
    try {
      const passwordSalt: Uint8Array | null = await localforage.getItem("passwordSalt") as Uint8Array | null;
      const requestBody: UserUpdate = {
        type: field,
        newValue: updatedValue,
        password: await hashPassword(prompt("Enter your current password to confirm change")!, passwordSalt),
      };

      if (!requestBody.password) {
        throw new Error("Password confirmation is required.");
      }

      if (field === "password") {
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
      }

      console.log("🚀 Sending request:", JSON.stringify(requestBody, null, 2)); // Log formatted request

      const response = await fetch(`${BASE_URL}/api/profile`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      console.log("🔁 Response status:", response.status); // Log response status

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ Server Response:", errorData);
        throw new Error(`Failed to update ${field}: ${errorData.message || response.statusText}`);
      }

      setUser({ ...user!, [field]: updatedValue });
      setEditingField(null);
    } catch (err) {
      console.error("Error:", err);
      setError(`Error updating ${field}: ${err instanceof Error ? err.message : "Unknown error"}`);
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
        if (error) {
          <div className="profileInfo">
            <h3>Security and Privacy Section</h3>
            <p style={{ color: "red" }}>Error: {error}</p>
          </div>
        }
        return (
          <div className="profileInfo">
            <h3>Profile Information Section</h3>
            <div>
              <div className='userInfo' style={{ color: 'black' }}>
                <p style={{ color: 'black' }}><strong>Username:</strong> {user!.username} </p>
                <p style={{ color: 'black' }}><strong>Email:</strong> {user!.email || "No email provided"}</p>
                <p style={{ color: 'black' }}><strong>User ID:</strong> {user!.id}</p>
                <p style={{ color: 'black' }}><strong>Extension:</strong> {user!.avatarExtension || "No extension provided"}</p>
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
                    <button onClick={() => handleSave("username")}>Save</button>
                  </>
                ) : (
                  <>
                    {user!.username}{" "}
                    <button onClick={() => handleEdit("username", user!.username)}>Edit</button>
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
                    <button onClick={() => handleSave("password")}>Save</button>
                  </>
                ) : (
                  <>
                    ••••••••{" "}
                    <button onClick={() => handleEdit("password", "")}>Change Password</button>
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
        if (error) {
          <div className="profileInfo">
            <h3>Security and Privacy Section</h3>
            <p style={{ color: "red" }}>Error: {error}</p>
          </div>
        }
        return (
          <div className="profileInfo">
            <h3>Security and Privacy Section</h3>
            {/* Display TOTP Status */}
            <p>
              TOTP is currently: <strong>{totpStatus ? "Enabled" : "Disabled"}</strong>
            </p>

            <button onClick={handleRegenerateTOTP}>Regenerate TOTP</button>

            {/* Modal for displaying QR code */}
            {qrCode && (
              <div className="modal">
                <div className="modal-content">
                  <h3>Scan the QR code</h3>
                  <img src={qrCode} alt="TOTP QR Code" style={{ width: "250px", height: "250px" }} />
                  <button onClick={() => setQrCode(null)}>Close</button>
                </div>
              </div>
            )}

            <button onClick={handleVerifyTOTP}>Verify TOTP</button>

            <button onClick={handleEnableTOTP}>
              {totpStatus ? "Disable TOTP" : "Enable TOTP"}
            </button>
          </div>
        );
      case 'notifications':
        return <div>Notifications Settings Section</div>;
      default:
        return <div>Profile Information Section</div>;
    }
  };

  // Inline styles
  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      display: 'flex',
      height: '100vh',
      backgroundColor: '#f5f5f5',
    },
    sidebar: {
      width: '250px',
      backgroundColor: '#333',
      padding: '20px',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
    },
    button: {
      backgroundColor: '#444',
      color: 'white',
      border: 'none',
      padding: '15px',
      marginBottom: '10px',
      textAlign: 'left',
      fontSize: '16px',
      cursor: 'pointer',
      borderRadius: '5px',
      transition: 'background-color 0.3s',
    },
    active: {
      backgroundColor: '#0066cc', // Highlight the active button
    },
    content: {
      flexGrow: 1,
      padding: '20px',
      backgroundColor: 'white', // Ensure background is white
      color: 'black', // Force text color to black
      overflowY: 'auto',
    }
  };

  return (
    <div className='main'>
      <h2>Profile</h2>
      <div style={styles.container}>
        {/* Left Sidebar with buttons */}
        <div style={styles.sidebar}>
          <button
            style={{
              ...styles.button,
              ...(activeSection === 'profile' ? styles.active : {}),
            }}
            onClick={() => setParams(prev => {
              prev.set("section", 'profile');
              return prev
            })}
          >
            Profile Information
          </button>
          <button
            style={{
              ...styles.button,
              ...(activeSection === 'security' ? styles.active : {}),
            }}
            onClick={() => setParams(prev => {
              prev.set("section", 'security');
              return prev
            })}
          >
            Security and Privacy
          </button>
          <button
            style={{
              ...styles.button,
              ...(activeSection === 'notifications' ? styles.active : {}),
            }}
            onClick={() => setParams(prev => {
              prev.set("section", 'notifications');
              return prev
            })}
          >
            Notifications
          </button>
        </div>
        {/* Right content area */}
        <div style={styles.content}>
          {renderContent()}
        </div>
      </div>
      <div className='profileBody'>
        <div className='profilePicBody'>
          {/*<input type="file" onChange={getFile}> </input>*/}
          {/*imageUrl ? (
            <img src={imageUrl} alt="Profile" style={{ maxWidth: '200px', maxHeight: '200px', marginTop: '10px' }} />
          ) : (
            <p>No image selected</p> // Optional message when no image is selected
          )*/}
        </div>

      </div>
    </div>

  )

}

export default Profile;
