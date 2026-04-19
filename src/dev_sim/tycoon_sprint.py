"""Mock sprint + :class:`CompanyState` settlement (shared by FastAPI and ``dev_sim_bridge``)."""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path
from typing import Any

# ``shared`` lives at repository root (not under ``src/``).
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.append(str(_REPO_ROOT))

from shared.review_schema import TECHNICAL_SCORE_KEYS

from dev_sim.economy import CompanyState, SettlementStatus

DEFAULT_STATE_REL = Path(".dev-sim") / "company-state.json"


def company_state_path() -> Path:
    """JSON path for :class:`CompanyState` (under repo ``.dev-sim/``)."""
    return _REPO_ROOT / DEFAULT_STATE_REL


def _load_company_or_fresh(path: Path) -> CompanyState:
    if not path.is_file():
        return CompanyState()
    try:
        return CompanyState.load_state(path)
    except (json.JSONDecodeError, OSError, TypeError, ValueError):
        return CompanyState()


def _mock_technical_scores() -> dict[str, int]:
    """Random rubric scores for rapid UI iteration (no K2 / Claude)."""
    return {k: random.randint(1, 10) for k in TECHNICAL_SCORE_KEYS}


def run_mock_sprint(
    project_name: str,
    project_spec: str,
    expected_mrr: float,
    team_stats_sum: int,
) -> dict[str, Any]:
    """Load ledger, run one mock audit + settlement, persist, return a JSON-serializable summary.

    ``project_name`` and ``project_spec`` are echoed for callers; settlement math is unchanged
    if they differ (reserved for future orchestration metadata).

    Args:
        project_name: Short label for the engagement.
        project_spec: Scope text (unused in current math).
        expected_mrr: Target MRR if the mock audit averaged 10/10.
        team_stats_sum: Sum of roster stat points for the sprint burn formula.

    Returns:
        Keys: ``project_name``, ``project_spec``, ``technical_scores``, ``tech_debt_delta``,
        ``actual_mrr``, ``balance``, ``valuation``, ``tech_debt``, ``hype_multiplier``,
        ``active_mrr``, ``burn_rate``, ``sprint_month``, ``status`` (see :class:`SettlementStatus`).
    """
    path = company_state_path()
    company = _load_company_or_fresh(path)

    burn_rate = float(team_stats_sum) * 1000.0 + 2000.0 + float(company.active_mrr) * 0.10

    mock_scores = _mock_technical_scores()
    impacts: dict[str, Any] = company.evaluate_project(expected_mrr, mock_scores)

    tech_delta = float(impacts.get("tech_debt_delta", 0.0))
    company.tech_debt = max(0.0, float(company.tech_debt) + tech_delta)
    company.hype_multiplier = float(impacts.get("next_hype_multiplier", company.hype_multiplier))

    actual_mrr = float(impacts.get("actual_mrr", 0.0))
    status: SettlementStatus = company.process_sprint_settlement(burn_rate, actual_mrr)

    company.save_state(path)

    return {
        "project_name": str(project_name).strip(),
        "project_spec": str(project_spec or ""),
        "technical_scores": mock_scores,
        "tech_debt_delta": tech_delta,
        "actual_mrr": actual_mrr,
        "balance": float(company.balance),
        "valuation": float(company.valuation),
        "tech_debt": float(company.tech_debt),
        "hype_multiplier": float(company.hype_multiplier),
        "active_mrr": float(company.active_mrr),
        "burn_rate": burn_rate,
        "sprint_month": int(company.sprint_month),
        "status": status,
    }


__all__ = [
    "company_state_path",
    "run_mock_sprint",
]
