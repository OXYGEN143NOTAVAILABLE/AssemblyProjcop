import { Link } from 'react-router-dom'

const features = [
  ['Drag and drop assembly', 'Place a motherboard, CPU, RAM, GPU, storage, cooler and PSU into a 2D case, in any order you like.'],
  ['Guided steps', 'Each install shows what goes where and why, so the procedure sticks before you touch real hardware.'],
  ['Live compatibility checks', 'Sockets, memory type and power draw are checked as you build, with plain-language explanations.'],
  ['Build gallery', 'Publish your build, browse what others made, and save favourites to your profile.'],
]

const steps = [
  ['Pick your parts', 'Browse the component library and review each part’s specifications.'],
  ['Assemble the build', 'Drag parts into their slots, then connect the cables.'],
  ['Check and submit', 'Power on, run diagnostics, and submit your build for feedback.'],
]

function CaseSketch() {
  return (
    <svg className="sketch" viewBox="0 0 400 480" fill="none" aria-hidden="true">
      <rect x="20" y="20" width="360" height="440" rx="24" />
      <rect x="44" y="44" width="312" height="150" rx="10" />
      <rect x="44" y="214" width="150" height="90" rx="10" />
      <rect x="206" y="214" width="150" height="90" rx="10" />
      <rect x="44" y="322" width="150" height="50" rx="10" />
      <rect x="206" y="322" width="150" height="50" rx="10" />
      <rect x="44" y="390" width="312" height="50" rx="10" />
      <circle cx="281" cy="259" r="26" />
      <circle cx="281" cy="259" r="8" />
    </svg>
  )
}

export default function Home() {
  return (
    <>
      <section className="hero">
        <CaseSketch />
        <div className="hero-copy">
          <p className="hero-tag">Interactive 2D drag and drop PC building</p>
          <h1>
            Learn to build
            <br />
            your own PC<span className="dot">.</span>
          </h1>
          <p className="hero-sub">
            A hands-on simulator that teaches PC hardware and assembly, one component at a time.
          </p>
          <div className="hero-actions">
            <Link to="/simulator" className="pill pill-green">Start building</Link>
            <Link to="/gallery" className="pill pill-light">Explore gallery</Link>
          </div>
        </div>
        <p className="hero-corner">Made for BSIT students at Leyte Normal University</p>
      </section>

      <section className="section">
        <h2>Everything you need to practise assembly</h2>
        <ul className="feature-list">
          {features.map(([title, body]) => (
            <li key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2>How it works</h2>
        <ol className="steps">
          {steps.map(([title, body], i) => (
            <li key={title}>
              <span className="step-n">{i + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="section cta">
        <h2>Ready for your first build?</h2>
        <div className="hero-actions">
          <Link to="/simulator" className="pill pill-green">Open the simulator</Link>
        </div>
      </section>
    </>
  )
}
