import { Injectable } from '@nestjs/common';
import {
  Prisma,
  SkillProfileGeneration,
  SkillProfileGenerationStatus,
} from '@prisma/client';

import {
  CompleteSkillProfileGenerationInput,
  CompleteNeedsMoreEvidenceInput,
  CreateSkillProfileGenerationInput,
  PENDING_SKILL_STATUS,
  SkillProfileGenerationRepository,
  SkillProfileGenerationWithSkills,
} from '../../application/ports/skill-profile-generation.repository';
import { DatabaseService } from '../../../../shared/database/database.service';

@Injectable()
export class PrismaSkillProfileGenerationRepository extends SkillProfileGenerationRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  create(
    input: CreateSkillProfileGenerationInput,
  ): Promise<SkillProfileGeneration> {
    return this.database.skillProfileGeneration.create({
      data: {
        user_id: input.userId,
        selected_repositories: this.toJson(input.selectedRepositories),
        selected_repository_count: input.selectedRepositories.length,
      },
    });
  }

  findById(
    generationId: string,
  ): Promise<SkillProfileGenerationWithSkills | null> {
    return this.database.skillProfileGeneration.findUnique({
      where: {
        id: generationId,
      },
      include: {
        skillProfiles: {
          orderBy: {
            created_at: 'asc',
          },
        },
      },
    });
  }

  findByIdForUser(
    generationId: string,
    userId: string,
  ): Promise<SkillProfileGenerationWithSkills | null> {
    return this.database.skillProfileGeneration.findFirst({
      where: {
        id: generationId,
        user_id: userId,
      },
      include: {
        skillProfiles: {
          orderBy: {
            created_at: 'asc',
          },
        },
      },
    });
  }

  findIncomplete(): Promise<SkillProfileGeneration[]> {
    return this.database.skillProfileGeneration.findMany({
      where: {
        status: {
          in: [
            SkillProfileGenerationStatus.queued,
            SkillProfileGenerationStatus.collecting_evidence,
            SkillProfileGenerationStatus.analyzing,
          ],
        },
      },
      orderBy: {
        created_at: 'asc',
      },
    });
  }

  async updateStatus(
    generationId: string,
    status: SkillProfileGenerationStatus,
    data: {
      snapshottedRepositoryCount?: number;
      evidenceSnapshot?: unknown;
      failureReason?: string | null;
    } = {},
  ): Promise<void> {
    await this.database.skillProfileGeneration.update({
      where: {
        id: generationId,
      },
      data: {
        status,
        snapshotted_repository_count: data.snapshottedRepositoryCount,
        evidence_snapshot:
          data.evidenceSnapshot === undefined
            ? undefined
            : this.toJson(data.evidenceSnapshot),
        failure_reason: data.failureReason,
      },
    });
  }

  async completeWithPendingSkills(
    input: CompleteSkillProfileGenerationInput,
  ): Promise<void> {
    const now = new Date();
    const generation = await this.database.skillProfileGeneration.findUniqueOrThrow({
      where: {
        id: input.generationId,
      },
      select: {
        user_id: true,
      },
    });

    await this.database.$transaction([
      this.database.skillProfile.deleteMany({
        where: {
          generation_id: input.generationId,
        },
      }),
      this.database.skillProfile.updateMany({
        where: {
          user_id: generation.user_id,
          generation_id: {
            not: input.generationId,
          },
          status: PENDING_SKILL_STATUS,
          skill_key: {
            in: input.skills.map((skill) => skill.key),
          },
        },
        data: {
          status: 'superseded',
          superseded_at: now,
        },
      }),
      ...input.skills.map((skill) =>
        this.database.skillProfile.create({
          data: {
            user_id: generation.user_id,
            generation_id: input.generationId,
            skill_name: skill.name,
            skill_key: skill.key,
            proficiency_level: skill.proficiency,
            confidence_score: skill.confidence,
            evidence_summary: skill.evidenceSummary,
            evidence_sources: this.toJson(skill.evidenceSources),
            status: PENDING_SKILL_STATUS,
          },
        }),
      ),
      this.database.skillProfileGeneration.update({
        where: {
          id: input.generationId,
        },
        data: {
          status: SkillProfileGenerationStatus.pending_review,
          evidence_snapshot: this.toJson(input.evidenceSnapshot),
          fraud_signals: this.toJson(input.fraudSignals),
          evidence_quality: input.evidenceQuality,
          provider: input.provider,
          model: input.model,
          prompt_version: input.promptVersion,
          schema_version: input.schemaVersion,
          service_version: input.serviceVersion,
          snapshotted_repository_count: this.countEvidenceSnapshots(
            input.evidenceSnapshot,
          ),
          failure_reason: null,
          completed_at: now,
        },
      }),
    ]);
  }

  async completeNeedsMoreEvidence(
    input: CompleteNeedsMoreEvidenceInput,
  ): Promise<void> {
    await this.database.skillProfileGeneration.update({
      where: {
        id: input.generationId,
      },
      data: {
        status: SkillProfileGenerationStatus.needs_more_evidence,
        evidence_snapshot: this.toJson(input.evidenceSnapshot),
        fraud_signals: this.toJson(input.fraudSignals),
        evidence_quality: input.evidenceQuality,
        provider: input.provider,
        model: input.model,
        prompt_version: input.promptVersion,
        schema_version: input.schemaVersion,
        service_version: input.serviceVersion,
        snapshotted_repository_count: this.countEvidenceSnapshots(
          input.evidenceSnapshot,
        ),
        failure_reason: null,
        completed_at: new Date(),
      },
    });
  }

  async fail(generationId: string, failureReason: string): Promise<void> {
    await this.database.skillProfileGeneration.update({
      where: {
        id: generationId,
      },
      data: {
        status: SkillProfileGenerationStatus.failed,
        failure_reason: failureReason,
        completed_at: new Date(),
      },
    });
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private countEvidenceSnapshots(value: unknown): number | undefined {
    if (Array.isArray(value)) {
      return value.length;
    }

    if (
      typeof value === 'object' &&
      value !== null &&
      'repositories' in value &&
      Array.isArray(value.repositories)
    ) {
      return value.repositories.length;
    }

    return undefined;
  }
}
