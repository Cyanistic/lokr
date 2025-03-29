import "./App.css";
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate } from "react-router-dom";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import FileExplorer from "./pages/FileExplorer";
import Login from "./pages/Login";
import Upload from "./pages/Upload";
import TestPage from "./pages/TestPage";
import TestPreviewPage from "./pages/TestPreviewPage";
import { isAuthenticated, logout } from "./utils";
import { ProtectedRoute } from "./utils/ProtectedRoute";

function App() {
  return (
    <BrowserRouter>
      <Navigation />
      <Routes>
        <Route
          path="/"
          element={isAuthenticated() ? (<Navigate to="/files" replace />) : (<Navigate to="/home" replace />)}
        />
        <Route path="/home" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/downloads" element={<Downloads />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/profile" element={<Profile />} />
          <Route path="/files" element={<FileExplorer />} />
          <Route path="/test" element={<TestPage />} />
          <Route path="/preview" element={<TestPreviewPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

// Navigation Bar
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

// Home Page
function Home() {
  return (
    <div className="main">
      <h1>Lokr</h1>
      <p>Encrypted File Sharing Website</p>
      <Upload />
    </div>
  );
}

// About Page
function About() {
  return (
    <div className="main">
      <h1>About Us Page</h1>
      <p>Placeholder for the about us page</p>
    </div>
  );
}

// Downloads Page
function Downloads() {
  return (
    <div className="main">
      <h1>Download Page</h1>
      <p>Placeholder for the download page</p>
    </div>
  );
}

export default App;
