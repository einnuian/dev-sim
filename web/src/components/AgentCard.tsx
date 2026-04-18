import type { Agent } from '../types'
import { PixelAvatar } from './PixelAvatar'
import { SkillBars } from './SkillBars'

export function AgentCard({
  agent,
  onSelect,
  selected,
}: {
  agent: Agent
  onSelect?: (id: string) => void
  selected?: boolean
}) {
  return (
    <button
      type="button"
      className={`agent-card ${selected ? 'agent-card--active' : ''}`}
      onClick={() => onSelect?.(agent.id)}
    >
      <PixelAvatar seed={agent.avatar_seed} title={agent.display_name} scale={3} />
      <div className="agent-card__body">
        <div className="agent-card__name">{agent.display_name}</div>
        <div className="agent-card__meta">
          {agent.role_label} · {agent.seniority}
        </div>
        <SkillBars skills={agent.skills} />
      </div>
    </button>
  )
}
