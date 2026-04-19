"""Planning agent: one-shot decomposition of a project idea into ordered sprints.

Call ``run_planning_agent(idea)`` to get a list of sprint dicts ready for
``run_coding_agent(sprint["prompt"], ...)``.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import anthropic

from dev_sim.config import get_anthropic_api_key, load_env, resolve_coding_model

_DEFAULT_PROMPT_PATH = Path(__file__).resolve().parent.parent.parent / "llm" / "planning_prompt.md"


def _load_system_prompt(path: Path | None) -> str:
    candidates = [path] if path else [_DEFAULT_PROMPT_PATH, Path.cwd() / "llm" / "planning_prompt.md"]
    for p in candidates:
        if p and p.exists():
            return p.read_text(encoding="utf-8")
    raise FileNotFoundError(
        f"planning_prompt.md not found. Checked: {[str(c) for c in candidates]}"
    )


def _build_user_message(idea: str) -> str:
    return f"""{idea}

---

Respond with **two sections in this exact order**:

**Section 1 — JSON sprint list (output this first):**

```json
[
  {{
    "number": 1,
    "title": "Short sprint title",
    "prompt": "Full prompt for the coding agent — self-contained with all project context (stack, auth, endpoints, data models, acceptance criteria) so it can implement without reading other sprints."
  }}
]
```

**Section 2 — Human-readable plan:**
After the JSON block, write the full human-readable plan as described in your instructions.
"""


def _parse_sprints(text: str) -> list[dict[str, Any]]:
    # raw_decode follows JSON string escaping, so backticks inside prompt
    # strings (e.g. fenced code blocks in API contracts) don't confuse it.
    decoder = json.JSONDecoder()

    marker = "```json"
    idx = text.find(marker)
    if idx != -1:
        try:
            result, _ = decoder.raw_decode(text[idx + len(marker):].lstrip())
            return result
        except json.JSONDecodeError:
            pass

    # Fallback: find the first "[" and parse forward from there
    start = text.find("[")
    if start != -1:
        try:
            result, _ = decoder.raw_decode(text[start:])
            return result
        except json.JSONDecodeError:
            pass

    raise ValueError("No valid JSON sprint list found in planner response")


def planning_decompose(
    idea: str,
    *,
    model: str | None = None,
    planning_prompt_path: Path | None = None,
) -> tuple[list[dict[str, Any]], str]:
    """Return ``(sprints, raw_model_text)`` for UI + sprint board sync."""
    resolved_model = resolve_coding_model(model)
    system_prompt = _load_system_prompt(planning_prompt_path)

    client = anthropic.Anthropic(api_key=get_anthropic_api_key())
    response = client.messages.create(
        model=resolved_model,
        max_tokens=8192,
        system=system_prompt,
        messages=[{"role": "user", "content": _build_user_message(idea)}],
    )

    text = "".join(block.text for block in response.content if hasattr(block, "text"))
    print(text, file=sys.stderr)

    return _parse_sprints(text), text


def run_planning_agent(
    idea: str,
    *,
    model: str | None = None,
    planning_prompt_path: Path | None = None,
) -> list[dict[str, Any]]:
    """Decompose *idea* into an ordered list of sprint dicts.

    Each dict has ``number`` (int), ``title`` (str), and ``prompt`` (str).
    The planner makes a single one-shot call — no tool loop.
    """
    sprints, _ = planning_decompose(idea, model=model, planning_prompt_path=planning_prompt_path)
    return sprints


def main() -> None:
    load_env()
    parser = argparse.ArgumentParser(
        description="Decompose a project idea into ordered coding-agent sprints.",
    )
    parser.add_argument("idea", nargs="?", help="Free-form project description")
    parser.add_argument("-f", "--idea-file", type=Path, help="Read idea from file")
    parser.add_argument(
        "-m",
        "--model",
        default=None,
        help="Claude model id (default: ANTHROPIC_MODEL env var, then built-in)",
    )
    parser.add_argument(
        "--planning-prompt",
        type=Path,
        default=None,
        help="Path to planning system prompt (default: llm/planning_prompt.md)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Write sprint JSON to this file instead of stdout",
    )
    args = parser.parse_args()

    if args.idea_file:
        idea = args.idea_file.read_text(encoding="utf-8").strip()
    elif args.idea:
        idea = args.idea.strip()
    else:
        print("Provide an idea as an argument or use --idea-file.", file=sys.stderr)
        sys.exit(2)

    sprints, _ = planning_decompose(
        idea,
        model=args.model,
        planning_prompt_path=args.planning_prompt,
    )

    out = json.dumps(sprints, indent=2, ensure_ascii=False)
    if args.output:
        args.output.write_text(out, encoding="utf-8")
        print(f"Sprints written to {args.output}", file=sys.stderr)
    else:
        print(out)


if __name__ == "__main__":
    main()
