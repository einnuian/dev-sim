"""PR review agent: fetch a GitHub pull request diff, call K2 Think, post an issue comment.

Uses the OpenAI-compatible K2 API (``K2_API_KEY``) and :func:`config.resolve_k2_review_model`.
Tries to parse structured JSON; comment body is always a markdown summary (with optional JSON).
"""

from __future__ import annotations

import json
import re
import sys
from typing import Any

import httpx
from openai import OpenAI

from dev_sim.config import K2_API_BASE, get_k2_api_key

STRUCTURED_OUTPUT_INSTRUCTION = (
    "Respond with a **single** JSON object only, no markdown fences, with keys: "
    "schema_version (string, use \"1.0.0\"), summary, verdict (one of "
    "approve, request_changes, comment_only), issues (array of objects with "
    "severity, title, detail, suggested_fix, optional location {path, start_line, end_line, label}), "
    "suggested_edits (array of {path, instruction, optional snippet}), "
    "follow_up_tasks (string array), optional review_context. "
    "Set suggested_fix to concrete, imperative text for a coding agent. "
    "List issues in severity order: blocker, major, minor, nit, suggestion."
)


REVIEW_SYSTEM_PROMPT = f"""You are a senior code reviewer. Review the pull request for correctness,
security, performance, and maintainability. {STRUCTURED_OUTPUT_INSTRUCTION}"""


def _gh_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def fetch_pr_metadata(
    token: str, owner: str, repo: str, pull_number: int, timeout: float = 60.0
) -> dict[str, Any] | None:
    url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}"
    r = httpx.get(url, headers=_gh_headers(token), timeout=timeout)
    if r.is_error:
        return None
    return r.json()


def fetch_pr_diff(
    token: str,
    owner: str,
    repo: str,
    pull_number: int,
    max_chars: int = 200_000,
    timeout: float = 120.0,
) -> str:
    """Return unified diff for the PR, truncated to ``max_chars`` for model context."""
    url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}"
    r = httpx.get(
        url,
        headers={
            **_gh_headers(token),
            "Accept": "application/vnd.github.diff",
        },
        timeout=timeout,
    )
    if r.is_error:
        return f"[Error fetching diff: HTTP {r.status_code} — {r.text[:500]}]\n"
    text = r.text
    if len(text) > max_chars:
        return text[: max_chars] + f"\n\n[… diff truncated: {len(text) - max_chars} characters omitted …]\n"
    return text


def post_pr_issue_comment(
    token: str, owner: str, repo: str, issue_number: int, body: str, timeout: float = 60.0
) -> dict[str, Any] | str:
    """
    Add a top-level **issue** comment to the pull request (for PRs, the issue id equals the
    PR number).
    """
    url = f"https://api.github.com/repos/{owner}/{repo}/issues/{issue_number}/comments"
    r = httpx.post(
        url,
        headers=_gh_headers(token),
        json={"body": body},
        timeout=timeout,
    )
    if r.is_error:
        return f"HTTP {r.status_code}: {r.text[:2000]}"
    try:
        return r.json()
    except Exception:
        return str(r.text[:500])


# K2-Think and similar models may emit a long "thinking" preface, draft JSON, then the
# final object. A naive first-{ to last-} slice breaks when early prose or drafts contain `{`.
# We anchor on the first `{` of a top-level "schema_version" key, then `JSONDecoder.raw_decode`
# to parse the exact one JSON value (string-aware, balanced braces).
REVIEW_ROOT_JSON_START = re.compile(
    r'(\{)\s*"schema_version"\s*:',
    re.MULTILINE,
)

_decoder = json.JSONDecoder()


def _raw_decode_object_at(s: str, i: int) -> dict[str, Any] | None:
    if i < 0 or i >= len(s) or s[i] not in " \t\r\n{":
        return None
    if s[i] in " \t\r\n":
        i = s.find("{", i)
        if i < 0:
            return None
    try:
        o, _end = _decoder.raw_decode(s, i)
    except json.JSONDecodeError:
        return None
    return o if isinstance(o, dict) else None


def _try_parse_review_json(text: str) -> dict[str, Any] | None:
    """Parse the CodeReviewResult object from the model, anchored on top-level ``schema_version``."""
    t = text.strip()
    if "schema_version" in t and '"schema_version"' in t:
        # Try from last `{"schema_version"…` first (K2-Think: final object after long thinking).
        for m in reversed(list(REVIEW_ROOT_JSON_START.finditer(t))):
            out = _raw_decode_object_at(t, m.start(1))
            if out and "schema_version" in out:
                return out
    # Fenced ` ```json` block without a matching `{"schema_version"…` in the same span.
    m2 = re.search(r"```(?:json)?\s*(\{)", t)
    if m2 is not None:
        out2 = _raw_decode_object_at(t, m2.start(1))
        if isinstance(out2, dict) and "schema_version" in out2:
            return out2
    a = t.find("{")
    if a < 0:
        return None
    try:
        o3, _end = _decoder.raw_decode(t, a)
    except (json.JSONDecodeError, TypeError, ValueError):
        o3 = None
    if isinstance(o3, dict) and o3:
        return o3
    b = t.rfind("}")
    if 0 > a or a >= b:
        return None
    try:
        o4 = json.loads(t[a : b + 1])
    except json.JSONDecodeError:
        return None
    return o4 if isinstance(o4, dict) else None


