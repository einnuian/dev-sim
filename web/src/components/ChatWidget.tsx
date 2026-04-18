import { useState } from 'react'

export function ChatWidget() {
  const [text, setText] = useState('')

  return (
    <div className="chat-widget">
      <div className="chat-widget__head">
        <span>CEO → Team chat</span>
        <button type="button" className="btn btn--tiny">
          Settings
        </button>
      </div>
      <p className="chat-widget__tip">
        Tip: ask the team to build any game. Try &quot;make me snake&quot; or &quot;build a flappy bird with
        neon colors&quot;.
      </p>
      <div className="chat-widget__row">
        <label className="visually-hidden" htmlFor="ceo-chat">
          Message to team
        </label>
        <textarea
          id="ceo-chat"
          rows={2}
          placeholder="Tell the team what to build… e.g. polish the calculator keypad"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="button" className="btn btn--send">
          Send &gt;
        </button>
      </div>
    </div>
  )
}
