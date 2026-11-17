import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, sendJson } from '../api.js'

const slots = [
  ['cpu', 'Processor'], ['mb', 'Motherboard'], ['ram', 'Memory'],
  ['gpu', 'Graphics card'], ['storage', 'Storage'], ['psu', 'Power supply'],
  ['case', 'Case'], ['cooler', 'CPU cooler'],
]

function componentId(component) {
  return component?.component_id ?? component?.id
}

function componentName(component) {
  return component?.name || component?.model || component?.product_name || component?.component_name || `Component ${componentId(component)}`
}

function categoryComponents(categories, slot) {
  const aliases = {
    cpu: ['cpu', 'processor'], mb: ['mb', 'motherboard', 'mobo'],
    ram: ['ram', 'memory'], gpu: ['gpu', 'graphics card'],
    storage: ['storage', 'ssd', 'hdd'], psu: ['psu', 'power supply'],
    case: ['case', 'pc case'], cooler: ['cooler', 'cpu cooler'],
  }
  const key = Object.keys(categories).find((name) => aliases[slot].includes(name.toLowerCase().replace(/[_-]/g, ' ')))
  const items = key ? categories[key] : []
  return Array.isArray(items) ? items : []
}

export default function Simulator({ user, authLoaded }) {
  const [searchParams] = useSearchParams()
  const buildId = searchParams.get('build')
  const readOnly = Boolean(buildId && (searchParams.get('readonly') === '1' || searchParams.get('readonly') === 'true'))
  const [categories, setCategories] = useState({})
  const [scenarios, setScenarios] = useState([])
  const [scenarioId, setScenarioId] = useState('')
  const [selected, setSelected] = useState({})
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [buildName, setBuildName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const componentOptions = useMemo(() => Object.fromEntries(
    slots.map(([key]) => [key, categoryComponents(categories, key)])
  ), [categories])

  useEffect(() => {
    let active = true
    Promise.all([
      api('/api/components'),
      api('/api/scenarios'),
      buildId ? api(`/api/builds/${encodeURIComponent(buildId)}`) : Promise.resolve(null),
    ]).then(([available, scenarioList, build]) => {
      if (!active) return
      setCategories(available || {})
      setScenarios(scenarioList || [])
      if (build) {
        setBuildName(build.name || build.build_name || '')
        const data = build.build_data || {}
        setSelected(build.components || data.components || {})
        setReport(build.stats || data.stats || null)
      }
    }).catch((err) => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [buildId])

  useEffect(() => {
    if (loading || !Object.keys(selected).length) return
    let active = true
    sendJson('/api/stats', 'POST', { components: selected, connectedCables: {} })
      .then((data) => { if (active) setReport(data) })
      .catch((err) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [selected, loading])

  async function save() {
    if (!user) {
      window.location.assign('/login')
      return
    }
    setBusy(true)
    setError('')
    try {
      const data = { buildName: buildName.trim() || 'Untitled Build', components: selected, connectedCables: {} }
      const result = await sendJson('/api/builds', 'POST', data)
      setNotice(`Build saved${result.id ? ` (#${result.id})` : ''}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function checkCompatibility() {
    setBusy(true)
    try {
      setReport(await sendJson('/api/compatibility', 'POST', { components: selected, connectedCables: {} }))
      setNotice('Compatibility check complete.')
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function completeScenario() {
    if (!scenarioId || !user) return
    setBusy(true)
    try {
      await sendJson(`/api/scenarios/${encodeURIComponent(scenarioId)}/complete`, 'POST', { score: report?.score ?? null })
      setNotice('Scenario completion recorded.')
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!authLoaded && !readOnly && !buildId) return <section className="content"><p className="status">Checking account…</p></section>
  if (!user && !readOnly && !buildId) return (
    <section className="content">
      <p className="eyebrow">Interactive PC builder</p>
      <h1>Sign in to use the simulator</h1>
      <p className="muted">Sign in to assemble and save a PC build. Published builds can be viewed without an account.</p>
      <Link to="/login" className="pill pill-green">Log in</Link>
    </section>
  )

  return (
    <section className="content simulator-content">
      <p className="eyebrow">{readOnly ? 'Published build' : 'Interactive PC builder'}</p>
      <h1>{readOnly ? buildName || 'Build details' : 'Build your PC'}</h1>
      <p className="muted">Choose parts from the component library and check your build against the backend compatibility rules.</p>
      {loading && <p className="status">Loading component library…</p>}
      {error && <p role="alert" className="error-message">{error}</p>}
      {notice && <p role="status" className="success-message">{notice}</p>}
      <div className="builder-layout">
        <div className="builder-parts">
          {slots.map(([key, label]) => {
            const items = componentOptions[key] || []
            const current = selected[key]
            const currentId = current ? componentId(current) : ''
            return (
              <label className="field" key={key}>{label}
                <select
                  disabled={readOnly || loading}
                  value={currentId ?? ''}
                  onChange={(event) => {
                    const choice = items.find((item) => String(componentId(item)) === event.target.value)
                    setSelected((parts) => {
                      const next = { ...parts }
                      if (choice) next[key] = choice
                      else delete next[key]
                      return next
                    })
                  }}
                >
                  <option value="">Choose {label.toLowerCase()}</option>
                  {items.map((item, index) => <option key={componentId(item) ?? index} value={componentId(item)}>{componentName(item)}</option>)}
                </select>
              </label>
            )
          })}
          <label className="field">Build name
            <input value={buildName} disabled={readOnly} onChange={(event) => setBuildName(event.target.value)} placeholder="My PC build" />
          </label>
          {!readOnly && <label className="field">Guided scenario
            <select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
              <option value="">Free build</option>
              {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.title}</option>)}
            </select>
          </label>}
          {scenarioId && !readOnly && <button className="pill pill-light" onClick={completeScenario} disabled={busy}>Mark scenario complete</button>}
          {!readOnly && <div className="card-actions">
            <button className="pill pill-light" onClick={checkCompatibility} disabled={busy}>Check compatibility</button>
            <button className="pill pill-green" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save build'}</button>
          </div>}
        </div>
        <aside className="data-card report-card">
          <h2>Build report</h2>
          {!report ? <p className="muted">Select components to calculate compatibility and power requirements.</p> : <>
            <p className={report.compatible ? 'success-message' : 'error-message'}>
              {report.compatible ? 'Components appear compatible' : 'Compatibility issues found'}
            </p>
            <div className="stat-row">
              <span>Total power <strong>{report.totalPower ?? '—'} W</strong></span>
              <span>Recommended PSU <strong>{report.recommendedPsu ?? '—'} W</strong></span>
            </div>
            {report.issues?.length > 0 && <ul className="issue-list">{report.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
          </>}
          <p className="muted">{Object.keys(selected).length} part(s) selected</p>
        </aside>
      </div>
    </section>
  )
}
