"""Periodic persona-styled progress announcements and file logging for agents."""

from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Any

# Rotating lines per communication_style (DevTeam Simulator trait vocabulary).
_ANNOUNCEMENT_BANKS: dict[str, list[str]] = {
    "terse": [
        "Still on it.",
        "Working.",
        "In progress—back soon.",
        "Not stuck; just grinding.",
        "One more pass on this.",
    ],
    "verbose": [
        "Quick update: still pushing on the current step—thanks for your patience while I work through the details.",
        "I'm still actively on this task; no blockers from my side, just making sure the next change is solid.",
        "Still here—going carefully so we don't leave loose ends in the repo or the PR.",
        "Progress continues; I'm being deliberate about validation before the next commit or tool call.",
    ],
    "diplomatic": [
        "Still moving forward—appreciate the wait; I'm keeping quality and team norms in mind.",
        "Making steady progress; I'll surface anything risky before we ship.",
        "Continuing work on this; aiming for a clean handoff when the step is done.",
    ],
    "blunt": [
        "Still working. Not done yet.",
        "This is taking a bit—model/tools are slow, not excuses.",
        "Still in the middle of it. No fluff.",
    ],
    "socratic": [
        "Still working—asking myself if the next change actually answers the user's intent.",
        "In progress: sanity-checking assumptions before the next edit.",
        "Still on task—what would break if we rushed this? Taking the careful path.",
    ],
    "encouraging": [
        "Still going—we've got this; next milestone is in sight.",
        "Making progress—small steady steps add up.",
        "Still on it—thanks for hanging in; almost through this chunk.",
    ],
    "default": [
        "Still working on the task.",
        "Progress continues.",
        "In progress—will update when this step finishes.",
    ],
}

_PHASE_HINTS: dict[str, str] = {
    "starting": "just getting rolling",
    "awaiting_model": "waiting on the model",
    "running_tools": "running tools locally",
    "fetching_pr": "pulling PR context",
    "reviewing": "review is in flight",
    "wrapping_up": "wrapping up",
}


def _persona_style(persona: dict[str, Any] | None) -> str:
    if not persona:
        return "default"
    s = persona.get("communication_style")
    if isinstance(s, str) and s in _ANNOUNCEMENT_BANKS:
        return s
    return "default"


def _display_name(persona: dict[str, Any] | None) -> str:
    if not persona:
        return "Agent"
    return str(persona.get("display_name") or "Agent")


def format_progress_announcement(
    persona: dict[str, Any] | None,
    *,
    agent_label: str,
    tick: int,
    phase: str,
) -> str:
    """One in-character progress line (no LLM)."""
    name = _display_name(persona)
    style = _persona_style(persona)
    bank = _ANNOUNCEMENT_BANKS.get(style, _ANNOUNCEMENT_BANKS["default"])
    line = bank[tick % len(bank)]
    phase_note = _PHASE_HINTS.get(phase, phase)
    role = ""
    if persona and persona.get("role"):
        role = f" ({persona['role']})"
    return f"[{name}{role} | {agent_label}] {line} ({phase_note})."


class AgentProgressLogger:
    """
    Logs persona snapshots and periodic announcements to a file (and stderr at INFO).

    Create one instance per agent session; thread-safe for ``announce`` / ``log_persona_start``.
    """

    def __init__(
        self,
        log_path: Path,
        *,
        agent_label: str = "agent",
        mirror_stderr: bool = True,
    ) -> None:
        self.log_path = log_path
        self.agent_label = agent_label
        self._lock = threading.Lock()
        log_path.parent.mkdir(parents=True, exist_ok=True)
        self._logger = logging.getLogger(f"dev_sim.agent.{id(self)}")
        self._logger.setLevel(logging.INFO)
        self._logger.handlers.clear()
        fh = logging.FileHandler(log_path, encoding="utf-8")
        fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        self._logger.addHandler(fh)
        if mirror_stderr:
            sh = logging.StreamHandler()
            sh.setFormatter(logging.Formatter("%(asctime)s [progress] %(message)s", datefmt="%H:%M:%S"))
            sh.setLevel(logging.INFO)
            self._logger.addHandler(sh)

    def log_persona_start(self, persona: dict[str, Any] | None) -> None:
        """Log full persona JSON at session start (or note that none was configured)."""
        with self._lock:
            if persona:
                body = json.dumps(persona, indent=2, ensure_ascii=False)
                self._logger.info(
                    "Agent session start label=%s persona=%s display_name=%s role=%s\n%s",
                    self.agent_label,
                    persona.get("id", ""),
                    persona.get("display_name", ""),
                    persona.get("role", ""),
                    body,
                )
            else:
                self._logger.info(
                    "Agent session start label=%s (no persona dict; announcements use default tone)",
                    self.agent_label,
                )

    def announce(self, message: str) -> None:
        with self._lock:
            self._logger.info("%s", message)


class ProgressAnnouncer:
    """
    Emits ``format_progress_announcement`` every ``interval_sec`` on a daemon thread until stopped.

    Update ``phase`` from the main thread for slightly richer parentheticals.
    """

    def __init__(
        self,
        logger: AgentProgressLogger,
        persona: dict[str, Any] | None,
        *,
        agent_label: str,
        interval_sec: float = 10.0,
    ) -> None:
        self._plog = logger
        self._persona = persona
        self._agent_label = agent_label
        self._interval = interval_sec
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._tick = 0
        self._phase_lock = threading.Lock()
        self._phase = "starting"

    def set_phase(self, phase: str) -> None:
        with self._phase_lock:
            self._phase = phase

    def _loop(self) -> None:
        while not self._stop.wait(timeout=self._interval):
            with self._phase_lock:
                phase = self._phase
            msg = format_progress_announcement(
                self._persona,
                agent_label=self._agent_label,
                tick=self._tick,
                phase=phase,
            )
            self._tick += 1
            self._plog.announce(msg)

    def __enter__(self) -> ProgressAnnouncer:
        self._thread = threading.Thread(target=self._loop, name="dev-sim-progress", daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *args: object) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)


__all__ = [
    "AgentProgressLogger",
    "ProgressAnnouncer",
    "format_progress_announcement",
]
