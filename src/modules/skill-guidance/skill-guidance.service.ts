import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import {
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../shared/errors/application.error';
import { AiService } from '../ai/ai.service';
import { SkillGapGuidanceResult } from '../ai/dto/skill-gap-guidance.dto';
import { SkillGapGuidanceContextService } from '../contribution-tasks/services/skill-gap-guidance-context.service';
import { SkillProfileSummaryService } from '../skill-profiles/services/skill-profile-summary.service';

@Injectable()
export class SkillGapGuidanceService {
  constructor(
    private readonly taskContext: SkillGapGuidanceContextService,
    private readonly skills: SkillProfileSummaryService,
    private readonly ai: AiService,
  ) {}

  async generate(
    actor: AuthenticatedUser,
    contributionRequestId: string,
  ): Promise<SkillGapGuidanceResult> {
    this.assertCanRequestGuidance(actor);
    const request = await this.taskContext.getPublishedRequest(
      contributionRequestId,
    );
    if (!request) {
      throw new NotFoundApplicationError(
        'Contribution Request was not found',
        'CONTRIBUTION_REQUEST_NOT_FOUND',
      );
    }

    const approvedSkills =
      await this.skills.listApprovedSkillsForEligibility(actor.id);
    const requirements = request.requirements.map((requirement) => ({
      id: requirement.id,
      kind: requirement.kind,
      position: requirement.position,
      text: requirement.text,
    }));
    const skillSnapshots = approvedSkills.map((skill) => ({
      evidenceId: `skill:${skill.skillProfileId}`,
      name: skill.name,
      proficiency: skill.proficiencyLevel,
      evidenceSummary: skill.evidenceSummary,
    }));
    const requirementEvidence = requirements.map((requirement) => ({
      evidenceId: `requirement:${requirement.id}`,
      type: 'contribution_requirement' as const,
      label: 'Contribution Request requirement',
      summary: requirement.text,
    }));
    const skillEvidence = skillSnapshots.map((skill) => ({
      evidenceId: skill.evidenceId,
      type: 'approved_skill' as const,
      label: skill.name,
      summary: skill.evidenceSummary ?? undefined,
    }));
    const allowedEvidenceIds = [
      ...requirementEvidence.map((item) => item.evidenceId),
      ...skillEvidence.map((item) => item.evidenceId),
    ];

    return this.ai.requestSkillGapGuidance({
      guidanceRequestId: randomUUID(),
      requirements,
      approvedSkills: skillSnapshots,
      evidence: [...requirementEvidence, ...skillEvidence],
      allowedEvidenceIds,
      requestedAt: new Date().toISOString(),
      contractVersion: 'skill-gap-guidance-v1',
    });
  }

  private assertCanRequestGuidance(actor: AuthenticatedUser): void {
    if (actor.role !== 'contributor' || actor.status !== 'active') {
      throw new ForbiddenApplicationError(
        'An active contributor account is required for skill-gap guidance',
        'SKILL_GAP_GUIDANCE_FORBIDDEN',
      );
    }
  }
}
