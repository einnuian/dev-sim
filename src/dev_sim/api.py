"""FastAPI bridge for local UI testing (mock sprint / K2 scores + economy settlement).

Run from the repository root so ``shared/`` and ``src/`` resolve (see ``run_api.py``).
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path
from typing import Any

# ``shared`` lives at repo root; ``dev_sim`` lives under ``src/``. Uvicorn may only put
# ``src`` on ``sys.path``, so normalize before imports that depend on ``shared``.
_API_FILE = Path(__file__).resolve()
_REPO_ROOT = _API_FILE.parents[2]
_SRC_ROOT = _REPO_ROOT / "src"
_src_s, _repo_s = str(_SRC_ROOT), str(_REPO_ROOT)
if _src_s not in sys.path:
    sys.path.insert(0, _src_s)
if _repo_s not in sys.path:
    sys.path.append(_repo_s)

from shared.review_schema import TECHNICAL_SCORE_KEYS

from dev_sim.economy import CompanyState, SettlementStatus

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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


class SprintRequest(BaseModel):
    """One mocked sprint driven from the frontend."""

    project_name: str = Field(..., min_length=1, description="Short label for the engagement.")
    project_spec: str = Field(
        ...,
        description="Natural-language scope (stored for future orchestration; unused in mock math).",
    )
    expected_mrr: float = Field(..., ge=0.0, description="Target MRR if audits averaged 10/10.")
    team_stats_sum: int = Field(
        ...,
        ge=0,
        description="Sum of roster stat points used for burn (matches API burn formula).",
    )


class SprintResponse(BaseModel):
    """Economy outcome after a mocked sprint."""

    project_name: str
    technical_scores: dict[str, int]
    tech_debt_delta: float
    actual_mrr: float
    balance: float
    valuation: float
    tech_debt: float
    hype_multiplier: float
    active_mrr: float
    burn_rate: float
    sprint_month: int
    status: SettlementStatus


app = FastAPI(
    title="DevTeam Simulator API",
    description="Mock sprint + economy settlement for localhost UI development.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/simulate", response_model=SprintResponse)
def simulate_sprint(body: SprintRequest) -> SprintResponse:
    """Load company state, run a **mock** audit + one settlement, persist, return summary."""
    path = company_state_path()
    company = _load_company_or_fresh(path)

    burn_rate = float(body.team_stats_sum) * 1000.0 + 2000.0 + float(company.active_mrr) * 0.10

    mock_scores = _mock_technical_scores()
    impacts: dict[str, Any] = company.evaluate_project(body.expected_mrr, mock_scores)

    tech_delta = float(impacts.get("tech_debt_delta", 0.0))
    company.tech_debt = max(0.0, float(company.tech_debt) + tech_delta)
    company.hype_multiplier = float(impacts.get("next_hype_multiplier", company.hype_multiplier))

    actual_mrr = float(impacts.get("actual_mrr", 0.0))
    status = company.process_sprint_settlement(burn_rate, actual_mrr)

    company.save_state(path)

    return SprintResponse(
        project_name=body.project_name,
        technical_scores=mock_scores,
        tech_debt_delta=tech_delta,
        actual_mrr=actual_mrr,
        balance=float(company.balance),
        valuation=float(company.valuation),
        tech_debt=float(company.tech_debt),
        hype_multiplier=float(company.hype_multiplier),
        active_mrr=float(company.active_mrr),
        burn_rate=burn_rate,
        sprint_month=int(company.sprint_month),
        status=status,
    )


__all__ = ["app", "company_state_path", "SprintRequest", "SprintResponse"]
