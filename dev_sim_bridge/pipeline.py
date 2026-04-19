"""Run the same coding → K2 review → optional follow-up flow as ``dev_sim.orchestrate`` CLI."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from dev_sim.coding_agent import run_coding_agent, workspace_root
from dev_sim.config import (
    DEFAULT_REPO_REGISTRY,
    get_anthropic_api_key,
    get_github_token,
    get_k2_api_key,
    load_env,
    resolve_coding_model,
    resolve_k2_review_model,
)
from dev_sim.orchestrate import _followup_prompt
from dev_sim.personas_bridge import (
    coding_persona_bundle,
    persona_slice_coding,
    persona_slice_review,
    review_persona_bundle,
)
from dev_sim.review_agent import compute_k2_pr_review, post_pr_issue_comment


def run_orchestrate_for_prompt(
    text: str,
    *,
    repo_root: Path,
    workspace: Path | None = None,
    repo_registry: Path | None = None,
    max_turns: int = 24,
    followup_max_turns: int = 24,
    max_diff_chars: int = 200_000,
    always_followup: bool = False,
    no_review_comment: bool = False,
    no_agent_progress: bool = True,
    progress_interval_sec: float = 10.0,
    coding_persona: dict[str, Any] | None = None,
    review_persona: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Returns a JSON-serializable dict. Never calls ``sys.exit`` (unlike the CLI).

    ``repo_root`` is used for ``repo-registry.json`` when ``repo_registry`` is omitted.
    """
    load_env()
    t = (text or "").strip()
    if not t:
        return {"ok": False, "error": "Prompt is empty."}
    if not get_anthropic_api_key():
        return {"ok": False, "error": "ANTHROPIC_API_KEY is not set (needed for the coding agent)."}
    if not (get_github_token() or "").strip():
        return {"ok": False, "error": "GITHUB_TOKEN is not set (needed for PRs and review)."}
    if not get_k2_api_key():
        return {"ok": False, "error": "K2_API_KEY is not set (needed for K2 PR review)."}

    ws = workspace_root(workspace)
    gh = get_github_token()
    model = resolve_coding_model(None)
    k2_model = resolve_k2_review_model(None)
    reg = (repo_registry or (repo_root / DEFAULT_REPO_REGISTRY)).expanduser().resolve()

    if coding_persona is not None and review_persona is not None:
        try:
            coding_suffix = persona_slice_coding(coding_persona)
            coding_persona_dict = coding_persona
            review_prefix = persona_slice_review(review_persona)
            review_persona_dict = review_persona
        except (KeyError, TypeError, ValueError) as e:
            return {
                "ok": False,
                "error": f"Invalid coding/review persona payload (must match generate_persona v2 roles): {e}",
            }
    else:
        coding_suffix, coding_persona_dict = coding_persona_bundle(None, None)
        review_prefix, review_persona_dict = review_persona_bundle(None)
    prog = not no_agent_progress

    r1 = run_coding_agent(
        t,
        workspace=ws,
        model=model,
        max_turns=max_turns,
        github_token=gh,
        repo_registry_path=reg,
        persona_system_suffix=coding_suffix,
        persona_dict=coding_persona_dict,
        agent_progress=prog,
        progress_log_path=ws / "dev-sim-agents-progress.log",
        progress_interval_sec=progress_interval_sec,
    )
    last_pr = r1.get("last_pr")
    if not last_pr or not last_pr.get("number"):
        return {
            "ok": False,
            "error": (
                "Coding pass did not open a pull request (check agent logs). "
                f"stop={r1.get('stop')!r}"
            ),
            "codingPass1": _serialize_run(r1),
        }

    owner, repo = str(last_pr["owner"]), str(last_pr["repo"])
    prn = int(last_pr["number"])
    html_url = str(last_pr.get("html_url") or f"https://github.com/{owner}/{repo}/pull/{prn}")

    review_out = compute_k2_pr_review(
        gh,
        owner,
        repo,
        prn,
        model=k2_model,
        max_diff_chars=max_diff_chars,
        include_json_in_comment=True,
        persona_system_prefix=review_prefix,
        persona_dict=review_persona_dict,
        agent_progress=prog,
        progress_log_path=ws / "dev-sim-agents-progress.log",
        progress_interval_sec=progress_interval_sec,
    )
    if not review_out.get("ok"):
        return {
            "ok": False,
            "error": review_out.get("error") or "K2 review failed.",
            "codingPass1": _serialize_run(r1),
            "lastPr": _serialize_pr(last_pr),
        }

    review = review_out.get("review")
    raw_model = str(review_out.get("raw_model") or "")
    comment_md = str(review_out.get("comment_markdown") or "")

    posted_url: str | None = None
    if not no_review_comment:
        posted = post_pr_issue_comment(gh, owner, repo, prn, comment_md)
        if isinstance(posted, dict):
            posted_url = str(posted.get("html_url") or "")

    verdict = (review or {}).get("verdict") if isinstance(review, dict) else None
    skip_followup = verdict == "approve" and not always_followup

    r2_summary: dict[str, Any] | None = None
    if not skip_followup:
        follow = _followup_prompt(
            owner=owner,
            repo=repo,
            number=prn,
            html_url=html_url,
            review=review if isinstance(review, dict) else None,
            raw_model=raw_model,
        )
        r2 = run_coding_agent(
            follow,
            workspace=ws,
            model=model,
            max_turns=followup_max_turns,
            github_token=gh,
            repo_registry_path=reg,
            persona_system_suffix=coding_suffix,
            persona_dict=coding_persona_dict,
            agent_progress=prog,
            progress_log_path=ws / "dev-sim-agents-progress.log",
            progress_interval_sec=progress_interval_sec,
        )
        r2_summary = _serialize_run(r2)

    return {
        "ok": True,
        "codingPass1": _serialize_run(r1),
        "review": review if isinstance(review, dict) else None,
        "reviewRawOk": bool(review_out.get("parse_ok")),
        "verdict": verdict,
        "postedReviewCommentUrl": posted_url,
        "followUpSkipped": skip_followup,
        "codingPass2": r2_summary,
        "lastPr": _serialize_pr(last_pr),
    }


def _serialize_run(r: dict[str, Any]) -> dict[str, Any]:
    return {"stop": r.get("stop"), "last_pr": _serialize_pr(r.get("last_pr"))}


def _serialize_pr(last_pr: Any) -> dict[str, Any] | None:
    if not last_pr or not isinstance(last_pr, dict):
        return None
    owner = str(last_pr.get("owner", ""))
    repo = str(last_pr.get("repo", ""))
    num = last_pr.get("number")
    return {
        "owner": owner,
        "repo": repo,
        "number": int(num) if num is not None else None,
        "html_url": str(last_pr.get("html_url") or ""),
        "title": str(last_pr.get("title") or ""),
        "fullName": f"{owner}/{repo}" if owner and repo else "",
    }

