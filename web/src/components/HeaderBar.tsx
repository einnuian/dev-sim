import type { CompanyMetrics, SprintInfo } from '../types'

const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function HeaderBar({
  metrics,
  sprint,
  paused,
  speed,
  onPause,
  onSpeed,
  onEndSprint,
}: {
  metrics: CompanyMetrics
  sprint: SprintInfo
  paused: boolean
  speed: number
  onPause: () => void
  onSpeed: () => void
  onEndSprint: () => void
}) {
  const pills: { label: string; value: string }[] = [
    { label: 'Cash', value: fmtMoney(metrics.cash) },
    { label: 'Runway', value: `${metrics.runway_weeks} wk` },
    { label: 'Burn', value: fmtMoney(metrics.burn_per_week) + '/wk' },
    { label: 'MRR', value: fmtMoney(metrics.mrr) },
    { label: 'Tech debt', value: String(metrics.tech_debt) },
    { label: 'Reputation', value: String(metrics.reputation) },
    { label: 'Leadership', value: metrics.leadership },
  ]

  return (
    <header className="header-bar">
      <div className="header-bar__brand">
        <span className="logo-glow" aria-hidden>
          [ ]
        </span>
        <div>
          <div className="header-bar__title">DevTeam Sim Inc.</div>
          <div className="header-bar__sub">
            {sprint.label} · Day {sprint.day}
          </div>
        </div>
      </div>

      <div className="header-bar__metrics" role="list">
        {pills.map((p) => (
          <div key={p.label} className="metric-pill" role="listitem">
            <span className="metric-pill__label">{p.label}</span>
            <span className="metric-pill__value">{p.value}</span>
          </div>
        ))}
      </div>

      <div className="header-bar__controls">
        <button type="button" className="btn btn--ghost" onClick={onPause}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onSpeed}>
          &gt;&gt; {speed}x
        </button>
        <button type="button" className="btn btn--primary" onClick={onEndSprint}>
          End Sprint
        </button>
      </div>
    </header>
  )
}
