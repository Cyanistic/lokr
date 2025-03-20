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
import { FaLink, FaShieldAlt, FaLock } from "react-icons/fa";
import "./SecurityFeatures.css";
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
  const features = [
    {
      icon: <FaLink size={24} />, 
      title: "Secure Link Sharing", 
      description: "Generate secure, expiring links for file sharing with optional password protection."
    },
    {
      icon: <FaShieldAlt size={24} />, 
      title: "2FA Protection", 
      description: "Add an extra layer of security with two-factor authentication for your account."
    },
    {
      icon: <FaLock size={24} />, 
      title: "End-to-End Encryption", 
      description: "Military-grade encryption ensures your files remain private and secure."
    }
  ];

  return (
    <div className = 'main'>
      <div className='main-home-box'>

        <div className='left-home-box'>
          <h1>Secure File Sharing <br /> Made <span style={{color: "#81E6D9"}}>Simple</span></h1>
          <p>Share files with confidence using encryption and
            advanced privacy features.
          </p>
          <div className='home-buttons'>
            <a href="/register">
              <button className='b1'>Start Sharing</button>
            </a>
            <a href="/about">
              <button className='b2'>Learn More</button>
            </a>
          </div>
        </div>


        <div className='right-home-box'>
          <Upload />
        </div>
      </div>

      <section className="security-section">
        <h2 className="security-title">Advanced Security Features</h2>
        <p className="security-subtitle">Protect your files with industry-leading security measures</p>

        <div className="security-cards">

          {features.map((feature, index) => (
            <div key={index} className="security-card">
              <div className="icon-wrapper">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
          
        </div>
      </section>


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

export default App;
