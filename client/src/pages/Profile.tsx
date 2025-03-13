import React, { useState, useEffect } from 'react';
import AvatarUpload from './ProfileAvatar';
import {Button, useTheme} from '@mui/material';


function Profile() {

  type RegenerateTOTPRequest = { type: "regenerate"; password: string };
  type VerifyTOTPRequest = { type: "verify"; code: string };
  type EnableTOTPRequest = { type: "enable"; enable: boolean; password: string };
  
  const [activeSection, setActiveSection] = useState<string>('profile'); // Tracks the active section
  const [user, setUser] = useState<{ username: string; email: string | null; id: string; avatarExtension: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [updatedValue, setUpdatedValue] = useState<string>("");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [totpStatus, setTotpStatus] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true); // Loading state for fetching user data


  const [avatarUrl, setAvatarUrl] = useState<string>("https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png");

  //Fetch User data
  useEffect(() => {
    fetch("http://localhost:6969/api/profile", {
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
        ? `http://localhost:6969/api/avatars/${user.id}.${user.avatarExtension}` // Construct the URL using user.id and user.avatarExtension
        : "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png"; // Default avatar URL
    }
    return "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png"; // Default avatar if user is null
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
  const handleSave = async (field: string) => {
    try {
      const requestBody: any = {
        type: field.charAt(0).toLowerCase() + field.slice(1), // Convert "username" to "Username"
        newValue: updatedValue,
        password: prompt("Enter your current password to confirm change"),
      };

      if (!requestBody.password) {
        throw new Error("Password confirmation is required.");
      }

      if (field === "password") {
        const encryptedPrivateKey = prompt("Enter your encrypted private key");
        if (!encryptedPrivateKey) {
          throw new Error("Encrypted private key is required for password change.");
        }
        requestBody.encryptedPrivateKey = btoa(encryptedPrivateKey);
      }

      console.log("🚀 Sending request:", JSON.stringify(requestBody, null, 2)); // Log formatted request

      const response = await fetch("http://localhost:6969/api/profile", {
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

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Server Response:", errorData);
            throw new Error(`Failed to update ${field}: ${errorData.message || response.statusText}`);
        }

        const updatedUser = await response.json();
        console.log("Updated user data:", updatedUser); //Log updated user data
        setUser(updatedUser);
        setEditingField(null);
    } catch (err) {
        console.error("Error:", err);
        setError(`Error updating ${field}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const theme = useTheme();

  // Define sections as separate components or elements
  const renderContent = () => {


    switch (activeSection) {
      case 'profile':
        return( 
        <div className= "profileInfo">
            <h3>Profile Information Section</h3>
            {error ? (
                <p style={{color: "red"}}>Error: {error}</p>
            ) : user ?(
                <div>
              <div className='userInfo' style={{ color: 'black' }}>
                <p style={{ color: 'black' }}><strong>Username:</strong> {user.username} </p>
                <p style={{ color: 'black' }}><strong>Email:</strong> {user.email || "No email provided"}</p>
                <p style={{ color: 'black' }}><strong>User ID:</strong> {user.id}</p>
                <p style={{ color: 'black' }}><strong>Extension:</strong> {user.avatarExtension || "No extension provided"}</p>
                <h3>Upload your avatar</h3>
                <AvatarUpload avatarUrl={avatarUrl} onAvatarChange={(newExt: string) => {
                  setUser({ ...user!, avatarExtension: newExt })
                  setAvatarUrl(`${getAvatarUrl({ id: user.id, avatarExtension: newExt })}?v=${Math.random()}`)
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
                        {/*<button onClick={() => handleSave("username")}>Save</button>*/}
                        <Button variant="contained" onClick={() => handleSave("username")} style={
                          {
                            backgroundColor: theme.palette.mode === 'dark' ? '#2f27ce': '#3a31d8', 
                            color: theme.palette.mode === 'dark' ? '#050316' : '#eae9fc', 
                            textTransform: 'none'
                          }
                        }>Save</Button>
                      </>
                    ) : (
                      <>
                        {user.username}{" "}
                        {/*<button onClick={() => handleEdit("username", user.username)}>Edit</button>*/}
                        <Button variant="contained" onClick={() => handleEdit("username", user.username)} style={
                          {
                            backgroundColor: theme.palette.mode === 'dark' ? '#2f27ce': '#3a31d8', 
                            color: theme.palette.mode === 'dark' ? '#050316' : '#eae9fc', 
                            textTransform: 'none'
                          }
                        }>Edit</Button>
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
                        {/*<button onClick={() => handleSave("password")}>Save</button>*/}
                        <Button variant="contained" onClick={() => handleSave("password")} style={
                          {
                            backgroundColor: theme.palette.mode === 'dark' ? '#2f27ce': '#3a31d8', 
                            color: theme.palette.mode === 'dark' ? '#050316' : '#eae9fc', 
                            textTransform: 'none'
                          }
                        }>Save</Button>
                      </>
                    ) : (
                      <>
                        ••••••••{" "}
                        {/*<button onClick={() => handleEdit("password", "")}>Change Password</button>*/}
                        <Button variant="contained" onClick={() => handleEdit("password", "")} style={
                          {
                            backgroundColor: theme.palette.mode === 'dark' ? '#2f27ce': '#3a31d8', 
                            color: theme.palette.mode === 'dark' ? '#050316' : '#eae9fc', 
                            textTransform: 'none'
                          }
                        }>Change Password</Button>
                      </>
                    )}
                  </p>
                </div>
              ) : (
                <p>Loading user data...</p>
              )}
          </div >

        );
        case 'security':
          return (
              <div className = "profileInfo">
                  <h3>Security and Privacy Section</h3>
      
                  {/* Handle Loading and Errors */}
                  {loading ? (
                      <p>Loading user data...</p>
                  ) : error ? (
                      <p style={{ color: "red" }}>Error: {error}</p>
                  ) : (
                      <>
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
                      </>
                  )}
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

  <div className='main' style={{margin: 0}}>
    {/*<h2>Profile</h2>*/}
    <div style={styles.container}>
      {/* Left Sidebar with buttons */}
      <div style={styles.sidebar}>
        <button
          style={{
            ...styles.button,
            ...(activeSection === 'profile' ? styles.active : {}),
          }}
          onClick={() => setActiveSection('profile')}
        >
          Profile Information
        </button>
        <button
          style={{
            ...styles.button,
            ...(activeSection === 'security' ? styles.active : {}),
          }}
          onClick={() => setActiveSection('security')}
        >
          Security and Privacy
        </button>
        <button
          style={{
            ...styles.button,
            ...(activeSection === 'notifications' ? styles.active : {}),
          }}
          onClick={() => setActiveSection('notifications')}
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
