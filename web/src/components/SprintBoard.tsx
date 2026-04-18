import type { SprintTask } from '../types'

const COLS: { key: SprintTask['column']; label: string }[] = [
  { key: 'todo', label: 'TODO' },
  { key: 'doing', label: 'DOING' },
  { key: 'review', label: 'REVIEW' },
  { key: 'done', label: 'DONE' },
]

export function SprintBoard({ tasks }: { tasks: SprintTask[] }) {
  return (
    <section className="panel sprint-board" aria-label="Sprint board">
      <div className="panel__title">Sprint board</div>
      <div className="sprint-board__cols">
        {COLS.map((c) => (
          <div key={c.key} className="sb-col">
            <div className="sb-col__head">{c.label}</div>
            <div className="sb-col__cards">
              {tasks
                .filter((t) => t.column === c.key)
                .map((t) => (
                  <article key={t.id} className="task-card">
                    <span
                      className="task-card__strip"
                      style={{ background: t.accent }}
                      aria-hidden
                    />
                    <div className="task-card__body">
                      <div className="task-card__id">{t.id}</div>
                      <div className="task-card__title">{t.title}</div>
                      <div className="task-card__who">{t.assignee_name}</div>
                    </div>
                  </article>
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
