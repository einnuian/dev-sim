"""Coding agent: Anthropic tool-calling loop for Git, GitHub, and repo registry.

The `dev-sim` CLI in `dev_sim.cli` loads environment variables and calls `run_coding_agent()`.
This module owns system prompts, tool schemas, tool execution, and the Messages API loop.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from contextlib import nullcontext
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import anthropic
import httpx

from dev_sim.agent_progress import AgentProgressLogger, ProgressAnnouncer
from dev_sim.config import get_anthropic_api_key, load_env

ALLOWED_GIT_SUBCOMMANDS = frozenset(
    {
        "init",
        "clone",
        "add",
        "commit",
        "push",
        "pull",
        "remote",
        "branch",
        "checkout",
        "status",
        "log",
        "config",
        "fetch",
        "merge",
        "mv",
        "rm",
    }
)

# Instructions and guardrails for the model; kept in code (not a file) so installs always match behavior.
SYSTEM_PROMPT = """You are a coding assistant with tools to create GitHub repositories, run git commands locally, and open pull requests for human review.

Repo name registry (short name -> remote URL):
- When create_github_repository succeeds, the CLI automatically saves the GitHub repo `name` and HTTPS `clone_url` into the repo registry file (you do not need to call upsert_repo_registry_entry for that case).
- At the start of work involving a known project, call read_repo_registry to resolve friendly names to clone URLs.
- For extra aliases, manual URL fixes, or non-created remotes, use upsert_repo_registry_entry or remove_repo_registry_entry when the user asks.
- Use the URL from the registry with git_clone_repository or git_set_remote as appropriate.

General guidelines:
- Use create_github_repository when the user wants a new repo on GitHub. Prefer concise names and clear descriptions.
- After creating a repo, use git_clone_repository with the returned clone_url (use the https URL) into the workspace, or git_init_local + git_set_remote if you prefer a fresh init.
- Implement changes with write_workspace_file paths under the clone directory (e.g. my-repo/README.md), then run_git with add, commit, push as needed.
- For first push to a new empty repo, use branch name main unless the remote uses another default.
- Never echo or reveal API keys or tokens. If credentials are missing, explain what env vars are required.
- If a git command fails, read the error and adjust (e.g. set user.name / user.email with git config if commit requires them).
- Before git push to GitHub over HTTPS, call rewrite_origin_for_github_token_push if GITHUB_TOKEN is available (it is injected by the CLI when set); otherwise the user must configure credentials (SSH remote or gh auth).

Pull request workflow (when the user wants a PR or standard team workflow):
1. Ensure you have a local clone (git_clone_repository) with origin pointing at github.com.
2. Fetch and check out the default branch: use get_github_repository_metadata to learn default_branch, then run_git checkout that branch, run_git pull (or fetch + merge as appropriate).
3. Create a new branch from that tip: run_git with checkout -b <feature-branch> (descriptive name, e.g. feature/add-readme).
4. Make edits with write_workspace_file under the repo subdirectory, then run_git add, run_git commit.
5. run_git push -u origin <feature-branch> (after rewrite_origin_for_github_token_push when using HTTPS with GITHUB_TOKEN).
6. Call create_github_pull_request with repo_subdir, head_branch = feature branch, base_branch from get_github_repository_metadata, title, and optional body. Use draft true only if the user asked for a draft.
7. After the PR is opened, give the user the PR html_url. Do not merge or approve PRs via API or git merge to main; a human will review and merge on GitHub.

