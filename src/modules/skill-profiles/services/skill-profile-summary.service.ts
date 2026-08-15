import { Injectable, Optional } from '@nestjs/common';
import { Prisma, SkillProfileStatus } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { GitHubAppService } from '../../github/services/github-app.service';
import { SkillProfileEligibilitySkillDto } from '../dto/admin-skill-review.dto';
import { toBoundedSkillEvidenceSources } from '../utils/skill-profile-evidence-projection.util';

export interface SkillProfileSummaryDto {
  name: string;
  proficiencyLevel: 'beginner' | 'intermediate' | 'advanced';
  confidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'disputed' | 'superseded';
  evidenceSummary: string | null;
}

export interface ContributorMatchingSkillSnapshot {
  skillProfileId: string;
  name: string;
  proficiency: 'beginner' | 'intermediate' | 'advanced';
  confidence: number;
  evidenceIds: string[];
  evidenceSummary: string | null;
}

export interface ContributorMatchingCandidateSnapshot {
  contributorId: string;
  displayName: string;
  username: string | null;
  approvedSkills: ContributorMatchingSkillSnapshot[];
}

@Injectable()
export class SkillProfileSummaryService {
  constructor(
    private readonly database: DatabaseService,
    @Optional() private readonly githubApp?: GitHubAppService,
  ) {}

  async listApprovedSkillsForEligibility(
    userId: string,
  ): Promise<SkillProfileEligibilitySkillDto[]> {
    const skills = await this.database.skillProfile.findMany({
      where: {
        user_id: userId,
        status: SkillProfileStatus.approved,
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    return skills.map((skill) => this.toEligibilitySkill(skill));
  }

  async listApprovedContributorMatchingSnapshots(): Promise<
    ContributorMatchingCandidateSnapshot[]
  > {
    const skills = await this.database.skillProfile.findMany({
      where: {
        status: SkillProfileStatus.approved,
        user: { role: 'contributor', status: 'active' },
      },
      select: {
        id: true,
        user_id: true,
        skill_name: true,
        proficiency_level: true,
        confidence_score: true,
        evidence_summary: true,
        evidence_sources: true,
        user: {
          select: { first_name: true, last_name: true, username: true },
        },
      },
      orderBy: [{ user_id: 'asc' }, { created_at: 'asc' }],
    });
    const byContributor = new Map<
      string,
      ContributorMatchingCandidateSnapshot
    >();
    for (const skill of skills) {
      const candidate = byContributor.get(skill.user_id) ?? {
        contributorId: skill.user_id,
        displayName: `${skill.user.first_name} ${skill.user.last_name}`.trim(),
        username: skill.user.username,
        approvedSkills: [],
      };
      candidate.approvedSkills.push({
        skillProfileId: skill.id,
        name: skill.skill_name,
        proficiency: skill.proficiency_level,
        confidence: skill.confidence_score,
        evidenceIds: toBoundedSkillEvidenceSources(skill.evidence_sources)
          .evidenceIds,
        evidenceSummary: skill.evidence_summary,
      });
      byContributor.set(skill.user_id, candidate);
    }
    return [...byContributor.values()];
  }

  async listAuthorizedSkillsForApplicationSnapshot(
    userId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<SkillProfileEligibilitySkillDto[]> {
    if (!this.githubApp) return [];
    const skills = await transaction.skillProfile.findMany({
      where: {
        user_id: userId,
        status: SkillProfileStatus.approved,
      },
      include: { generation: true },
      orderBy: { created_at: 'asc' },
    });
    const authorizedGenerationIds = new Set<string>();
    const rejectedGenerationIds = new Set<string>();
    for (const skill of skills) {
      const generation = skill.generation;
      if (
        !generation ||
        generation.user_id !== userId ||
        !generation.github_app_installation_link_id ||
        !generation.consented_at ||
        !generation.authorization_verified_at ||
        rejectedGenerationIds.has(generation.id)
      ) {
        continue;
      }
      if (!authorizedGenerationIds.has(generation.id)) {
        const authorized =
          await this.githubApp.lockRepositorySelectionAuthorization({
            userId,
            installationLinkId: generation.github_app_installation_link_id,
            repositoryIds: this.readRepositoryIds(
              generation.selected_repositories,
            ),
            transaction,
          });
        (authorized ? authorizedGenerationIds : rejectedGenerationIds).add(
          generation.id,
        );
      }
    }
    return skills
      .filter((skill) =>
        skill.generation
          ? authorizedGenerationIds.has(skill.generation.id)
          : false,
      )
      .map((skill) => this.toEligibilitySkill(skill));
  }

  async listSkillsForProfile(
    userId: string,
    options: { includeGenerated: boolean },
  ): Promise<SkillProfileSummaryDto[]> {
    const skills = await this.database.skillProfile.findMany({
      where: {
        user_id: userId,
        ...(options.includeGenerated
          ? {
              status: {
                not: SkillProfileStatus.superseded,
              },
            }
          : {
              status: SkillProfileStatus.approved,
            }),
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    return skills.map((skill) => ({
      name: skill.skill_name,
      proficiencyLevel: skill.proficiency_level,
      confidence: skill.confidence_score,
      status: skill.status,
      evidenceSummary: options.includeGenerated ? skill.evidence_summary : null,
    }));
  }

  private toEligibilitySkill(skill: {
    id: string;
    skill_name: string;
    skill_key: string | null;
    proficiency_level: 'beginner' | 'intermediate' | 'advanced';
    confidence_score: number;
    evidence_summary: string | null;
    evidence_sources: Prisma.JsonValue | null;
  }): SkillProfileEligibilitySkillDto {
    return {
      skillProfileId: skill.id,
      name: skill.skill_name,
      skillKey: skill.skill_key,
      proficiencyLevel: skill.proficiency_level,
      confidence: skill.confidence_score,
      evidenceSummary: skill.evidence_summary,
      evidenceSources: toBoundedSkillEvidenceSources(skill.evidence_sources),
    };
  }

  private readRepositoryIds(value: Prisma.JsonValue): string[] {
    if (!Array.isArray(value)) return [];
    return Array.from(
      new Set(
        value.flatMap((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item))
            return [];
          const repositoryId = (item as Record<string, unknown>).repositoryId;
          return typeof repositoryId === 'string' && /^\d+$/.test(repositoryId)
            ? [repositoryId]
            : [];
        }),
      ),
    );
  }
}
