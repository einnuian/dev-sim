import type { Agent, HRScoreRow } from '../types'
import { PixelAvatar } from './PixelAvatar'

type Props = {
  open: boolean
  sprintNumber: number
  agents: Agent[]
  rows: HRScoreRow[]
  summary: string
  onContinue: () => void
  onClose: () => void
}

export function HRReviewModal({
  open,
  sprintNumber,
  agents,
  rows,
  summary,
  onContinue,
  onClose,
}: Props) {
  if (!open) return null

  const byId = Object.fromEntries(agents.map((a) => [a.id, a]))

  return (
    <div className="modal-overlay modal-overlay--blur" role="dialog" aria-modal="true" aria-labelledby="hr-title">
      <div className="modal modal--hr">
        <div className="modal__top">
          <h2 id="hr-title">HR review · Sprint {sprintNumber}</h2>
          <button type="button" className="btn btn--icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="modal__lede">
          End of sprint {sprintNumber}. The numbers below feed into HR decisions. Star performers shine. Flagged
          underperformers are eligible to be fired.
        </p>

        <div className="hr-grid">
          {rows.map((r) => {
            const a = byId[r.agent_id]
            if (!a) return null
            const rolePretty =
              a.role === 'scrum_master'
                ? 'Scrum Master'
                : a.role === 'tech_lead'
                  ? 'Tech Lead'
                  : a.role === 'solutions_architect'
                    ? 'Sol. Architect'
                    : a.role === 'frontend'
                      ? 'Frontend Dev'
                      : 'Backend Dev'
            return (
              <article key={r.agent_id} className="hr-card">
                <PixelAvatar seed={a.avatar_seed} title={a.display_name} scale={4} />
                <div className="hr-card__who">
                  {a.display_name}, {rolePretty}
                </div>
                <div className="hr-card__score">{r.score}</div>
                <div className="hr-card__detail">{r.detail}</div>
              </article>
            )
          })}
        </div>

        <p className="hr-summary">{summary}</p>

        <div className="modal__footer">
          <button type="button" className="btn btn--primary btn--glow" onClick={onContinue}>
            Continue &gt;
          </button>
        </div>
      </div>
    </div>
  )
}
