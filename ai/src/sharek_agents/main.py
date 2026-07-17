import asyncio
import sys

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from sharek_agents.agents.skill_profiling.backend_contract import (
    SkillProfileGenerateRequest,
    SkillProfileGenerateResponse,
    map_agent_response,
)
from sharek_agents.agents.skill_profiling.router import profile_repos
from sharek_agents.agents.skill_profiling.schemas import AgentResponse
from sharek_agents.common.logging import get_logger


logger = get_logger(__name__)

app = FastAPI(title="SHARE-K AI Agents")


@app.on_event("startup")
async def check_external_tools():
    for tool, args in [
        ("graphify", [sys.executable, "-m", "graphify", "--version"]),
        ("git", ["git", "--version"]),
    ]:
        proc = await asyncio.create_subprocess_exec(
            *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            logger.warning(
                "TOOL MISSING: '%s' is not available — %s",
                tool,
                stderr.decode().strip() or stdout.decode().strip(),
            )
        else:
            logger.info("Tool found: %s", stdout.decode().strip())


class ProfileRequest(BaseModel):
    repo_urls: list[str] = Field(description="List of GitHub repository URLs")
    github_username: str = Field(description="GitHub username for commit filtering")


@app.post("/profile/repos", response_model=AgentResponse)
async def profile_repos_endpoint(body: ProfileRequest):
    return await profile_repos(body.repo_urls, github_username=body.github_username)


@app.post("/skill-profiles/generate", response_model=SkillProfileGenerateResponse)
async def generate_skill_profile(body: SkillProfileGenerateRequest):
    """Contract endpoint for the NestJS backend's FastApiSkillProfileClient."""
    agent_response = await profile_repos(
        [repo.htmlUrl for repo in body.selectedRepositories],
        github_username=body.githubLogin,
    )
    if (
        agent_response.status == "failed"
        and agent_response.error is not None
        and agent_response.error.retryable
    ):
        raise HTTPException(status_code=503, detail=agent_response.error.message)
    return map_agent_response(body, agent_response)


@app.get("/health")
async def health():
    return {"status": "ok"}
