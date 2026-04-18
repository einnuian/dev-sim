"""Contract for a **reviewing agent** output, designed so the **coding agent** can apply it.

A reviewer (human or model) fills this structure after inspecting diffs, files, or commits
produced by the coding agent. The coding agent can then:

* Order work by ``verdict`` and issue ``severity``.
* Map each issue to ``write_workspace_file`` / ``run_git`` using ``location`` and
  ``suggested_fix``.
* Apply ``suggested_edits`` (path + instruction) for broader changes.
* Use ``follow_up_tasks`` as a short, ordered checklist.

``schema_version`` must be bumped if you change field names or required keys.

This module is stdlib-only and can live outside the packaged ``dev_sim`` wheel until you
include ``shared/`` in your build or move it under ``src/``.
"""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field
from typing import Any, Literal, TypedDict, cast

# ---------------------------------------------------------------------------
# Typed contract
# ---------------------------------------------------------------------------

Severity = Literal["blocker", "major", "minor", "nit", "suggestion"]
Verdict = Literal["approve", "request_changes", "comment_only"]


class ReviewLocation(TypedDict, total=False):
    """Where a finding applies (paths relative to the repo / workspace clone root)."""

    path: str
    start_line: int
    end_line: int
    label: str  # e.g. component or symbol name


class ReviewIssue(TypedDict, total=False):
    """One finding. ``suggested_fix`` should be imperative and concrete for another agent."""

    severity: Severity
    title: str
    detail: str
    location: ReviewLocation
    suggested_fix: str


class SuggestedEdit(TypedDict, total=False):
    """
    File-scoped instruction. Prefer short ``instruction`` text over pasting full files;
    the coding agent can re-read the path and apply a minimal edit.
    """

    path: str
    instruction: str
    snippet: str  # optional small literal to insert or replace


class CodeReviewResult(TypedDict, total=False):
    """
    Root object from the reviewing agent. JSON-serializable.

    If ``verdict`` is ``request_changes``, the coding agent should process ``issues`` in
    severity order (blocker → major → …), then ``suggested_edits``, then ``follow_up_tasks``.
    """

    schema_version: str
    summary: str
    verdict: Verdict
    issues: list[ReviewIssue]
    suggested_edits: list[SuggestedEdit]
    follow_up_tasks: list[str]
    review_context: str  # e.g. branch, PR, commit — opaque to the contract


# ---------------------------------------------------------------------------
# JSON Schema (tools, response_format, or validation)
# ---------------------------------------------------------------------------

VERDICT_ENUM = ["approve", "request_changes", "comment_only"]
SEVERITY_ENUM = ["blocker", "major", "minor", "nit", "suggestion"]

REVIEW_RESULT_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "description": "Structured code review for follow-up by the coding agent",
    "properties": {
        "schema_version": {"type": "string", "const": "1.0.0"},
        "summary": {"type": "string"},
        "verdict": {"type": "string", "enum": VERDICT_ENUM},
        "issues": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["severity", "title", "detail", "suggested_fix"],
                "properties": {
                    "severity": {"type": "string", "enum": SEVERITY_ENUM},
                    "title": {"type": "string"},
                    "detail": {"type": "string"},
                    "suggested_fix": {
                        "type": "string",
                        "description": "Imperative steps the coding agent should take",
                    },
                    "location": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "path": {"type": "string"},
                            "start_line": {"type": "integer"},
                            "end_line": {"type": "integer"},
                            "label": {"type": "string"},
                        },
                    },
                },
            },
        },
        "suggested_edits": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["path", "instruction"],
                "properties": {
                    "path": {"type": "string"},
                    "instruction": {"type": "string"},
                    "snippet": {"type": "string"},
                },
            },
        },
        "follow_up_tasks": {"type": "array", "items": {"type": "string"}},
        "review_context": {"type": "string"},
    },
    "required": [
        "schema_version",
        "summary",
        "verdict",
        "issues",
        "suggested_edits",
        "follow_up_tasks",
    ],
}


# ---------------------------------------------------------------------------
# Optional dataclass builder (tests, fixtures, in-process use)
# ---------------------------------------------------------------------------


@dataclass
class ReviewIssueD:
    severity: Severity
    title: str
    detail: str
    location: dict[str, Any] | None = None
    suggested_fix: str = ""


@dataclass
class CodeReviewResultD:
    """Build a :class:`CodeReviewResult` in code, then call :meth:`to_typed` / :meth:`to_json`."""

    schema_version: str = "1.0.0"
    summary: str = ""
    verdict: Verdict = "comment_only"
    issues: list[ReviewIssueD] = field(default_factory=list)
    suggested_edits: list[dict[str, str]] = field(default_factory=list)
    follow_up_tasks: list[str] = field(default_factory=list)
    review_context: str = ""

    def to_typed(self) -> CodeReviewResult:
        out: CodeReviewResult = {
            "schema_version": self.schema_version,
            "summary": self.summary,
            "verdict": self.verdict,
            "issues": [],
            "suggested_edits": [
                cast(SuggestedEdit, copy.deepcopy(s)) for s in self.suggested_edits
            ],
            "follow_up_tasks": list(self.follow_up_tasks),
        }
        if self.review_context:
            out["review_context"] = self.review_context
        for it in self.issues:
            issue: ReviewIssue = {
                "severity": it.severity,
                "title": it.title,
                "detail": it.detail,
                "suggested_fix": it.suggested_fix,
            }
            if it.location is not None:
                issue["location"] = cast(ReviewLocation, it.location)
            out["issues"].append(issue)  # type: ignore[typeddict-item]
        return out

    def to_json(self) -> str:
        return format_review_json(self.to_typed())


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------


def to_plain_dict(result: CodeReviewResult) -> dict[str, Any]:
    """Return a plain ``dict`` suitable for ``json.dumps`` (shallow+JSON types only)."""
    return cast(dict[str, Any], copy.deepcopy(result))


def format_review_json(result: CodeReviewResult) -> str:
    return json.dumps(to_plain_dict(result), indent=2, ensure_ascii=False) + "\n"


def parse_review_json(text: str) -> CodeReviewResult:
    """Parse JSON text into a :class:`CodeReviewResult` (minimal validation of keys)."""
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("review root must be a JSON object")
    for k in ("schema_version", "summary", "verdict", "issues", "suggested_edits", "follow_up_tasks"):
        if k not in data:
            raise ValueError(f"missing required key: {k}")
    return cast(CodeReviewResult, data)


__all__ = [
    "SEVERITY_ENUM",
    "VERDICT_ENUM",
    "REVIEW_RESULT_JSON_SCHEMA",
    "CodeReviewResult",
    "CodeReviewResultD",
    "ReviewIssue",
    "ReviewIssueD",
    "ReviewLocation",
    "Severity",
    "SuggestedEdit",
    "Verdict",
    "format_review_json",
    "parse_review_json",
    "to_plain_dict",
]
