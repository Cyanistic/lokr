import './App.css'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Register from './pages/Register'
import Profile from './pages/Profile'
import FileExplorer from './pages/FileExplorer'
import Login from './pages/Login'
import Upload from './pages/Upload'
import TestPage from "./pages/TestPage"

function App() {

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
      <Route path="/test" element={<TestPage />} />
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
      <Upload />
    </div>
  )

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





export default App;
