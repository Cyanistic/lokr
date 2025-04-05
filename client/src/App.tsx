import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Register from "./pages/Register";
import Login from "./pages/Login";
import TestPage from "./pages/TestPage";
import TestPreviewPage from "./pages/TestPreviewPage";
import NotFound from "./pages/404Page.tsx";
import About from "./pages/About.tsx";
import { isAuthenticated } from "./utils.ts";
import { ProtectedRoute } from "./utils/ProtectedRoute.tsx";
import React from "react";
const Profile = React.lazy(() => import("./pages/Profile.tsx"));
const FileExplorer = React.lazy(() => import("./pages/FileExplorer.tsx"));
const Home = React.lazy(() => import("./pages/Home.tsx"));
import Navigation from "./components/Navbar.tsx";
import ProfileProvider from "./components/ProfileProvider.tsx";

function App() {
  return (
    <>
      <BrowserRouter>
        <ProfileProvider>
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
            <Route path="*" element={<NotFound />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/profile" element={<Profile />} />
              <Route
                path="/files"
                element={<FileExplorer key={"files"} type={"files"} />}
              />
              <Route
                path="/shared"
                element={<FileExplorer key={"shared"} type={"shared"} />}
              />
              <Route path="/test" element={<TestPage />} />
              <Route path="/preview" element={<TestPreviewPage />} />
            </Route>
            <Route path="/share" element={<FileExplorer type={"link"} />} />
          </Routes>
        </ProfileProvider>
      </BrowserRouter>
    </>
  );
}

//Home Page

export default App;
