"""dev-sim CLI: argument parsing, .env loading, and delegation to the coding agent."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dev_sim.coding_agent import run_coding_agent, workspace_root
from dev_sim.config import (
    DEFAULT_CODING_MODEL,
    DEFAULT_REPO_REGISTRY,
    K_ANTHROPIC_MODEL,
    get_github_token,
    load_env,
    resolve_coding_model,
)


def main() -> None:
    load_env()

    parser = argparse.ArgumentParser(
        description="Prompt Claude to create a GitHub repo and perform git commits using tools.",
    )
    parser.add_argument(
        "prompt",
        nargs="?",
        help="What you want the agent to do (natural language)",
    )
    parser.add_argument(
        "-p",
        "--prompt-file",
        type=Path,
        help="Read prompt from file",
    )
    parser.add_argument(
        "-w",
        "--workspace",
        type=Path,
        help="Working directory for repos and files (default: ./.dev-sim-workspace)",
    )
    parser.add_argument(
        "-m",
        "--model",
        default=None,
        help=f"Model id (default: {DEFAULT_CODING_MODEL} or {K_ANTHROPIC_MODEL} in env)",
    )
    parser.add_argument(
        "--max-turns",
        type=int,
        default=24,
        help="Maximum agent turns (default: 24)",
    )
    parser.add_argument(
        "--repo-registry",
        type=Path,
        help=(
            "JSON file mapping short repo names to remote URLs for the agent "
            f"(default: ./{DEFAULT_REPO_REGISTRY} under current directory)"
        ),
    )
    args = parser.parse_args()

    if args.prompt_file:
        text = args.prompt_file.read_text(encoding="utf-8").strip()
    elif args.prompt:
        text = args.prompt.strip()
    else:
        print("Provide a prompt as an argument or use --prompt-file.", file=sys.stderr)
        sys.exit(2)

    ws = workspace_root(args.workspace)
    gh = get_github_token()
    model = resolve_coding_model(args.model)
    reg = (
        args.repo_registry.expanduser().resolve()
        if args.repo_registry
        else (Path.cwd() / DEFAULT_REPO_REGISTRY).resolve()
    )
    print(f"Workspace: {ws}", file=sys.stderr)
    print(f"Repo registry: {reg}", file=sys.stderr)
    run_coding_agent(
        text,
        workspace=ws,
        model=model,
        max_turns=args.max_turns,
        github_token=gh,
        repo_registry_path=reg,
    )


if __name__ == "__main__":
    main()
