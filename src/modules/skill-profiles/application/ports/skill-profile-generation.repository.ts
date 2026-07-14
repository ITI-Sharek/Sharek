import {
  SkillProfileGeneration,
  SkillProfileGenerationStatus,
  SkillProfileProficiencyLevel,
  SkillProfileStatus,
  SkillProfile,
} from '@prisma/client';

export type SkillProfileGenerationWithSkills = SkillProfileGeneration & {
  skillProfiles: SkillProfile[];
};

export interface CreateSkillProfileGenerationInput {
  userId: string;
  selectedRepositories: { fullName: string }[];
}

export interface SaveGeneratedSkillInput {
  name: string;
  key: string;
  proficiency: SkillProfileProficiencyLevel;
  confidence: number;
  evidenceSummary: string | null;
  evidenceSources: unknown;
}

export interface CompleteSkillProfileGenerationInput {
  generationId: string;
  skills: SaveGeneratedSkillInput[];
  fraudSignals: unknown;
  evidenceQuality: string | null;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  serviceVersion: string;
  evidenceSnapshot: unknown;
}

export interface CompleteNeedsMoreEvidenceInput {
  generationId: string;
  fraudSignals: unknown;
  evidenceQuality: string;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  serviceVersion: string;
  evidenceSnapshot: unknown;
}

export abstract class SkillProfileGenerationRepository {
  abstract create(
    input: CreateSkillProfileGenerationInput,
  ): Promise<SkillProfileGeneration>;

  abstract findById(
    generationId: string,
  ): Promise<SkillProfileGenerationWithSkills | null>;

  abstract findByIdForUser(
    generationId: string,
    userId: string,
  ): Promise<SkillProfileGenerationWithSkills | null>;

  abstract findIncomplete(): Promise<SkillProfileGeneration[]>;

  abstract updateStatus(
    generationId: string,
    status: SkillProfileGenerationStatus,
    data?: {
      snapshottedRepositoryCount?: number;
      evidenceSnapshot?: unknown;
      failureReason?: string | null;
    },
  ): Promise<void>;

  abstract completeWithPendingSkills(
    input: CompleteSkillProfileGenerationInput,
  ): Promise<void>;

  abstract completeNeedsMoreEvidence(
    input: CompleteNeedsMoreEvidenceInput,
  ): Promise<void>;

  abstract fail(generationId: string, failureReason: string): Promise<void>;
}

export const PENDING_SKILL_STATUS = SkillProfileStatus.pending;
