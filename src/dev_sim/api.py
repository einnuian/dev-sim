"""Optional FastAPI dev server for the tycoon mock sprint (same logic as ``dev_sim_bridge``).

For day-to-day CEO UI, prefer ``python -m dev_sim_bridge`` on port 8765 (``POST /api/simulate``).
"""

from __future__ import annotations

import sys
from pathlib import Path

_SRC_ROOT = Path(__file__).resolve().parents[1]
_repo_s = str(Path(__file__).resolve().parents[2])
if str(_SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(_SRC_ROOT))
if _repo_s not in sys.path:
    sys.path.append(_repo_s)

from dev_sim.economy import SettlementStatus
from dev_sim.tycoon_sprint import company_state_path, run_mock_sprint

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="DevTeam Simulator API",
    description="Dev-only FastAPI wrapper around ``run_mock_sprint`` (bridge is canonical).",
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


class SprintRequest(BaseModel):
    """One mocked sprint driven from the frontend."""

    project_name: str = Field(..., min_length=1, description="Short label for the engagement.")
    project_spec: str = Field(
        default="",
        description="Natural-language scope (reserved for future orchestration).",
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
    project_spec: str = ""
    technical_scores: dict[str, int]
    tech_debt_delta: float
    actual_mrr: float
    balance: float
    valuation: float
    tech_debt: float
    hype_multiplier: float
    active_mrr: float
    pending_recurring_mrr: float = 0.0
    burn_rate: float
    sprint_month: int
    status: SettlementStatus


@app.post("/api/simulate", response_model=SprintResponse)
def simulate_sprint(body: SprintRequest) -> SprintResponse:
    """Thin wrapper: delegates to :func:`dev_sim.tycoon_sprint.run_mock_sprint`."""
    data = run_mock_sprint(
        body.project_name,
        body.project_spec,
        body.expected_mrr,
        body.team_stats_sum,
    )
    return SprintResponse(**data)


__all__ = ["app", "company_state_path", "SprintRequest", "SprintResponse", "run_mock_sprint"]
