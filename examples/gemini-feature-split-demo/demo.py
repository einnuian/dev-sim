#!/usr/bin/env python3
"""Basic demo: project idea -> K2 Think API split -> SRS + feature markdown docs."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DEFAULT_SPLITTER = ROOT.parent.parent / "llm" / "task_splitter.md"
OUT_DIR = ROOT / "docs"
DEFAULT_MODEL = "MBZUAI-IFM/K2-Think-v2"
DEFAULT_USER_AGENT = "curl/8.5.0"
DOTENV_CANDIDATES = [ROOT / ".env", ROOT.parent.parent / ".env"]


@dataclass
class FeaturePlan:
    sprint: int
    name: str
    user_outcome: str
    frontend: list[str]
    backend: list[str]
    contract: list[str]
    risks: list[str]
    definition_of_done: list[str]
    support: list[str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate SRS + feature docs from a project idea via K2 Think API."
    )
    parser.add_argument(
        "--idea",
        help="Project idea text. If omitted, you'll be prompted interactively.",
    )
    parser.add_argument(
        "--splitter-prompt",
        default=str(DEFAULT_SPLITTER),
        help="Path to task splitter seed prompt markdown.",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"K2 Think model id (default: {DEFAULT_MODEL}).",
    )
    parser.add_argument(
        "--api-key",
        help="K2 Think API key. If omitted, reads K2THINK_API_KEY from environment.",
    )
    parser.add_argument(
        "--user-agent",
        default=DEFAULT_USER_AGENT,
        help=f"HTTP User-Agent header (default: {DEFAULT_USER_AGENT}).",
    )
    return parser.parse_args()


def get_idea(raw: str | None) -> str:
    if raw:
        return raw.strip()
    print("Enter project idea (single line or paragraph), then press Enter:")
    idea = input("> ").strip()
    if not idea:
        raise SystemExit("Project idea is required.")
    return idea


def get_api_key(cli_value: str | None) -> str:
    key = cli_value or os.getenv("K2THINK_API_KEY", "")
    if not key:
        raise RuntimeError(
            "K2 Think API key is required. Set K2THINK_API_KEY or pass --api-key."
        )
    return key


def load_dotenv_files() -> None:
    """Load KEY=VALUE pairs from local/repo .env files if present."""
    for env_path in DOTENV_CANDIDATES:
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)


def slugify(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return value.strip("-") or "feature"


def build_llm_prompt(splitter_text: str, project_idea: str) -> str:
    schema = {
        "summary": "string",
        "dependencies": ["string"],
        "assumptions": ["string"],
        "features": [
            {
                "sprint": "number (1-indexed)",
                "name": "string",
                "user_outcome": "string",
                "frontend": ["string"],
                "backend": ["string"],
                "contract": ["string"],
                "risks": ["string"],
                "definition_of_done": ["string"],
                "support": ["string, optional"],
            }
        ],
    }
    return (
        f"{splitter_text}\n\n"
        "Now apply the prompt to this project idea:\n"
        f"{project_idea}\n\n"
        "Return ONLY valid JSON (no markdown fences, no prose outside JSON).\n"
        "Use this exact top-level shape:\n"
        f"{json.dumps(schema, indent=2)}\n"
    )


def call_k2_api(prompt: str, model: str, api_key: str, user_agent: str) -> str:
    url = "https://api.k2think.ai/v1/chat/completions"
    payload = {
        "model": model,
        "max_tokens": 4096,
        "temperature": 0.4,
        "messages": [
            {"role": "system", "content": "You are a product planning assistant. Output valid JSON only."},
            {"role": "user", "content": prompt},
        ],
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "accept": "application/json",
            "User-Agent": user_agent,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(format_http_error(exc.code, detail, model)) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(
            "K2 Think API connection failed.\n"
            f"- Details: {exc}\n"
            "- Check internet access and proxy settings."
        ) from exc

    data = json.loads(raw)
    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError(f"K2 Think API returned no choices: {raw}")
    text_out = str(choices[0].get("message", {}).get("content", "")).strip()
    if not text_out:
        raise RuntimeError(f"K2 Think API returned empty text: {raw}")
    return text_out


def extract_json_error(detail: str) -> tuple[str, str]:
    try:
        parsed = json.loads(detail)
    except json.JSONDecodeError:
        return detail.strip() or "Unknown API error.", ""
    err = parsed.get("error", {})
    if isinstance(err, str):
        return err.strip() or "Unknown API error.", ""
    if not isinstance(err, dict):
        # Some APIs return different top-level shapes; keep payload visible.
        return detail.strip() or "Unknown API error.", ""

    message = str(err.get("message", "")).strip()
    if not message:
        message = str(parsed.get("message", "")).strip()
    if not message:
        message = detail.strip() or "Unknown API error."
    err_type = str(err.get("type", parsed.get("type", ""))).strip()
    return message, err_type


def extract_retry_seconds(message: str) -> str:
    match = re.search(r"retry in ([0-9]+(?:\.[0-9]+)?)s", message, flags=re.IGNORECASE)
    if not match:
        return ""
    return match.group(1)


def format_http_error(code: int, detail: str, model: str) -> str:
    message, err_type = extract_json_error(detail)
    retry_seconds = extract_retry_seconds(message)

    if code == 429:
        lines = [
            "K2 Think API quota/rate-limit reached (HTTP 429).",
            f"- Model: {model}",
            f"- Error type: {err_type or 'rate_limit_error'}",
            "- What to do:",
            "  1) Check K2 Think usage/limits in your account",
            "  2) Verify billing/project status for this API key",
            "  3) Reduce request frequency or token load",
        ]
        if retry_seconds:
            lines.append(f"  4) Retry after about {retry_seconds} seconds")
        lines.append(f"- API message: {message}")
        return "\n".join(lines)

    if code in (401, 403):
        return "\n".join(
            [
                f"K2 Think API authentication/permission error (HTTP {code}).",
                "- Verify K2THINK_API_KEY or --api-key is valid.",
                "- Ensure the key has access to the selected model.",
                f"- API message: {message}",
            ]
        )

    return "\n".join(
        [
            f"K2 Think API request failed (HTTP {code}).",
            f"- Error type: {err_type or 'unknown'}",
            f"- Message: {message}",
        ]
    )


def parse_response(raw: str) -> dict[str, Any]:
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in model output.")
    candidate = raw[start : end + 1]
    return json.loads(candidate)


def to_feature_plan(item: dict[str, Any]) -> FeaturePlan:
    return FeaturePlan(
        sprint=int(item["sprint"]),
        name=str(item["name"]),
        user_outcome=str(item["user_outcome"]),
        frontend=[str(x) for x in item.get("frontend", [])],
        backend=[str(x) for x in item.get("backend", [])],
        contract=[str(x) for x in item.get("contract", [])],
        risks=[str(x) for x in item.get("risks", [])],
        definition_of_done=[str(x) for x in item.get("definition_of_done", [])],
        support=[str(x) for x in item.get("support", [])],
    )


def bullets(items: list[str]) -> str:
    if not items:
        return "- (none)"
    return "\n".join(f"- {i}" for i in items)


def write_docs(plan: dict[str, Any], idea: str) -> None:
    srs_dir = OUT_DIR / "srs"
    feature_dir = OUT_DIR / "features"
    srs_dir.mkdir(parents=True, exist_ok=True)
    feature_dir.mkdir(parents=True, exist_ok=True)

    features = sorted(
        [to_feature_plan(f) for f in plan["features"]], key=lambda f: f.sprint
    )
    total = len(features)
    assumptions = [str(x) for x in plan.get("assumptions", [])]
    dependencies = [str(x) for x in plan.get("dependencies", [])]

    overview = [
        "# Software Requirements Summary (SRS)",
        "",
        "## Project Idea",
        idea,
        "",
        "## Plan Summary",
        str(plan.get("summary", "")),
        "",
        "## Timeline",
        f"- Total sprints: **{total}**",
        "- Sprint-to-feature ratio: **1:1**",
        "",
        "## Assumptions",
        bullets(assumptions),
        "",
        "## Dependencies",
        bullets(dependencies),
        "",
        "## Features",
    ]
    for feature in features:
        slug = slugify(feature.name)
        overview.append(
            f"- Sprint {feature.sprint}: "
            f"[{feature.name}](../features/{feature.sprint:02d}-{slug}.md)"
        )
    (srs_dir / "overview.md").write_text("\n".join(overview) + "\n", encoding="utf-8")

    for feature in features:
        slug = slugify(feature.name)
        path = feature_dir / f"{feature.sprint:02d}-{slug}.md"
        body = f"""# Sprint {feature.sprint} — {feature.name}

## User Outcome
{feature.user_outcome}

## Frontend
{bullets(feature.frontend)}

## Backend
{bullets(feature.backend)}

## Contract
{bullets(feature.contract)}

## Risks / Unknowns
{bullets(feature.risks)}

## Definition of Done
{bullets(feature.definition_of_done)}

## Supporting Work
{bullets(feature.support)}
"""
        path.write_text(body, encoding="utf-8")


def main() -> int:
    args = parse_args()
    load_dotenv_files()
    idea = get_idea(args.idea)
    api_key = get_api_key(args.api_key)
    splitter_text = Path(args.splitter_prompt).read_text(encoding="utf-8")

    prompt = build_llm_prompt(splitter_text, idea)
    raw = call_k2_api(prompt, args.model, api_key, args.user_agent)
    plan = parse_response(raw)

    if "features" not in plan or not isinstance(plan["features"], list):
        raise ValueError("Model output missing 'features' list.")

    write_docs(plan, idea)
    print("Generated docs:")
    print(f"- {OUT_DIR / 'srs' / 'overview.md'}")
    print(f"- {OUT_DIR / 'features'}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
