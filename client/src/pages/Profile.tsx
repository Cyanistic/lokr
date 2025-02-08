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
  const [user, setuser] = useState<{ username: string; email: string | null} | null>(null);
  const [error, setError] = useState<string | null>(null);

  //Fetch User data
  useEffect(() =>{
    fetch("http://localhost:6969/api/profile", {
        credentials: "include",
        headers: {Cookie: "session=8d45205b-2eb4-4490-a728-654d03d1b67f;"} //Ensures cookies are sent
    })

    .then((response) => {
        if (!response.ok){
            throw new Error("Failed to fetch user data");
        }
        return response.json();
    })
    .then ((data) => setuser(data))
    .catch((err) => setError(err.message))
  }, []);




  
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
                    <p><strong>Username:</strong> {user.username} </p>
                    <p><strong>Email:</strong> {user.email || "No email provided"}</p>
                </div>
            ) : (
                <p>Loading user data...</p>
            )
            }

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