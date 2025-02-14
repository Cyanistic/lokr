import { useState, useEffect } from 'react'



function Profile() {

  // Type the state as File or null for file, and string or null for imageUrl
  
  /*const [imageUrl, setImageUrl] = useState<string | null>(null);

  function getFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0]; // Make sure there's a file
    if (selectedFile) {
      
      setImageUrl(URL.createObjectURL(selectedFile)); // Create and set the image URL
    } else {
      console.log("No file selected!"); // Debugging log
      setImageUrl(null); // If no file selected, reset the imageUrl state
    }
  }*/

  const [activeSection, setActiveSection] = useState<string>('profile'); // Tracks the active section
  const [user, setUser] = useState<{ username: string; email: string | null} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [updatedValue, setUpdatedValue] = useState<string>("");

  //Fetch User data
  useEffect(() =>{
    fetch("http://localhost:6969/api/profile", {
        credentials: "include",
        //headers: {Cookie: "session=3feccca1-ea47-45e1-a4a0-727e5ad501af;"} //Ensures cookies are sent
    })

    .then((response) => {
        if (!response.ok){
            throw new Error("Failed to fetch user data");
        }
        return response.json();
    })
    .then ((data) => setUser(data))
    .catch((err) => setError(err.message))
  }, []);

  //Start editing a field
  const handleEdit = (field: string, currentValue: string | null) =>{
    setEditingField(field);
    setUpdatedValue(currentValue || "");
  }

  //Save edit to backend
  const handleSave = async (field: string) => {
    try{
      const response = await fetch("http://localhost:6969/api/profile", {
        method: "PUT",
        credentials: "include",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ [field]: updatedValue }),
    });

    if(!response.ok) {
        throw new Error("Failed to update ${field}");
    }

    const updatedUser = await response.json();
      setUser(updatedUser); // Update UI with the new data
      setEditingField(null); // Exit edit mode
    } catch (err) {
      setError(`Error updating ${field}: ${err}`);
    }
  };





  
  // Define sections as separate components or elements
  const renderContent = () => {
    switch (activeSection) {
      case 'profile':
        return( 
        <div>
            <h3>Profile Information Section</h3>
            {error ? (
                <p style={{color: "red"}}>Error: {error}</p>
            ) : user ?(
                <div>
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

        </div>

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
      backgroundColor: 'white',
      overflowY: 'auto',
    }
  };

  return(

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