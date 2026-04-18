import type { FeedItem } from '../types'

export function LiveFeed({ items }: { items: FeedItem[] }) {
  return (
    <section className="panel live-feed" aria-label="Live activity feed">
      <div className="panel__title">Live feed</div>
      <div className="live-feed__scroll">
        {items.length === 0 ? (
          <p className="muted">Waiting for stand-up and PR events…</p>
        ) : (
          items.map((i) => (
            <div key={i.id} className="feed-line">
              <span className="feed-time">{i.at}</span>
              <span>{i.text}</span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
