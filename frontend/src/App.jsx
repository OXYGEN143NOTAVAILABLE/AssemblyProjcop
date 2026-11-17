import { useEffect, useState } from 'react'
import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import GridBackground from './components/GridBackground.jsx'
import Nav from './components/Nav.jsx'
import Footer from './components/Footer.jsx'
import Home from './pages/Home.jsx'
import Gallery from './pages/Gallery.jsx'
import Search from './pages/Search.jsx'
import Profile from './pages/Profile.jsx'
import Simulator from './pages/Simulator.jsx'
import Admin from './pages/Admin.jsx'
import Auth from './pages/Auth.jsx'
import { api } from './api.js'
import useAdminShortcut from './useAdminShortcut.js'

export default function App() {
  const { pathname } = useLocation()
  const [user, setUser] = useState(null)
  const [authLoaded, setAuthLoaded] = useState(false)
  useAdminShortcut()

  useEffect(() => {
    let active = true
    api('/api/auth/me')
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser || null)
      })
      .catch((error) => console.error('Could not load the current user:', error))
      .finally(() => {
        if (active) setAuthLoaded(true)
      })
    return () => { active = false }
  }, [pathname])

  const showGrid = !pathname.startsWith('/simulator')

  return (
    <>
      {showGrid && <GridBackground />}
      <Nav user={user} onLogout={() => setUser(null)} />
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Auth onAuthenticated={setUser} />} />
          <Route path="/gallery" element={<Gallery user={user} />} />
          <Route path="/search" element={<Search />} />
          <Route path="/profile" element={<Profile user={user} authLoaded={authLoaded} />} />
          <Route path="/profiles/:role/:profileId" element={<Profile user={user} authLoaded={authLoaded} />} />
          <Route path="/simulator" element={<Simulator user={user} authLoaded={authLoaded} />} />
          <Route path="/admin/login" element={<Auth admin onAuthenticated={setUser} />} />
          <Route path="/admin" element={!authLoaded ? <p className="status">Checking administrator access…</p> : user?.role === 'admin' ? <Admin /> : <Navigate to="/admin/login" replace />} />
          <Route path="*" element={<div className="content"><h1>Page not found</h1><a className="pill pill-green" href="/">Back home</a></div>} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}
