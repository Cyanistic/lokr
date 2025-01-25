import { useState } from 'react'
import './App.css'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Register from './pages/Register'

function App() {
  //const [count, setCount] = useState(0)

  return (
    <>
    <BrowserRouter>

      <Navigation/>

      <Routes>
      <Route path="/" element = {<Home />}/>
      <Route path="/about" element = {<About />}/>
      <Route path="/downloads" element = {<Downloads />}/>
      <Route path="/login" element = {<Login />}/>
      <Route path="/register" element = {<Register />}/>
      <Route path="/profile" element = {<Profile/>}/>
      </Routes>

    </BrowserRouter>
    </>
  )
}

//Navigation Bar
function Navigation(){
  return(
    <div className='header'>
        <Link to="/">Home</Link>
        <Link to="/about">About Lokr</Link>
        <Link to="/downloads">Downloads</Link>
        <Link to="/login">Log In</Link>
      </div>
  )
}

//Home Page
function Home(){
  return (
    <div className = 'main'>
      <h1>Lokr</h1>
      <p>Encrypted File Sharing Website</p>
    </div>
  )

}

//Login page
function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: { preventDefault: () => void }) => {
    e.preventDefault();

    if (!username || !password) {
      setError('Username and password are required.');
    } else {
      setError('');
      console.log('Logged in with:', { username, password });
      alert('Login successful!');
    }
  };

  return (
    <div className = 'main'>
      <h1>Log In Page</h1>
      <form onSubmit={handleLogin} className="register_main">
        <input
          type="username"
          placeholder="Enter Your Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Enter Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit">Log In</button>
        <Link to="/register">Register</Link>
      </form>
    </div>
  );
}

/* //Register page(old)
function Register_Old() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: { preventDefault: () => void }) => {
    e.preventDefault();

    const emailRegex = /^\S+@\S+\.\S+$/;

    if (!username || !password) {
      setError('Username and password are required.');
    } else if (email && !emailRegex.test(email)) {
      setError('Please enter a valid email address.');
    } else {
      setError('');
      console.log('Registered with:', { username, password });
      alert('Registration was successful!');
    }
  };

  return (
    <div className = 'main'>
      <h1>Registration Page</h1>
      <form onSubmit={handleLogin} className="register_main">
      <input
          type="username"
          placeholder="Enter Your Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Enter Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <input
          type="email"
          placeholder="Enter Your Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <Link to="/profile" type="submit">Register</Link>
        <Link to="/login">Log In</Link>
      </form>
    </div>
    
  );
  
}
 */

//About us page
function About() {
  return (
    <div className = 'main'>
      <h1>About Us Page</h1>
      <p>Placeholder for the about us page</p>
    </div>
  )
}

//Downloads page
function Downloads() {
    return (
      <div className = 'main'>
        <h1>Download Page</h1>
        <p>Placeholder for the Download page</p>
      </div>
    )
  
  }


//Profile page
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
  
  // Define sections as separate components or elements
  const renderContent = () => {
    switch (activeSection) {
      case 'profile':
        return <div>Profile Information Section</div>;
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


export default App
