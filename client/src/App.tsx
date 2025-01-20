import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'

function App() {
  const [count, setCount] = useState(0)

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
      </Routes>

    </BrowserRouter>


      <div className='main'>
        {/*<div>
          <a href="https://vite.dev" target="_blank">
            <img src={viteLogo} className="logo" alt="Vite logo" />
          </a>
          <a href="https://react.dev" target="_blank">
            <img src={reactLogo} className="logo react" alt="React logo" />
          </a>
        </div>}
        {<h1>Lokr</h1>}
        <div className="card">
          <button onClick={() => setCount((count) => count + 1)}>
            Encrypted Files Shared {count}
          </button>
          <p>
            Edit <code>src/App.tsx</code> and save to test HMR
          </p>
        </div>
        <p className="read-the-docs">
          Click on the Vite and React logos to learn more
        </p>
      </div>
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: { preventDefault: () => void }) => {
    e.preventDefault();

    const emailRegex = /^\S+@\S+\.\S+$/;

    if (!email || !password) {
      setError('Email and password are required.');
    } else if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
    } else {
      setError('');
      console.log('Logged in with:', { email, password });
      alert('Login successful!');
    }
  };

  return (
    <div className = 'main'>
      <h1>Log In Page</h1>
      <form onSubmit={handleLogin} className="register_main">
        <input
          type="email"
          placeholder="Enter Your Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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

//Register page
function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: { preventDefault: () => void }) => {
    e.preventDefault();

    const emailRegex = /^\S+@\S+\.\S+$/;

    if (!email || !password) {
      setError('Email and password are required.');
    } else if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
    } else {
      setError('');
      console.log('Registered with:', { email, password });
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
          type="email"
          placeholder="Enter Your Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
        <button type="submit">Register</button>
        <Link to="/login">Log In</Link>
      </form>
    </div>
  );
}


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
