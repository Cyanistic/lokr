import './App.css'
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom'
import Register from './pages/Register'
import Login from './pages/Login'
import Upload from './pages/Upload'
import TestPage from "./pages/TestPage"
import TestPreviewPage from "./pages/TestPreviewPage";
import { isAuthenticated, logout } from "./utils.ts";
import { ProtectedRoute } from "./utils/ProtectedRoute.tsx";
import React from "react";

const Profile = React.lazy(() => import("./pages/Profile.tsx"));
const FileExplorer = React.lazy(() => import("./pages/FileExplorer.tsx"));

function App() {
  return (
    <>
      <BrowserRouter>
        <Navigation />

        <Routes>
          <Route
            path="/"
            element={
              isAuthenticated() ? (
                <Navigate to="/files" replace />
              ) : (
                <Navigate to="/home" replace />
              )
            }
          />
          <Route path="/home" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/profile" element={<Profile />} />
            <Route path="/files" element={<FileExplorer key={"files"} type={"files"} />} />
            <Route path="/shared" element={<FileExplorer key={"shared"} type={"shared"} />} />
            <Route path="/test" element={<TestPage />} />
            <Route path="/preview" element={<TestPreviewPage />} />
          </Route>
          <Route path="/share" element={<FileExplorer type={"link"} />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

//Navigation Bar
function Navigation() {
  const navigate = useNavigate();
  return (
    <div className="header">
      <Link to="/home">Home</Link>
      <Link to="/about">About Lokr</Link>
      <Link to="/downloads">Downloads</Link>
      {isAuthenticated() ? (
        <Link
          to="/home"
          onClick={async (e) => {
            e.preventDefault();
            if (await logout()) {
              navigate("/home");
            }
          }}
        >
          Logout
        </Link>
      ) : (
        <Link to="/login">Log In</Link>
      )}
    </div>
  );
}

//Home Page
function Home() {
  return (
    <div className="main">
      <div className="home-main">
        <h1>Lokr</h1>
        <img
          src="https://www.pngall.com/wp-content/uploads/10/Lock-PNG-Images.png"
          alt="Lokr logo"
        />
      </div>
      <div className="home-body">
        <b>Encrypted File Sharing Website</b>
        <b>
          Upload and share your files securely while maintaining annonimity.
          Lokr encrypts your files with end-to-end encryption so that only you
          and people you allow can read the data on your files. No account
          required to upload and share files.
        </b>
        <b>
          Start uploading your files by clicking the + icon on the bottom right
          of the screen and pressing the upload button.
        </b>
      </div>
      <div className='upload-box'>
        <Upload />
      </div>
    </div>
  );
}

//About us page
function About() {
  return (
    <div className="main">
      <h1>About Us</h1>
      <div className="about-body">
        <div className="about-box">
          <h2>About</h2>
          <p>
            Lokr is more than just a file-sharing service— it's a movement
            toward reclaiming your digital rights. In an age where every click
            and upload can be tracked, Lokr empowers you with a platform built
            on robust privacy and security, ensuring your data stays yours.
          </p>
        </div>
        <div className="about-box">
          <h2>Privacy and Security First</h2>
          <p>
            At Lokr, we believe that privacy is a fundamental human right. With
            increasing surveillance and data exploitation, oppressive regimes
            and large corporations alike have tried to strip away individual
            freedoms under the guise of safety and efficiency. Our response is
            clear: a platform where your files are shielded by end-to-end
            encryption, making sure that no one—not even the server—can read
            your data. Every file you send is protected by cutting-edge
            cryptographic protocols, ensuring that even if an attacker gains
            access, your sensitive information remains completely unreadable.
          </p>
        </div>
        <div className="about-box">
          <h2>Seamless and Secure File Sharing</h2>
          <p>
            Sharing files shouldn't mean sacrificing security. Lokr offers
            flexible sharing options via direct or link-based sharing. Direct
            sharing allows you to share files with other registered users by
            specifying usernames, ensuring that only authorized parties can
            access your content. Our link-based sharing allows for the
            generation share links that can be password protected with
            customizable expiration times, allowing you to control who can view
            your files, even if the link is distributed widely. Our system is
            built to balance usability with uncompromising security, so you can
            collaborate confidently while maintaining full control over your
            data.
          </p>
        </div>
        <div className="about-box">
          <h2>Complete Anonymity</h2>
          <p>
            For those who value complete anonymity, Lokr allows you to upload
            and share files without creating an account. This feature gives you
            the power to disseminate information without leaving any personal
            trace.
          </p>
        </div>
        <div className="about-box">
          <h2>Our Commitment to You</h2>
          <p>
            We are dedicated to continuously advancing our technology and
            security measures. Lokr is designed from the ground up to protect
            your digital privacy, and we remain committed to researching and
            implementing the latest cryptographic innovations. Join us in
            creating a safer digital landscape where privacy and anonymity
            aren't privileges, but rights for everyone.
          </p>
        </div>
      </div>
    </div>
  );
}

//Downloads page
function Downloads() {
  return (
    <div className="main">
      <h1>Download Page</h1>
      <p>Placeholder for the Download page</p>
    </div>
  );
}

export default App;
