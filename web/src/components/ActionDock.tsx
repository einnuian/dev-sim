import type { OfficeBuff } from '../types'

export function ActionDock({ buffs }: { buffs: OfficeBuff[] }) {
  return (
    <div className="action-dock" role="toolbar" aria-label="Office upgrades">
      {buffs.map((b) => (
        <button key={b.id} type="button" className="action-card">
          <span className="action-card__plus" aria-hidden>
            [+]
          </span>
          <span className="action-card__title">{b.title}</span>
          <span className="action-card__desc">{b.description}</span>
          <span className="action-card__cost">
            {b.cost.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
          </span>
        </button>
      ))}
    </div>
  )
}
