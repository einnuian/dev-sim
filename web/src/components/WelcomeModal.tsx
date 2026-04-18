type Props = { open: boolean; onStart: () => void }

const FEATURES = [
  {
    title: 'Live agents',
    body: 'Skills, mood, focus, loyalty, and opinions that react to the sprint.',
  },
  {
    title: 'Chat to build',
    body: 'Use the CEO → team chat to steer scope and vibe.',
  },
  {
    title: 'Real sprints',
    body: 'Stand-ups, PR reviews, retros, and shipping loops — not a slideshow.',
  },
  {
    title: 'Money loop',
    body: 'Salaries, MRR, contracts, and runway pressure.',
  },
  {
    title: 'HR pressure',
    body: 'Scoreboards, layoffs, and replacements with contrasting styles.',
  },
  {
    title: 'BYO LLM',
    body: 'Plug in OpenAI, Groq, or OpenRouter when the backend is wired.',
  },
] as const

export function WelcomeModal({ open, onStart }: Props) {
  if (!open) return null

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="modal modal--welcome">
        <h1 id="welcome-title" className="modal__hero-title">
          DevTeam Simulator
        </h1>
        <p className="modal__hero-sub">CEO mode · Entertainment + media track</p>
        <p className="modal__intro">
          You run a tiny software studio. Your AI engineers have personalities, preferences, and opinions —
          ship products, manage money, and survive the sprint review.
        </p>

        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature-card">
              <div className="feature-card__head">{f.title}</div>
              <p>{f.body}</p>
            </div>
          ))}
        </div>

        <div className="modal__footer">
          <button type="button" className="btn btn--primary btn--glow" onClick={onStart}>
            Start day 1 &gt;
          </button>
        </div>
      </div>
    </div>
  )
}
