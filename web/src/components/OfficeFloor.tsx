import type { Agent } from '../types'
import { PixelAvatar } from './PixelAvatar'

export function OfficeFloor({ agents }: { agents: Agent[] }) {
  return (
    <section className="office-floor" aria-label="Office view">
      <div className="office-floor__label">Floor 7 — Engineering</div>
      <div className="office-floor__scene">
        <div className="office-windows" aria-hidden />
        <div className="office-grid">
          {agents.map((a) => (
            <div key={a.id} className="desk-unit">
              <PixelAvatar seed={a.avatar_seed} variant="seated" title={a.display_name} scale={3} />
              <div className="desk-unit__name">{a.display_name.split(' ')[0]}</div>
            </div>
          ))}
        </div>
        <div className="office-props" aria-hidden>
          <span className="prop prop--rack" />
          <span className="prop prop--plant" />
        </div>
      </div>
    </section>
  )
}
