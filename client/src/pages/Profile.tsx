import { useState, useEffect } from 'react';
import AvatarUpload from './ProfileAvatar';


function Profile() {

  const [activeSection, setActiveSection] = useState<string>('profile'); // Tracks the active section
  const [user, setuser] = useState<{ username: string; email: string | null; id: string; avatarExtension: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [avatarUrl, setAvatarUrl] = useState<string>("https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png");

  //Fetch User data
  useEffect(() => {
    fetch("http://localhost:6969/api/profile", {
      credentials: "include",
      headers: { Cookie: "session=8d45205b-2eb4-4490-a728-654d03d1b67f;" } //Ensures cookies are sent
    })

      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch user data");
        }
        return response.json();
      })
      .then((data) => { setuser(data); setAvatarUrl(getAvatarUrl(data)) })
      .catch((err) => setError(err.message))
  }, []);

  /*const fetchAvatar = async () => {
    const formData = new FormData();
    
    if (user !== null) {
  
      formData.append('id', user.id);
      formData.append('avatarExtension', user.avatarExtension as string);
  
      // Proceed with the fetch or any other logic
    } else {
      return;
    }


    try {
      const response = await fetch("http://localhost:6969/api/profile/upload", {
        method: "GET",
        body: formData,
      });

      if (response.ok) {
        console.log('Avatar returned successfully');
        //setUploadStatus('File uploaded successfully!');
      } else {
        console.log('File upload failed');
        //setUploadStatus('File upload failed. Please try again.');
      }
    } catch (error) {
      console.error('Error during avatar fetch', error);
    }

  }*/
  const getAvatarUrl = (user: { id: string; avatarExtension: string }) => {
    if (user) {
      return user.avatarExtension
        ? `http://localhost:6969/api/avatars/${user.id}.${user.avatarExtension}` // Construct the URL using user.id and user.avatarExtension
        : "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png"; // Default avatar URL
    }
    return "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png"; // Default avatar if user is null
  };

  // Define sections as separate components or elements
  const renderContent = () => {

    // This function updates the avatar URL when the user uploads a new avatar
    /*const handleAvatarChange = (newUrl: string) => {
      setAvatarUrl(newUrl);
    };*/

    switch (activeSection) {
      case 'profile':
        return (
          <div>
            <h3 style={{ color: 'black' }}>Profile Information Section</h3>
            {error ? (
              <p style={{ color: "red" }}>Error: {error}</p>
            ) : user ? (
              <div className='userInfo' style={{ color: 'black' }}>
                <p style={{ color: 'black' }}><strong>Username:</strong> {user.username} </p>
                <p style={{ color: 'black' }}><strong>Email:</strong> {user.email || "No email provided"}</p>
                <p style={{ color: 'black' }}><strong>User ID:</strong> {user.id}</p>
                <p style={{ color: 'black' }}><strong>Extension:</strong> {user.avatarExtension || "No extension provided"}</p>
                <h3>Upload your avatar</h3>
                <AvatarUpload avatarUrl={avatarUrl} onAvatarChange={(newExt: string) => {
                  setuser({ ...user!, avatarExtension: newExt })
                  setAvatarUrl(`${getAvatarUrl({ id: user.id, avatarExtension: newExt })}?v=${Math.random()}`)
                }
                } />
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
