import { useEffect, useRef } from 'react'
import type { Agent, BackendLogEvent } from '../types'
import { PixelAvatar } from './PixelAvatar'

type Props = {
  title?: string
  events: BackendLogEvent[]
  team: Agent[]
}

/**
 * Group-chat layout + terminal aesthetics for streamed backend logs (stub data for now).
 */
export function GroupChatTerminal({
  title = 'Engineering channel',
  events,
  team,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  return (
    <section className="gct panel" aria-label="Backend event log">
      <header className="gct__toolbar">
        <button type="button" className="gct__icon-btn" aria-label="Back" disabled title="Stub">
          ←
        </button>
        <div className="gct__toolbar-center">
          <div className="gct__channel-title">{title}</div>
          <div className="gct__avatar-row" role="list">
            {team.slice(0, 6).map((a) => (
              <span key={a.id} className="gct__avatar-chip" role="listitem" title={a.display_name}>
                <PixelAvatar seed={a.avatar_seed} scale={2} title={a.display_name} />
              </span>
            ))}
          </div>
        </div>
        <button type="button" className="gct__icon-btn" aria-label="Channel details" disabled title="Stub">
          ⧉
        </button>
      </header>

      <div className="gct__stream">
        {events.length === 0 ? (
          <p className="gct__empty muted">Waiting for orchestration events…</p>
        ) : (
          events.map((ev) => <LogBlock key={ev.id} ev={ev} />)
        )}
        <div ref={bottomRef} />
      </div>

      <div className="gct__typing" aria-live="polite">
        <span className="gct__typing-dot" />
        Simulator idle — backend will stream here
      </div>

      <div className="gct__compose">
        <label className="visually-hidden" htmlFor="gct-input">
          Filter or command
        </label>
        <input
          id="gct-input"
          type="text"
          className="gct__input"
          placeholder="Filter or command… (stub)"
          disabled
          readOnly
          autoComplete="off"
        />
        <button type="button" className="gct__send" disabled aria-label="Send" title="Stub">
          ➤
        </button>
      </div>
    </section>
  )
}

function LogBlock({ ev }: { ev: BackendLogEvent }) {
  if (ev.side === 'system') {
    return (
      <div className="gct-sys">
        <span className="gct-sys__time">{ev.time}</span>
        <span className="gct-sys__tag">[orchestrator]</span>
        <span className="gct-sys__body">{ev.body}</span>
        {ev.code ? <pre className="gct-sys__code">{ev.code}</pre> : null}
      </div>
    )
  }

  const incoming = ev.side === 'in'

  return (
    <div className={`gct-row ${incoming ? 'gct-row--in' : 'gct-row--out'}`}>
      <div className={`gct-bubble ${incoming ? 'gct-bubble--in' : 'gct-bubble--out'}`}>
        <p className="gct-bubble__text">{ev.body}</p>
        {ev.code ? <pre className="gct-bubble__code">{ev.code}</pre> : null}
      </div>
      <div className="gct-meta">
        <span className="gct-meta__who">{ev.author}</span>
        <span className="gct-meta__time">{ev.time}</span>
      </div>
    </div>
  )
}
