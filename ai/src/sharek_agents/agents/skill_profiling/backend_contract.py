"""Adapter for the NestJS backend's skill-profile contract.

The backend calls ``POST /skill-profiles/generate`` (see
``backend/src/modules/ai/integrations/fastapi-skill-profile.client.ts``) and
validates the response strictly: every skill must cite evidence IDs taken from
the request, proficiency/evidence-quality/recommendation are closed enums, and
provider/model/prompt/schema/service versions are required. This module maps
the internal :class:`AgentResponse` onto that contract.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from sharek_agents.agents.skill_profiling.schemas import AgentResponse, GeneralSkill
from sharek_agents.config import settings

PROVIDER = "openrouter"
PROMPT_VERSION = "skill-profiling-v1"
SCHEMA_VERSION = "1.0.0"
SERVICE_VERSION = "0.1.0"

_LEVEL_TO_PROFICIENCY: dict[str, str] = {
    "beginner": "beginner",
    "mid-level": "intermediate",
    "advanced": "advanced",
    "expert": "advanced",
}


class RepositoryEvidenceInput(BaseModel):
    model_config = ConfigDict(extra="allow")

    evidenceId: str
    fullName: str
    htmlUrl: str


class SkillProfileGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    contributorId: str
    githubLogin: str
    generationId: str
    selectedRepositories: list[RepositoryEvidenceInput] = Field(min_length=1)
    requestedAt: str


class BackendSkillCandidate(BaseModel):
    name: str
    proficiency: Literal["beginner", "intermediate", "advanced"]
    confidence: float
    evidenceIds: list[str]
    evidenceSummary: str | None = None
    limitations: list[str] | None = None


class BackendFraudSignal(BaseModel):
    code: str
    severity: Literal["low", "medium", "high"]
    message: str
    repositoryFullName: str | None = None


class SkillProfileGenerateResponse(BaseModel):
    skills: list[BackendSkillCandidate]
    fraudSignals: list[BackendFraudSignal]
    evidenceQuality: Literal["strong", "medium", "weak"]
    recommendation: Literal["pending_review", "needs_more_evidence"]
    provider: str
    model: str
    promptVersion: str
    schemaVersion: str
    serviceVersion: str


def _clamp_confidence(value: float | None) -> float:
    if value is None:
        return 0.0
    return max(0.0, min(1.0, value))


def _proficiency(level: str) -> str:
    return _LEVEL_TO_PROFICIENCY.get(level.lower(), "beginner")


def _resolved_evidence_ids(
    request: SkillProfileGenerateRequest,
    unresolved_repos: list[dict],
) -> list[str]:
    """Evidence IDs of request repositories the agent actually profiled.

    ``unresolved_repos`` entries are loosely shaped dicts, so a repository is
    treated as unresolved when any of its string values matches the request
    repo's URL or full name. Falls back to every requested ID because the
    backend rejects skills that cite no evidence.
    """
    unresolved: set[str] = set()
    for entry in unresolved_repos:
        unresolved.update(v for v in entry.values() if isinstance(v, str))

    resolved = [
        repo.evidenceId
        for repo in request.selectedRepositories
        if repo.htmlUrl not in unresolved and repo.fullName not in unresolved
    ]
    return resolved or [repo.evidenceId for repo in request.selectedRepositories]


def map_agent_response(
    request: SkillProfileGenerateRequest,
    agent: AgentResponse,
) -> SkillProfileGenerateResponse:
    if agent.status == "failed":
        return _empty_response()

    evidence_ids = _resolved_evidence_ids(request, agent.unresolved_repos)
    skills: list[BackendSkillCandidate] = []

    general_skills: list[GeneralSkill | None] = [
        agent.clean_code,
        agent.software_design_architecture,
        agent.code_quality_maintainability,
        agent.implementation,
        agent.testing_practices,
    ]
    for general in general_skills:
        if general is None:
            continue
        skills.append(
            BackendSkillCandidate(
                name=general.name[:100],
                proficiency=_proficiency(general.level),
                confidence=_clamp_confidence(general.confidence),
                evidenceIds=evidence_ids,
                evidenceSummary=general.explanation or None,
                limitations=None,
            )
        )

    for framework in agent.framework_skills:
        skills.append(
            BackendSkillCandidate(
                name=framework.name[:100],
                proficiency=_proficiency(framework.level),
                confidence=_clamp_confidence(framework.confidence),
                evidenceIds=evidence_ids,
                evidenceSummary=framework.evidence or None,
                limitations=None,
            )
        )

    if not skills:
        return _empty_response()

    overall = (
        _clamp_confidence(agent.confidence)
        if agent.confidence is not None
        else sum(skill.confidence for skill in skills) / len(skills)
    )
    if overall >= 0.75:
        evidence_quality = "strong"
    elif overall >= 0.5:
        evidence_quality = "medium"
    else:
        evidence_quality = "weak"

    return SkillProfileGenerateResponse(
        skills=skills,
        fraudSignals=[],
        evidenceQuality=evidence_quality,
        recommendation="pending_review" if overall >= 0.5 else "needs_more_evidence",
        provider=PROVIDER,
        model=settings.default_model,
        promptVersion=PROMPT_VERSION,
        schemaVersion=SCHEMA_VERSION,
        serviceVersion=SERVICE_VERSION,
    )


def _empty_response() -> SkillProfileGenerateResponse:
    return SkillProfileGenerateResponse(
        skills=[],
        fraudSignals=[],
        evidenceQuality="weak",
        recommendation="needs_more_evidence",
        provider=PROVIDER,
        model=settings.default_model,
        promptVersion=PROMPT_VERSION,
        schemaVersion=SCHEMA_VERSION,
        serviceVersion=SERVICE_VERSION,
    )
