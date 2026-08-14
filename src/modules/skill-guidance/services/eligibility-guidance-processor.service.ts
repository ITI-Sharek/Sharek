import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../../../shared/database/database.service';
import { AiService } from '../../ai/ai.service';
import { BlockingSkillDto } from '../../eligibility/dto/eligibility.dto';
import { SkillProfileSummaryService } from '../../skill-profiles/services/skill-profile-summary.service';
import { EligibilityGuidanceService } from './eligibility-guidance.service';

@Injectable()
export class EligibilityGuidanceProcessorService {
  private readonly logger = new Logger(
    EligibilityGuidanceProcessorService.name,
  );

  constructor(
    private readonly database: DatabaseService,
    private readonly skills: SkillProfileSummaryService,
    private readonly ai: AiService,
    private readonly guidance: EligibilityGuidanceService,
  ) {}

  /**
   * Generate the narrative for one recorded block.
   *
   * Never throws for a provider outcome: a failure is recorded as `failed` and
   * the job resolves. The contributor keeps the deterministic blocking-skill
   * list either way — losing the narrative is a degraded answer, losing the
   * reason would be a broken promise.
   */
  async process(guidanceId: string): Promise<void> {
    const row = await this.database.eligibilityGuidance.findUnique({
      where: { id: guidanceId },
    });
    // Already answered, or the contributor's rows were removed. Not an error.
    if (!row || row.status !== 'pending') return;

    const blockingSkills = (
      Array.isArray(row.blocking_skills) ? row.blocking_skills : []
    ) as unknown as BlockingSkillDto[];

    try {
      const approvedSkills = await this.skills.listApprovedSkillsForEligibility(
        row.contributor_id,
      );

      // The gap is expressed as requirement snapshots, so the existing
      // guidance contract is reused unchanged rather than forked for this
      // trigger. Each blocking skill becomes one requirement the contributor
      // did not meet — which is exactly what it is.
      const requirements = blockingSkills.map((skill, position) => ({
        id: `blocking:${skill.skillName}`,
        kind: 'required' as const,
        position,
        text: `${skill.skillName} at ${skill.requiredLevel} level`,
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
        label: 'Blocking skill requirement',
        summary: requirement.text,
      }));
      const skillEvidence = skillSnapshots.map((skill) => ({
        evidenceId: skill.evidenceId,
        type: 'approved_skill' as const,
        label: skill.name,
        summary: skill.evidenceSummary ?? undefined,
      }));

      const result = await this.ai.requestSkillGapGuidance({
        guidanceRequestId: randomUUID(),
        requirements,
        approvedSkills: skillSnapshots,
        evidence: [...requirementEvidence, ...skillEvidence],
        allowedEvidenceIds: [
          ...requirementEvidence.map((item) => item.evidenceId),
          ...skillEvidence.map((item) => item.evidenceId),
        ],
        requestedAt: new Date().toISOString(),
        contractVersion: 'skill-gap-guidance-v1',
      });

      // `no_assessable_evidence` and `system_limit` are honest non-answers, not
      // narratives. Recording either as `ready` would show the contributor an
      // empty guidance panel and call it help.
      if (result.kind !== 'completed') {
        await this.guidance.recordFailure(guidanceId);
        return;
      }

      await this.guidance.recordResult({
        guidanceId,
        narrative: this.toNarrative(result.improvementPath),
        recommendations: {
          missingSkills: result.missingSkills,
          recommendedTechnologies: result.recommendedTechnologies,
          learningResources: result.learningResources,
          practiceProjects: result.practiceProjects,
        },
        modelUsed: result.metadata?.model ?? null,
      });
    } catch (error) {
      this.logger.warn(
        `Skill-gap guidance provider failed for ${guidanceId}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.guidance.recordFailure(guidanceId);
    }
  }

  private toNarrative(
    steps: Array<{ description?: string; step?: string }> | undefined,
  ): string | null {
    if (!steps?.length) return null;
    const lines = steps
      .map((step) => step.description ?? step.step ?? '')
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.length > 0 ? lines.join('\n') : null;
  }
}