Direct push to main without a PR: only when the user explicitly asks to skip the PR workflow.
"""


# ---------------------------------------------------------------------------
# Workspace layout
# ---------------------------------------------------------------------------


def workspace_root(workdir: Path | None) -> Path:
    base = workdir.expanduser().resolve() if workdir else Path.cwd() / ".dev-sim-workspace"
    base.mkdir(parents=True, exist_ok=True)
    return base


# ---------------------------------------------------------------------------
# Anthropic "tools" — JSON Schema fragments passed to messages.create(tools=...)
# ---------------------------------------------------------------------------


def _tool_specs() -> list[dict[str, Any]]:
    return [
        {
            "name": "create_github_repository",
            "description": "Create a new repository for the authenticated GitHub user.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Repository name (e.g. my-project)",
                    },
                    "description": {"type": "string", "description": "Short description"},
                    "private": {
                        "type": "boolean",
                        "description": "Whether the repo should be private",
                    },
                },
                "required": ["name"],
            },
        },
        {
            "name": "git_clone_repository",
            "description": "Clone a remote repository into the workspace (under a subdirectory).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "clone_url": {
                        "type": "string",
                        "description": "HTTPS or SSH clone URL",
                    },
                    "target_dir": {
                        "type": "string",
                        "description": "Directory name under the workspace (no path traversal)",
                    },
                },
                "required": ["clone_url", "target_dir"],
            },
        },
        {
            "name": "git_init_local",
            "description": "Run git init in a subdirectory of the workspace.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "target_dir": {
                        "type": "string",
                        "description": "Directory under workspace to initialize",
                    },
                },
                "required": ["target_dir"],
            },
        },
        {
            "name": "git_set_remote",
            "description": "Set origin URL for a repo under the workspace.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "repo_subdir": {
                        "type": "string",
                        "description": "Repo root relative to workspace",
                    },
                    "url": {"type": "string", "description": "Remote URL (typically https)"},
                },
                "required": ["repo_subdir", "url"],
            },
        },
        {
            "name": "run_git",
            "description": (
                f"Run git in a subdirectory of the workspace. Allowed first argument must be one of: "
                f"{', '.join(sorted(ALLOWED_GIT_SUBCOMMANDS))}."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "repo_subdir": {
                        "type": "string",
                        "description": "Repository root relative to workspace",
                    },
                    "args": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Git arguments after `git`, e.g. [\"add\", \".\"]",
                    },
                },
                "required": ["repo_subdir", "args"],
            },
        },
        {
            "name": "write_workspace_file",
            "description": (
                "Create or overwrite a file under the workspace. Parent directories are created."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "relative_path": {
                        "type": "string",
                        "description": "Path relative to workspace root",
                    },
                    "content": {"type": "string", "description": "Full file contents"},
                },
                "required": ["relative_path", "content"],
            },
        },
        {
            "name": "list_workspace",
            "description": "List files and directories under the workspace (non-hidden), max depth 4.",
            "input_schema": {"type": "object", "properties": {}, "required": []},
        },
        {
            "name": "rewrite_origin_for_github_token_push",
            "description": (
                "Rewrite git remote origin to use HTTPS with the token from the GITHUB_TOKEN "
                "environment variable so git push works non-interactively. Does not expose the "
                "token in chat. Only works for github.com HTTPS URLs."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "repo_subdir": {
                        "type": "string",
                        "description": "Repository root relative to workspace",
                    },
                },
                "required": ["repo_subdir"],
            },
        },
        {
            "name": "get_github_repository_metadata",
            "description": (
                "Fetch GitHub API metadata for the repository pointed to by git remote origin "
                "(owner/repo parsed from the URL). Returns default_branch, html_url, and related "
                "fields. Call this before create_github_pull_request to set base_branch correctly."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "repo_subdir": {
                        "type": "string",
                        "description": "Repository root relative to workspace",
                    },
                },
                "required": ["repo_subdir"],
            },
        },
        {
            "name": "create_github_pull_request",
            "description": (
                "Open a pull request on github.com for the repo in repo_subdir (origin must be "
                "github.com). Same-repo workflow: head_branch is the branch name pushed to origin. "
                "Use get_github_repository_metadata for base_branch (default branch name)."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "repo_subdir": {
                        "type": "string",
                        "description": "Repository root relative to workspace",
                    },
                    "head_branch": {
                        "type": "string",
                        "description": "Source branch name (exists on origin)",
                    },
                    "base_branch": {
                        "type": "string",
                        "description": "Target branch (e.g. main); prefer value from get_github_repository_metadata",
                    },
                    "title": {"type": "string", "description": "PR title"},
                    "body": {"type": "string", "description": "PR description (markdown)"},
                    "draft": {
                        "type": "boolean",
                        "description": "If true, open as draft PR",
                    },
                },
                "required": ["repo_subdir", "head_branch", "base_branch", "title"],
            },
        },
        {
            "name": "read_repo_registry",
            "description": (
                "Read the repo registry JSON file: maps short names (keys) to git remote URLs "
                "(HTTPS or git@github.com). Use before cloning when the user refers to a project by name."
            ),
            "input_schema": {"type": "object", "properties": {}, "required": []},
        },
        {
            "name": "upsert_repo_registry_entry",
            "description": "Add or replace one entry in the repo registry (short name -> remote URL).",
            "input_schema": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Short key, e.g. my-calculator (no path separators)",
                    },
                    "remote_url": {
                        "type": "string",
                        "description": "Clone URL (https://... or git@github.com:...)",
                    },
                },
                "required": ["name", "remote_url"],
            },
        },
        {
            "name": "remove_repo_registry_entry",
            "description": "Remove one short name from the repo registry if present.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Short key to remove"},
                },
                "required": ["name"],
            },
        },
    ]


# ---------------------------------------------------------------------------
# Path safety — all tool paths that touch disk should go through here
# ---------------------------------------------------------------------------


def _resolve_under_workspace(workspace: Path, rel: str) -> Path:
    rel_norm = rel.replace("\\", "/").lstrip("/")
    if ".." in Path(rel_norm).parts:
        raise ValueError("path must stay within workspace")
    path = (workspace / rel_norm).resolve()
    try:
        path.relative_to(workspace)
    except ValueError as e:
        raise ValueError("path escapes workspace") from e
    return path


# ---------------------------------------------------------------------------
# Repo registry — JSON file mapping short names to clone URLs (outside workspace)
# ---------------------------------------------------------------------------


def _registry_repos_from_doc(data: Any) -> dict[str, str]:
    """Normalize file contents to a str->str map."""
    if not isinstance(data, dict):
        return {}
    inner = data.get("repos")
    if isinstance(inner, dict):
        return {
            str(k): str(v)
            for k, v in inner.items()
            if isinstance(k, str) and isinstance(v, str) and not k.startswith("_")
        }
    # Flat legacy object of string keys only (no nested repos key).
    return {
        str(k): str(v)
        for k, v in data.items()
        if isinstance(k, str) and isinstance(v, str) and not str(k).startswith("_")
    }


def _load_repo_registry(path: Path) -> dict[str, Any]:
    """Load registry from disk; missing file yields empty repos."""
    if not path.exists():
        return {"ok": True, "repos": {}, "registry_path": str(path), "note": "file does not exist yet"}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return {"ok": False, "error": str(e), "registry_path": str(path)}
    repos = _registry_repos_from_doc(data)
    return {"ok": True, "repos": repos, "registry_path": str(path)}


def _save_repo_registry(path: Path, repos: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = {"repos": dict(sorted(repos.items(), key=lambda kv: kv[0].lower()))}
    path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")


def _persist_created_repo_to_registry(
    registry_path: Path, created: dict[str, Any]
) -> dict[str, Any]:
    """Merge a newly created GitHub repo into the registry under its API name (HTTPS clone_url)."""
    if not created.get("ok"):
        return {"registry_saved": False, "registry_skip_reason": "create did not succeed"}
    key = created.get("name")
    url = created.get("clone_url")
    if not key or not isinstance(key, str):
        return {"registry_saved": False, "registry_skip_reason": "missing repo name in API response"}
    if not url or not isinstance(url, str):
        return {"registry_saved": False, "registry_skip_reason": "missing clone_url in API response"}
    name_err = _validate_registry_name(key)
    url_err = _validate_remote_url(url)
    if name_err or url_err:
        return {
            "registry_saved": False,
            "registry_skip_reason": name_err or url_err,
        }
    try:
        loaded = _load_repo_registry(registry_path)
        if not loaded.get("ok"):
            return {
                "registry_saved": False,
                "registry_error": loaded.get("error", "failed to read registry"),
            }
        repos: dict[str, str] = dict(loaded["repos"])
        repos[key] = url.strip()
        _save_repo_registry(registry_path, repos)
    except OSError as e:
        return {"registry_saved": False, "registry_error": str(e)}
    return {
        "registry_saved": True,
        "registry_key": key,
        "registry_path": str(registry_path),
    }


def _validate_registry_name(name: str) -> str | None:
    if not name or not name.strip():
        return "name must be non-empty"
    if "/" in name or "\\" in name or name.strip() != name:
        return "name must not contain path separators or leading/trailing whitespace"
    if name in (".", "..") or ".." in name:
        return "invalid name"
    return None


def _validate_remote_url(url: str) -> str | None:
    u = url.strip()
    if not u:
        return "remote_url must be non-empty"
    if u.startswith("https://") or u.startswith("http://") or u.startswith("git@"):
        return None
    return "remote_url should start with https://, http://, or git@"


# ---------------------------------------------------------------------------
# GitHub REST (api.github.com) — shared pieces for create repo / metadata / PRs
# ---------------------------------------------------------------------------


def _github_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _parse_github_owner_repo_from_remote(url: str) -> tuple[str, str] | None:
    """Return (owner, repo) for github.com remotes, or None if the URL is not a simple owner/repo pair."""
    u = url.strip()
    if u.startswith("git@"):
        if not u.startswith("git@github.com:"):
            return None
        path = u.split(":", 1)[1].removesuffix(".git")
        parts = path.split("/")
        if len(parts) == 2 and parts[0] and parts[1]:
            return parts[0], parts[1]
        return None
    parsed = urlparse(u)
    if (parsed.hostname or "").lower() != "github.com":
        return None
    path = parsed.path.strip("/").removesuffix(".git")
    parts = path.split("/")
    if len(parts) == 2 and parts[0] and parts[1]:
        return parts[0], parts[1]
    return None


def _github_create_repo(
    token: str, name: str, description: str | None, private: bool
) -> dict[str, Any]:
    """Create a repo for the authenticated user (not org-owned without a different endpoint)."""
    url = "https://api.github.com/user/repos"
    body: dict[str, Any] = {"name": name, "private": private, "auto_init": False}
    if description:
        body["description"] = description
    r = httpx.post(
        url,
        headers=_github_headers(token),
        json=body,
        timeout=60.0,
    )
    if r.is_error:
        return {"ok": False, "status": r.status_code, "body": r.text[:4000]}
    data = r.json()
    return {
        "ok": True,
        "name": data.get("name"),
        "html_url": data.get("html_url"),
        "clone_url": data.get("clone_url"),
        "ssh_url": data.get("ssh_url"),
        "default_branch": data.get("default_branch"),
    }


def _rewrite_origin_github_token(repo: Path, token: str) -> dict[str, Any]:
    """Embed the PAT in the HTTPS URL so git push does not prompt (GitHub accepts x-access-token)."""
    cur = _run_git_subprocess(repo, ["remote", "get-url", "origin"])
    if cur["returncode"] != 0:
        return {"error": "no origin remote or failed to read", **cur}
    url = (cur.get("stdout") or "").strip()
    if not url.startswith("https://github.com/"):
        return {
            "ok": False,
            "message": "origin is not an https://github.com URL; configure SSH or auth yourself",
            "origin": url,
        }
    if "x-access-token" in url:
        return {"ok": True, "message": "origin already uses x-access-token URL", "origin": url}
    rest = url.removeprefix("https://github.com/")
    new_url = f"https://x-access-token:{token}@github.com/{rest}"
    return _run_git_subprocess(repo, ["remote", "set-url", "origin", new_url])


def _run_git_subprocess(
    cwd: Path, args: list[str], timeout: int = 120
) -> dict[str, Any]:
    """Run git with cwd set; stdout/stderr are truncated to keep tool_result payloads small."""
    try:
        p = subprocess.run(
            ["git", *args],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return {
            "returncode": p.returncode,
            "stdout": (p.stdout or "")[-8000:],
            "stderr": (p.stderr or "")[-8000:],
        }
    except subprocess.TimeoutExpired:
        return {"returncode": -1, "stdout": "", "stderr": "git command timed out"}


def _origin_github_owner_repo(repo: Path) -> dict[str, Any]:
    """Resolve owner/repo slug for REST paths from `git remote get-url origin`."""
    cur = _run_git_subprocess(repo, ["remote", "get-url", "origin"])
    if cur["returncode"] != 0:
        return {"error": "could not read git remote origin", "git": cur}
    origin = (cur.get("stdout") or "").strip()
    if not origin:
        return {"error": "empty git remote origin URL", "git": cur}
    parsed = _parse_github_owner_repo_from_remote(origin)
    if not parsed:
        safe = urlparse(origin)
        hint = (
            f"https://github.com{safe.path}"
            if (safe.hostname or "").lower() == "github.com"
            else "non-github or unrecognized origin"
        )
        return {"error": "origin is not a recognized github.com owner/repo URL", "hint": hint}
    owner, repo_name = parsed
    return {"ok": True, "owner": owner, "repo": repo_name}


def _github_get_repository_metadata(token: str, owner: str, repo: str) -> dict[str, Any]:
    """GET /repos/{owner}/{repo} — mainly for default_branch before opening a PR."""
    api_url = f"https://api.github.com/repos/{owner}/{repo}"
    r = httpx.get(api_url, headers=_github_headers(token), timeout=60.0)
    if r.is_error:
        return {"ok": False, "status": r.status_code, "body": r.text[:4000]}
    data = r.json()
    return {
        "ok": True,
        "default_branch": data.get("default_branch"),
        "html_url": data.get("html_url"),
        "name": data.get("name"),
        "full_name": data.get("full_name"),
        "private": data.get("private"),
    }


def _github_create_pull_request(
    token: str,
    owner: str,
    repo: str,
    title: str,
    head_branch: str,
    base_branch: str,
    body: str | None,
    draft: bool,
) -> dict[str, Any]:
    """POST /repos/{owner}/{repo}/pulls — same-repo PR: head is a branch name on origin."""
    api_url = f"https://api.github.com/repos/{owner}/{repo}/pulls"
    payload: dict[str, Any] = {
        "title": title,
        "head": head_branch,
        "base": base_branch,
        "draft": bool(draft),
    }
    if body:
        payload["body"] = body
    r = httpx.post(api_url, headers=_github_headers(token), json=payload, timeout=60.0)
    if r.is_error:
        return {"ok": False, "status": r.status_code, "body": r.text[:4000]}
    data = r.json()
    return {
        "ok": True,
        "number": data.get("number"),
        "html_url": data.get("html_url"),
        "state": data.get("state"),
        "title": data.get("title"),
    }


# ---------------------------------------------------------------------------
# Tool dispatcher — maps Claude tool names to git / HTTP / filesystem actions
# ---------------------------------------------------------------------------


def _execute_tool(
    name: str,
    tool_input: dict[str, Any],
    workspace: Path,
    github_token: str | None,
    repo_registry_path: Path,
) -> dict[str, Any]:
    """Run one tool; return a JSON-serializable dict (becomes tool_result content for the API)."""
    try:
        if name == "read_repo_registry":
            return _load_repo_registry(repo_registry_path)

        if name == "upsert_repo_registry_entry":
            key = str(tool_input["name"])
            url = str(tool_input["remote_url"])
            err = _validate_registry_name(key) or _validate_remote_url(url)
            if err:
                return {"error": err}
            loaded = _load_repo_registry(repo_registry_path)
            if not loaded.get("ok"):
                return loaded
            repos: dict[str, str] = dict(loaded["repos"])
            repos[key] = url.strip()
            _save_repo_registry(repo_registry_path, repos)
            return {
                "ok": True,
                "registry_path": str(repo_registry_path),
                "updated": key,
                "repos": repos,
            }

        if name == "remove_repo_registry_entry":
            key = str(tool_input["name"])
            err = _validate_registry_name(key)
            if err:
                return {"error": err}
            loaded = _load_repo_registry(repo_registry_path)
            if not loaded.get("ok"):
                return loaded
            repos = dict(loaded["repos"])
            existed = key in repos
            repos.pop(key, None)
            _save_repo_registry(repo_registry_path, repos)
            return {
                "ok": True,
                "registry_path": str(repo_registry_path),
                "removed": existed,
                "repos": repos,
            }

        if name == "create_github_repository":
            if not github_token:
                return {"error": "GITHUB_TOKEN is not set in the environment."}
            created = _github_create_repo(
                github_token,
                str(tool_input["name"]),
                tool_input.get("description"),
                bool(tool_input.get("private", False)),
            )
            if created.get("ok"):
                reg = _persist_created_repo_to_registry(repo_registry_path, created)
                return {**created, **reg}
            return created

        if name == "git_clone_repository":
            # Clone into workspace/<target_dir>; wipe existing dir so re-runs are deterministic.
            target = _resolve_under_workspace(workspace, str(tool_input["target_dir"]))
            if target.exists():
                shutil.rmtree(target)
            parent = target.parent
            parent.mkdir(parents=True, exist_ok=True)
            url = str(tool_input["clone_url"])
            res = _run_git_subprocess(parent, ["clone", url, target.name])
            return {"path": str(target), **res}

        if name == "git_init_local":
            target = _resolve_under_workspace(workspace, str(tool_input["target_dir"]))
            target.mkdir(parents=True, exist_ok=True)
            res = _run_git_subprocess(target, ["init"])
            return {"path": str(target), **res}

        if name == "git_set_remote":
            repo = _resolve_under_workspace(workspace, str(tool_input["repo_subdir"]))
            url = str(tool_input["url"])
            return _run_git_subprocess(repo, ["remote", "add", "origin", url])

        if name == "run_git":
            repo = _resolve_under_workspace(workspace, str(tool_input["repo_subdir"]))
            args = [str(a) for a in tool_input["args"]]
            if not args:
                return {"error": "args cannot be empty"}
            sub = args[0]
            if sub not in ALLOWED_GIT_SUBCOMMANDS:
                return {"error": f"git subcommand not allowed: {sub}"}
            return _run_git_subprocess(repo, args)

        if name == "write_workspace_file":
            path = _resolve_under_workspace(workspace, str(tool_input["relative_path"]))
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(str(tool_input["content"]), encoding="utf-8")
            return {"ok": True, "path": str(path)}

        if name == "rewrite_origin_for_github_token_push":
            if not github_token:
                return {"error": "GITHUB_TOKEN is not set in the environment."}
            repo = _resolve_under_workspace(workspace, str(tool_input["repo_subdir"]))
            return _rewrite_origin_github_token(repo, github_token)

        if name == "get_github_repository_metadata":
            if not github_token:
                return {"error": "GITHUB_TOKEN is not set in the environment."}
            repo = _resolve_under_workspace(workspace, str(tool_input["repo_subdir"]))
            slug = _origin_github_owner_repo(repo)
            if slug.get("error"):
                return slug
            return _github_get_repository_metadata(
                github_token, str(slug["owner"]), str(slug["repo"])
            )

        if name == "create_github_pull_request":
            if not github_token:
                return {"error": "GITHUB_TOKEN is not set in the environment."}
            repo = _resolve_under_workspace(workspace, str(tool_input["repo_subdir"]))
            slug = _origin_github_owner_repo(repo)
            if slug.get("error"):
                return slug
            pr = _github_create_pull_request(
                github_token,
                str(slug["owner"]),
                str(slug["repo"]),
                str(tool_input["title"]),
                str(tool_input["head_branch"]),
                str(tool_input["base_branch"]),
                tool_input.get("body"),
                bool(tool_input.get("draft", False)),
            )
            if pr.get("ok"):
                pr = {
                    **pr,
                    "owner": str(slug["owner"]),
                    "repo": str(slug["repo"]),
                }
            return pr

        if name == "list_workspace":
            lines: list[str] = []

            def walk(p: Path, depth: int) -> None:
                if depth > 4:
                    return
                try:
                    for c in sorted(p.iterdir(), key=lambda x: x.name):
                        if c.name.startswith("."):
                            continue
                        rel = c.relative_to(workspace)
                        lines.append(f"{'  ' * depth}{rel.as_posix()}" + ("/" if c.is_dir() else ""))
                        if c.is_dir():
                            walk(c, depth + 1)
                except OSError as e:
                    lines.append(f"{p}: {e}")

            walk(workspace, 0)
            return {"paths": "\n".join(lines)[:12000]}

        return {"error": f"unknown tool: {name}"}
    except Exception as e:
        # Surface unexpected bugs to the model as structured errors instead of crashing the CLI.
        return {"error": str(e)}


def _block_type(block: Any) -> str:
    return getattr(block, "type", None) or (block.get("type") if isinstance(block, dict) else "")


# ---------------------------------------------------------------------------
# Agent loop — Anthropic Messages API with tool_use / tool_result turns
# ---------------------------------------------------------------------------


def run_coding_agent(
    user_prompt: str,
    workspace: Path,
    model: str,
    max_turns: int,
    github_token: str | None,
    repo_registry_path: Path,
    persona_system_suffix: str | None = None,
    persona_dict: dict[str, Any] | None = None,
    agent_progress: bool = True,
    progress_log_path: Path | None = None,
    progress_interval_sec: float = 10.0,
) -> dict[str, Any]:
    load_env()
    api_key = get_anthropic_api_key()
    if not api_key:
        print("ANTHROPIC_API_KEY is required.", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)
    tools = _tool_specs()
    messages: list[dict[str, Any]] = [{"role": "user", "content": user_prompt}]
    last_pr: dict[str, Any] | None = None
    system_text = SYSTEM_PROMPT
    if persona_system_suffix and persona_system_suffix.strip():
        system_text = SYSTEM_PROMPT.rstrip() + "\n\n---\n\n" + persona_system_suffix.strip()

    log_path = progress_log_path or (workspace / "dev-sim-agent-progress.log")
    if agent_progress:
        plog = AgentProgressLogger(log_path, agent_label="coding")
        plog.log_persona_start(persona_dict)
        progress_cm: Any = ProgressAnnouncer(
            plog,
            persona_dict,
            agent_label="coding",
            interval_sec=progress_interval_sec,
        )
    else:
        progress_cm = nullcontext()

    with progress_cm as announcer:
        for _ in range(max_turns):
            if announcer is not None:
                announcer.set_phase("awaiting_model")
            message = client.messages.create(
                model=model,
                max_tokens=8192,
                system=system_text,
                tools=tools,
                messages=messages,
            )

            # Normal completion: print assistant text and exit the loop.
            if message.stop_reason == "end_turn":
                for block in message.content:
                    if _block_type(block) == "text":
                        t = getattr(block, "text", None)
                        if t is None and isinstance(block, dict):
                            t = block.get("text")
                        if t:
                            print(t)
                return {"last_pr": last_pr, "stop": "end_turn"}

            # e.g. max_tokens, refusal — print any text then stop (no tool_results to send).
            if message.stop_reason != "tool_use":
                for block in message.content:
                    if _block_type(block) == "text":
                        t = getattr(block, "text", None)
                        if t is None and isinstance(block, dict):
                            t = block.get("text")
                        if t:
                            print(t)
                if message.stop_reason:
                    print(f"(stop_reason: {message.stop_reason})", file=sys.stderr)
                return {"last_pr": last_pr, "stop": str(message.stop_reason)}

            # Assistant asked for one or more tools: run them and send results in a single user message.
            if announcer is not None:
                announcer.set_phase("running_tools")
            tool_results: list[dict[str, Any]] = []

            for block in message.content:
                if _block_type(block) != "tool_use":
                    continue
                tid = getattr(block, "id", None) or (block.get("id") if isinstance(block, dict) else None)
                tname = getattr(block, "name", None) or (
                    block.get("name") if isinstance(block, dict) else None
                )
                raw_in = getattr(block, "input", None)
                if raw_in is None and isinstance(block, dict):
                    raw_in = block.get("input")
                tinput = raw_in if isinstance(raw_in, dict) else {}
                print(f"[tool] {tname}({json.dumps(tinput)[:500]}…)", file=sys.stderr)
                result = _execute_tool(
                    str(tname), tinput, workspace, github_token, repo_registry_path
                )
                if (
                    tname == "create_github_pull_request"
                    and isinstance(result, dict)
                    and result.get("ok")
                    and result.get("number") is not None
                ):
                    last_pr = {
                        "owner": str(result.get("owner", "")),
                        "repo": str(result.get("repo", "")),
                        "number": int(result["number"]),
                        "html_url": str(result.get("html_url") or ""),
                        "title": str(result.get("title") or ""),
                    }
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tid,
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )

            # Echo assistant message verbatim (required), then attach tool results by tool_use_id.
            messages.append({"role": "assistant", "content": message.content})
            messages.append({"role": "user", "content": tool_results})

        print(f"Stopped after {max_turns} turns (max_turns limit).", file=sys.stderr)
        return {"last_pr": last_pr, "stop": "max_turns"}