def format_review_markdown(review: dict[str, Any], include_json: bool) -> str:
    """Build GitHub-Flavored Markdown for the PR issue comment from parsed JSON."""
    v = str(review.get("verdict", "comment_only"))
    sm = str(review.get("summary", "")).strip()
    parts: list[str] = [
        "### Automated code review (K2 / dev-sim)\n",
        f"**Verdict:** `{v}`\n",
    ]
    if sm:
        parts.append("\n" + sm + "\n")
    for i, isu in enumerate(review.get("issues") or [], 1):
        if not isinstance(isu, dict):
            continue
        sev = isu.get("severity", "—")
        title = isu.get("title", "Issue")
        det = (isu.get("detail") or "").strip()
        loc = isu.get("location") or {}
        path = loc.get("path", "—") if isinstance(loc, dict) else "—"
        parts.append(f"\n**{i}. [{sev}]** {title}  \n")
        if path and path != "—":
            parts.append(f"*{path}*\n\n")
        if det:
            parts.append(det + "\n\n")
        sf = (isu.get("suggested_fix") or "").strip()
        if sf:
            parts.append(f"**Suggested fix:** {sf}\n\n")
    for ed in review.get("suggested_edits") or []:
        if not isinstance(ed, dict):
            continue
        p, ins = ed.get("path", ""), ed.get("instruction", "")
        if p or ins:
            parts.append(f"- **{p}** — {ins}\n")
    for task in review.get("follow_up_tasks") or []:
        if isinstance(task, str) and task.strip():
            parts.append(f"- [ ] {task}\n")
    if include_json:
        pretty = json.dumps(review, indent=2, ensure_ascii=False)[:20_000]
        parts.append("\n\n<details><summary>Structured <code>CodeReviewResult</code> (for agents)</summary>\n\n")
        parts.append(f"```json\n{pretty}\n```\n</details>\n")
    return "".join(parts)


def run_k2_pr_review(
    token: str,
    owner: str,
    repo: str,
    pull_number: int,
    *,
    model: str,
    post_comment: bool = True,
    max_diff_chars: int = 200_000,
    include_json: bool = True,
) -> None:
    token = token.strip() if token else ""
    if not token:
        print("GITHUB_TOKEN is required.", file=sys.stderr)
        sys.exit(1)
    k2_key = get_k2_api_key()
    if not k2_key:
        print("K2_API_KEY is required for the PR review agent (K2 Think / OpenAI-compatible).", file=sys.stderr)
        sys.exit(1)

    meta = fetch_pr_metadata(token, owner, repo, pull_number)
    if not meta:
        print("Failed to fetch pull request. Check org/repo, PR number, and token access.", file=sys.stderr)
        sys.exit(1)

    title = meta.get("title", "")
    body = (meta.get("body") or "")[:8000]
    head = (meta.get("head") or {}).get("ref", "head")
    base = (meta.get("base") or {}).get("ref", "base")
    html = meta.get("html_url", "")
    user = (meta.get("user") or {}).get("login", "author")

    diff = fetch_pr_diff(
        token, owner, repo, pull_number, max_chars=max_diff_chars
    )
    user_msg = f"""## PR metadata
- **Repository:** {owner}/{repo}
- **Number:** {pull_number}
- **Title:** {title}
- **Author:** {user}
- **Base** ← **Head:** `{base}` ← `{head}`
- **URL:** {html}
- **PR description (excerpt):**
{body or "(none)"}

## Diff (unified, may be truncated for size)

```diff
{diff}
```
"""
    client = OpenAI(api_key=k2_key, base_url=K2_API_BASE)
    try:
        resp = client.chat.completions.create(
            model=model,
            max_tokens=8192,
            messages=[
                {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
        )
    except Exception as e:
        print(f"K2 request failed: {e}", file=sys.stderr)
        sys.exit(1)

    choice = resp.choices[0] if resp.choices else None
    raw = (choice.message.content or "").strip() if choice and choice.message else ""
    if not raw:
        print("Empty model response", file=sys.stderr)
        sys.exit(1)

    review_obj = _try_parse_review_json(raw)
    if review_obj:
        comment_body = format_review_markdown(review_obj, include_json=include_json)
    else:
        comment_body = f"### Automated code review (K2 / dev-sim)\n\n" + (
            f"The model did not return parseable JSON. Raw response:\n\n```\n{raw[:50_000]}\n```"
        )

    if post_comment:
        r = post_pr_issue_comment(
            token, owner, repo, issue_number=pull_number, body=comment_body
        )
        if isinstance(r, str):
            print(f"Failed to post comment: {r}", file=sys.stderr)
            sys.exit(1)
        c_url = (r or {}).get("html_url", "")
        print("Posted PR comment" + (f": {c_url}" if c_url else ""), file=sys.stderr)
    else:
        print(comment_body)
        return


__all__ = [
    "fetch_pr_diff",
    "fetch_pr_metadata",
    "format_review_markdown",
    "post_pr_issue_comment",
    "run_k2_pr_review",
]
