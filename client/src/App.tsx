import { useState } from 'react'
import './App.css'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Register from './pages/Register'
import Profile from './pages/Profile'
import FileExplorer from './pages/FileExplorer'
import Login from './pages/Login'
import Upload from './pages/Upload'

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
      <Route path="/files" element = {<FileExplorer/>}/>
      <Route path='/upload' element = {<Upload/>}/>
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
        <Link to="/upload">Upload</Link>
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
      {Upload()}
    </div>
  )

}

/* //Login page(old)
function Login_old() {
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
} */

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





export default App
