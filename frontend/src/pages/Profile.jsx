import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'

export default function Profile({ user, authLoaded }) {
  const { role, profileId } = useParams()
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const publicProfile = Boolean(role && profileId)

  useEffect(() => {
    let active = true
    if (!publicProfile && !user) return () => { active = false }
    const path = publicProfile
      ? `/api/profiles/${encodeURIComponent(role)}/${encodeURIComponent(profileId)}`
      : '/api/profile'
    api(path)
      .then((data) => { if (active) { setProfile(data); setError('') } })
      .catch((err) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [role, profileId, user, publicProfile])

  if (!authLoaded && !publicProfile) return <section className="content"><p className="status">Loading profile…</p></section>
  if (!user && !publicProfile) return (
    <section className="content">
      <h1>Sign in to view your profile</h1>
      <Link className="pill pill-green" to="/login">Log in</Link>
    </section>
  )
  const person = profile?.user
  return (
    <section className="content">
      <p className="eyebrow">{publicProfile ? 'Community member' : 'Your account'}</p>
      <h1>{person?.name || (error ? 'Profile unavailable' : 'Loading profile…')}</h1>
      {person && <p className="muted">{person.role} {person.email && `· ${person.email}`}</p>}
      {error && <p role="alert" className="error-message">{error}</p>}
      {profile && <div className="stat-row profile-stats">
        {Object.entries(profile.stats || {}).map(([key, value]) => (
          <span key={key}>{key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)} <strong>{value}</strong></span>
        ))}
      </div>}
      <h2 className="subheading">Builds</h2>
      <div className="card-grid">
        {(profile?.builds || []).map((build) => (
          <article className="data-card" key={build.id || build.build_id}>
            <h3>{build.name || build.build_name}</h3>
            <p className="muted">{build.created_at ? new Date(build.created_at).toLocaleDateString() : ''}</p>
            <Link className="pill pill-green" to={`/simulator?build=${build.id || build.build_id}&readonly=1`}>View build</Link>
          </article>
        ))}
      </div>
      {profile && !profile.builds?.length && <p className="empty-state">No builds to display.</p>}
      {profile?.favorites?.length > 0 && <>
        <h2 className="subheading">Saved favourites</h2>
        <div className="card-grid">{profile.favorites.map((build) => (
          <article className="data-card" key={build.id}><h3>{build.name}</h3><Link className="pill pill-green" to={`/simulator?build=${build.id}&readonly=1`}>View build</Link></article>
        ))}</div>
      </>}
      {profile?.badges?.length > 0 && <>
        <h2 className="subheading">Badges</h2>
        <div className="card-grid">{profile.badges.map((badge) => <article className="data-card" key={badge.badge_key || badge.badge_name}>
          <h3>{badge.badge_name}</h3><p className="muted">{badge.badge_description}</p>
        </article>)}</div>
      </>}
    </section>
  )
}
