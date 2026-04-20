import type { SkillLevels } from '../types'

export function SkillBars({ skills }: { skills: SkillLevels }) {
  const rows: { label: string; value: number; color: string }[] = [
    { label: 'Craft', value: skills.craft, color: 'var(--bar-pink)' },
    { label: 'Collab', value: skills.collaboration, color: 'var(--bar-yellow)' },
    { label: 'Ship', value: skills.delivery, color: 'var(--bar-blue)' },
  ]
  return (
    <div className="skill-bars" aria-label="Skill levels">
      {rows.map((r) => (
        <div key={r.label} className="skill-row">
          <div
            className="skill-fill"
            style={{ width: `${r.value}%`, background: r.color }}
          />
        </div>
      ))}
    </div>
  )
}
