import { useState, useEffect } from 'react';
import AvatarUpload from './ProfileAvatar';


function Profile() {

  const [activeSection, setActiveSection] = useState<string>('profile'); // Tracks the active section
  const [user, setUser] = useState<{ username: string; email: string | null; id: string; avatarExtension: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [updatedValue, setUpdatedValue] = useState<string>("");

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
      .then((data) => { setUser(data); setAvatarUrl(getAvatarUrl(data)) })
      .catch((err) => setError(err.message))
  }, []);

  const getAvatarUrl = (user: { id: string; avatarExtension: string }) => {
    if (user) {
      return user.avatarExtension
        ? `http://localhost:6969/api/avatars/${user.id}.${user.avatarExtension}` // Construct the URL using user.id and user.avatarExtension
        : "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png"; // Default avatar URL
    }
    return "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png"; // Default avatar if user is null
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

      const updatedUser = await response.json();
      console.log("✅ Updated user data:", updatedUser); //Log updated user data
      setUser(updatedUser);
      setEditingField(null);
    } catch (err) {
      console.error("❌ Error:", err);
      setError(`Error updating ${field}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };



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
                        <button onClick={() => handleSave("username")}>Save</button>
                      </>
                    ) : (
                      <>
                        {user.username}{" "}
                        <button onClick={() => handleEdit("username", user.username)}>Edit</button>
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
              ) : (
                <p>Loading user data...</p>
              )}
          </div >

        );
      case 'security':
  return <div>Security and Privacy Section</div>;
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
    flexDirection: 'column' as 'column',
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
