import { useCallback, useState } from 'react'
// import { ActionDock } from './components/ActionDock'
import { AgentCard } from './components/AgentCard'
// import { ChatWidget } from './components/ChatWidget'
import { HeaderBar } from './components/HeaderBar'
// import { HRReviewModal } from './components/HRReviewModal'
import { GroupChatTerminal } from './components/GroupChatTerminal'
import { OfficeFloor } from './components/OfficeFloor'
import { SprintBoard } from './components/SprintBoard'
import { WelcomeModal } from './components/WelcomeModal'
import {
  MOCK_AGENTS,
  MOCK_BACKEND_LOG,
  MOCK_METRICS,
  MOCK_SPRINT,
  MOCK_TASKS,
} from './data/mock'

export default function App() {
  const [welcomeOpen, setWelcomeOpen] = useState(true)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(MOCK_AGENTS[0]?.id ?? null)

  /** Stub until HR review flow is re-enabled. */
  const endSprint = useCallback(() => {}, [])
  const cycleSpeed = useCallback(() => setSpeed((s) => (s >= 4 ? 1 : s * 2)), [])

  return (
    <div className="app-shell">
      <WelcomeModal open={welcomeOpen} onStart={() => setWelcomeOpen(false)} />
      {/* <HRReviewModal
        open={hrOpen}
        sprintNumber={MOCK_SPRINT.number}
        agents={MOCK_AGENTS}
        rows={MOCK_HR_ROWS}
        summary={HR_FOOTER_SUMMARY}
        onContinue={closeHr}
        onClose={closeHr}
      /> */}

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
          <GroupChatTerminal events={MOCK_BACKEND_LOG} team={MOCK_AGENTS} />
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
        </aside>

        <main className="col col--center">
          <OfficeFloor agents={MOCK_AGENTS} />
        </main>

        <aside className="col col--right">
          <SprintBoard tasks={MOCK_TASKS} />
        </aside>
      </div>

      <footer className="app-footer">
        {/* <ChatWidget /> */}
        {/* <ActionDock buffs={MOCK_BUFFS} /> */}
      </footer>
    </div>
  )
}
