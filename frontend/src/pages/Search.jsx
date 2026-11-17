import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'

export default function Search() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') || ''
  const [term, setTerm] = useState(query)
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    setTerm(query)
    if (query.trim().length < 2) {
      setResults([])
      setError('')
      return () => { active = false }
    }
    setError('')
    setLoading(true)
    api(`/api/search?q=${encodeURIComponent(query)}`)
      .then((data) => { if (active) setResults(data.results || []) })
      .catch((err) => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [query])

  return (
    <section className="content narrow-content">
      <p className="eyebrow">Explore Assembly PC</p>
      <h1>Search</h1>
      <form className="search-form" onSubmit={(event) => { event.preventDefault(); setParams({ q: term }) }}>
        <input type="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Builds, scenarios, or profiles" aria-label="Search" />
        <button className="pill pill-green">Search</button>
      </form>
      {query && <p className="muted">Results for “{query}”</p>}
      {loading && <p className="status">Searching…</p>}
      {error && <p role="alert" className="error-message">{error}</p>}
      {!loading && query.length >= 2 && !results.length && !error && <p className="empty-state">No matching builds, scenarios, or profiles.</p>}
      <div className="result-list">
        {results.map((item, index) => (
          <Link className="data-card search-result" key={`${item.type}-${item.id || index}`} to={item.url || '/gallery'}>
            <span className="eyebrow">{item.type}</span>
            <h2>{item.title}</h2>
            {item.subtitle && <p className="muted">{item.subtitle}</p>}
          </Link>
        ))}
      </div>
    </section>
  )
}
