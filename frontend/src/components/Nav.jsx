import { NavLink, Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/simulator', label: 'Simulator' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/profile', label: 'Profile' },
]

export default function Nav({ user, onLogout }) {
  const navigate = useNavigate()

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' })
      onLogout()
      navigate('/')
    } catch (error) {
      window.alert(error.message)
    }
  }

  return (
    <header className="nav">
      <Link to="/" className="brand">
        <span className="brand-mark">PC</span>
        <span>Assembly PC</span>
      </Link>

      <nav className="nav-links" aria-label="Main">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className="nav-link">
            {l.label}
          </NavLink>
        ))}
      </nav>

      <div className="nav-right">
        <form action="/search" method="get" className="nav-search">
          <input name="q" type="search" placeholder="Search builds or profiles" aria-label="Search builds or profiles" />
        </form>
        {user ? (
          <>
            {user.role === 'admin' && <Link className="pill pill-light" to="/admin">Admin</Link>}
            <button className="pill pill-light" onClick={logout}>Log out</button>
          </>
        ) : (
          <Link className="pill pill-light" to="/login">Log in</Link>
        )}
      </div>
    </header>
  )
}
