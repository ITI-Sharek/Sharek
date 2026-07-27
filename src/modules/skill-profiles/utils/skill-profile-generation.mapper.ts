import { Prisma } from '@prisma/client';

import {
  SkillProfileGenerationDto,
  SkillProfileGenerationRepositorySelectionDto,
} from '../dto/skill-profile-generation.dto';
import { SkillProfileGenerationWithSkills } from '../repositories/skill-profile-generation.repository';

export function presentSkillProfileGeneration(
  generation: SkillProfileGenerationWithSkills,
): SkillProfileGenerationDto {
  return {
    generationId: generation.id,
    status: generation.status,
    progress: {
      selectedRepositoryCount: generation.selected_repository_count,
      snapshottedRepositoryCount: generation.snapshotted_repository_count,
    },
    failureReason: generation.failure_reason,
    installationLinkId: generation.github_app_installation_link_id,
    providerInstallationId: generation.provider_installation_id,
    consentVersion: generation.consent_version,
    consentedAt: generation.consented_at,
    authorizationVerifiedAt: generation.authorization_verified_at,
    retryOfGenerationId: generation.retry_of_generation_id,
    selectedRepositories: readSelectedRepositories(
      generation.selected_repositories,
    ),
    skills: generation.skillProfiles.map((skill) => ({
      id: skill.id,
      name: skill.skill_name,
      proficiency: skill.proficiency_level,
      confidence: skill.confidence_score,
      status: skill.status,
      evidenceSummary: skill.evidence_summary,
    })),
    fraudSignals: Array.isArray(generation.fraud_signals)
      ? generation.fraud_signals
      : [],
    evidenceQuality: generation.evidence_quality,
    provider: generation.provider,
    model: generation.model,
    promptVersion: generation.prompt_version,
    schemaVersion: generation.schema_version,
    serviceVersion: generation.service_version,
    createdAt: generation.created_at,
    updatedAt: generation.updated_at,
    completedAt: generation.completed_at,
  };
}

function readSelectedRepositories(
  value: Prisma.JsonValue,
): SkillProfileGenerationRepositorySelectionDto[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return (value as unknown[])
    .filter(isRecord)
    .map((item) => ({
      repositoryId:
        typeof item.repositoryId === 'string' ? item.repositoryId : '',
      fullName: typeof item.fullName === 'string' ? item.fullName : '',
    }))
    .filter((item) => item.repositoryId.length > 0 && item.fullName.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
