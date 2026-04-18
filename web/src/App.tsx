import { useCallback, useState } from 'react'
import { ActionDock } from './components/ActionDock'
import { AgentCard } from './components/AgentCard'
import { ChatWidget } from './components/ChatWidget'
import { HeaderBar } from './components/HeaderBar'
import { HRReviewModal } from './components/HRReviewModal'
import { LiveFeed } from './components/LiveFeed'
import { OfficeFloor } from './components/OfficeFloor'
import { SprintBoard } from './components/SprintBoard'
import { WelcomeModal } from './components/WelcomeModal'
import {
  HR_FOOTER_SUMMARY,
  MOCK_AGENTS,
  MOCK_BUFFS,
  MOCK_FEED,
  MOCK_HR_ROWS,
  MOCK_METRICS,
  MOCK_SPRINT,
  MOCK_TASKS,
} from './data/mock'

export default function App() {
  const [welcomeOpen, setWelcomeOpen] = useState(true)
  const [hrOpen, setHrOpen] = useState(false)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(MOCK_AGENTS[0]?.id ?? null)

  const endSprint = useCallback(() => setHrOpen(true), [])
  const closeHr = useCallback(() => setHrOpen(false), [])
  const cycleSpeed = useCallback(() => setSpeed((s) => (s >= 4 ? 1 : s * 2)), [])

  return (
    <div className="app-shell">
      <WelcomeModal open={welcomeOpen} onStart={() => setWelcomeOpen(false)} />
      <HRReviewModal
        open={hrOpen}
        sprintNumber={MOCK_SPRINT.number}
        agents={MOCK_AGENTS}
        rows={MOCK_HR_ROWS}
        summary={HR_FOOTER_SUMMARY}
        onContinue={closeHr}
        onClose={closeHr}
      />

      <HeaderBar
        metrics={MOCK_METRICS}
        sprint={MOCK_SPRINT}
        paused={paused}
        speed={speed}
        onPause={() => setPaused((p) => !p)}
        onSpeed={cycleSpeed}
        onEndSprint={endSprint}
      />

      <div className="app-main">
        <aside className="col col--left">
          <section className="panel roster-panel">
            <div className="panel__title">Team roster</div>
            <div className="roster-list">
              {MOCK_AGENTS.map((a) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  selected={selectedAgent === a.id}
                  onSelect={setSelectedAgent}
                />
              ))}
            </div>
          </section>
          <LiveFeed items={MOCK_FEED} />
        </aside>

        <main className="col col--center">
          <OfficeFloor agents={MOCK_AGENTS} />
        </main>

        <aside className="col col--right">
          <SprintBoard tasks={MOCK_TASKS} />
        </aside>
      </div>

      <footer className="app-footer">
        <ChatWidget />
        <ActionDock buffs={MOCK_BUFFS} />
      </footer>
    </div>
  )
}
