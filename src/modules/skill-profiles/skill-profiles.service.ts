import { Injectable } from '@nestjs/common';
import { SkillProfileGenerationStatus } from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import {
  ApplicationError,
  BadRequestApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../shared/errors/application.error';
import { SkillProfileGenerationDto } from './dto/skill-profile-generation.dto';
import { GitHubAppService } from '../github/services/github-app.service';
import { SkillProfileGenerationQueue } from './jobs/skill-profile-generation.queue';
import { SkillProfileGenerationRepository } from './repositories/skill-profile-generation.repository';
import { presentSkillProfileGeneration } from './utils/skill-profile-generation.mapper';

const MAX_SELECTED_REPOSITORIES = 10;
const CONSENT_VERSION = 'github-skill-analysis-v1';

@Injectable()
export class SkillProfilesService {
  constructor(
    private readonly generations: SkillProfileGenerationRepository,
    private readonly queue: SkillProfileGenerationQueue,
    private readonly gitHubAppService: GitHubAppService,
  ) {}

  async startGeneration(input: {
    user: AuthenticatedUser;
    installationLinkId: string;
    repositoryIds: string[];
    consent: { accepted: boolean; version: string };
  }): Promise<SkillProfileGenerationDto> {
    this.assertContributorCanGenerate(input.user);
    this.assertConsent(input.consent);
    const repositoryIds = this.normalizeSelection(input.repositoryIds);
    await this.assertNoActiveGeneration(input.user.id);
    const authorization = await this.gitHubAppService.verifyRepositorySelection(
      input.user.id,
      input.installationLinkId,
      repositoryIds,
    );
    const generation = await this.generations.create({
      userId: input.user.id,
      installationLinkId: authorization.installationLinkId,
      providerInstallationId: authorization.providerInstallationId,
      selectedRepositories: authorization.repositories,
      consentVersion: input.consent.version,
      consentedAt: new Date(),
      authorizationVerifiedAt: authorization.verifiedAt,
    });
    const generationWithSkills = await this.generations.findByIdForUser(
      generation.id,
      input.user.id,
    );

    try {
      await this.queue.enqueue(generation.id);
    } catch {
      await this.generations.fail(
        generation.id,
        'Skill profile analysis could not be queued. Please try again.',
      );
      throw new ApplicationError(
        'Skill profile analysis is temporarily unavailable',
        'SKILL_PROFILE_QUEUE_UNAVAILABLE',
        503,
      );
    }

    return presentSkillProfileGeneration(
      generationWithSkills ?? { ...generation, skillProfiles: [] },
    );
  }

  async retryGeneration(input: {
    user: AuthenticatedUser;
    generationId: string;
    consent: { accepted: boolean; version: string };
  }): Promise<SkillProfileGenerationDto> {
    this.assertContributorCanGenerate(input.user);
    this.assertConsent(input.consent);
    await this.assertNoActiveGeneration(input.user.id);
    const prior = await this.generations.findByIdForUser(
      input.generationId,
      input.user.id,
    );
    const retryableStatuses: SkillProfileGenerationStatus[] = [
      SkillProfileGenerationStatus.failed,
      SkillProfileGenerationStatus.needs_more_evidence,
    ];
    if (!prior || !retryableStatuses.includes(prior.status)) {
      throw new ApplicationError(
        'Skill profile generation cannot be retried',
        'SKILL_PROFILE_GENERATION_NOT_RETRYABLE',
        prior ? 409 : 404,
      );
    }
    if (!prior.github_app_installation_link_id) {
      throw new ApplicationError(
        'A GitHub App installation is required',
        'SKILL_PROFILE_INSTALLATION_REQUIRED',
        409,
      );
    }
    const repositoryIds = this.readRepositoryIds(prior.selected_repositories);
    const authorization = await this.gitHubAppService.verifyRepositorySelection(
      input.user.id,
      prior.github_app_installation_link_id,
      repositoryIds,
    );
    const generation = await this.generations.create({
      userId: input.user.id,
      installationLinkId: authorization.installationLinkId,
      providerInstallationId: authorization.providerInstallationId,
      selectedRepositories: authorization.repositories,
      consentVersion: input.consent.version,
      consentedAt: new Date(),
      authorizationVerifiedAt: authorization.verifiedAt,
      retryOfGenerationId: prior.id,
    });
    try {
      await this.queue.enqueue(generation.id);
    } catch {
      await this.generations.fail(generation.id, 'Skill profile analysis could not be queued. Please try again.');
      throw new ApplicationError(
        'Skill profile analysis is temporarily unavailable',
        'SKILL_PROFILE_QUEUE_UNAVAILABLE',
        503,
      );
    }
    const withSkills = await this.generations.findByIdForUser(
      generation.id,
      input.user.id,
    );
    return presentSkillProfileGeneration(withSkills ?? { ...generation, skillProfiles: [] });
  }

  async getGeneration(input: {
    userId: string;
    generationId: string;
  }): Promise<SkillProfileGenerationDto> {
    const generation = await this.generations.findByIdForUser(
      input.generationId,
      input.userId,
    );

    if (!generation) {
      throw new NotFoundApplicationError(
        'Skill profile generation was not found',
        'SKILL_PROFILE_GENERATION_NOT_FOUND',
      );
    }

    return presentSkillProfileGeneration(generation);
  }

  async getLatestGeneration(userId: string): Promise<SkillProfileGenerationDto> {
    const generation = await this.generations.findLatestForUser(userId);
    if (!generation) {
      throw new NotFoundApplicationError(
        'No skill profile generation was found',
        'SKILL_PROFILE_GENERATION_NOT_FOUND',
      );
    }
    return presentSkillProfileGeneration(generation);
  }

  private assertContributorCanGenerate(user: AuthenticatedUser): void {
    if (user.role !== 'contributor') {
      throw new ForbiddenApplicationError(
        'Only contributors can generate skill profiles',
        'SKILL_PROFILE_GENERATION_FORBIDDEN',
      );
    }

    if (user.status === 'suspended' || user.status === 'deactivated') {
      throw new ForbiddenApplicationError(
        'This account cannot generate skill profiles',
        'SKILL_PROFILE_GENERATION_FORBIDDEN',
      );
    }
  }

  private normalizeSelection(repositoryIds: string[]): string[] {
    const normalized = repositoryIds.map((repositoryId) => repositoryId.trim());
    if (normalized.length === 0) {
      throw new BadRequestApplicationError(
        'At least one repository must be selected',
        'SKILL_PROFILE_REPOSITORY_SELECTION_REQUIRED',
      );
    }

    if (normalized.length > MAX_SELECTED_REPOSITORIES) {
      throw new BadRequestApplicationError(
        `Select at most ${MAX_SELECTED_REPOSITORIES} repositories`,
        'SKILL_PROFILE_REPOSITORY_SELECTION_LIMIT_EXCEEDED',
      );
    }

    if (new Set(normalized).size !== normalized.length) {
      throw new BadRequestApplicationError(
        'Repository IDs must be unique',
        'SKILL_PROFILE_REPOSITORY_SELECTION_DUPLICATE',
      );
    }
    if (normalized.some((repositoryId) => !/^\d+$/.test(repositoryId))) {
      throw new BadRequestApplicationError(
        'Repository IDs must be immutable GitHub numeric IDs',
        'SKILL_PROFILE_REPOSITORY_ID_INVALID',
      );
    }
    return normalized.sort((left, right) => left.localeCompare(right));
  }

  private assertConsent(consent: { accepted: boolean; version: string }): void {
    if (!consent.accepted || consent.version !== CONSENT_VERSION) {
      throw new BadRequestApplicationError(
        'Explicit current-version consent is required',
        'SKILL_PROFILE_ANALYSIS_CONSENT_REQUIRED',
      );
    }
  }

  private async assertNoActiveGeneration(userId: string): Promise<void> {
    const activeGeneration = await this.generations.findActiveForUser(userId);
    if (activeGeneration) {
      throw new ApplicationError(
        'A skill profile generation is already active',
        'SKILL_PROFILE_GENERATION_ALREADY_ACTIVE',
        409,
        { generationId: activeGeneration.id },
      );
    }
  }

  private readRepositoryIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) =>
      item && typeof item === 'object' &&
      typeof (item as Record<string, unknown>).repositoryId === 'string'
        ? [(item as Record<string, string>).repositoryId]
        : [],
    );
  }
}
