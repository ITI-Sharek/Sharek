import { Injectable } from '@nestjs/common';

import { AuthenticatedUser } from '../../../../shared/auth/authenticated-request';
import {
  ApplicationError,
  BadRequestApplicationError,
  ForbiddenApplicationError,
} from '../../../../shared/errors/application.error';
import { SkillProfileGenerationDto } from '../dto/skill-profile-generation.dto';
import { SkillProfileGenerationJobQueue } from '../ports/skill-profile-generation-job-queue';
import { SkillProfileGenerationRepository } from '../ports/skill-profile-generation.repository';
import { presentSkillProfileGeneration } from './skill-profile-generation-presenter';

const MAX_SELECTED_REPOSITORIES = 10;
const GITHUB_FULL_NAME_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

@Injectable()
export class StartSkillProfileGenerationUseCase {
  constructor(
    private readonly generations: SkillProfileGenerationRepository,
    private readonly queue: SkillProfileGenerationJobQueue,
  ) {}

  async execute(input: {
    user: AuthenticatedUser;
    repositories: { fullName: string }[];
  }): Promise<SkillProfileGenerationDto> {
    this.assertContributorCanGenerate(input.user);
    const selectedRepositories = this.normalizeSelection(input.repositories);
    const generation = await this.generations.create({
      userId: input.user.id,
      selectedRepositories,
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

    return presentSkillProfileGeneration(generationWithSkills ?? {
      ...generation,
      skillProfiles: [],
    });
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

  private normalizeSelection(
    repositories: { fullName: string }[],
  ): { fullName: string }[] {
    const fullNames = Array.from(
      new Set(
        repositories.map((repository) =>
          repository.fullName.trim(),
        ),
      ),
    ).sort((left, right) => left.localeCompare(right));

    if (fullNames.length === 0) {
      throw new BadRequestApplicationError(
        'At least one repository must be selected',
        'SKILL_PROFILE_REPOSITORY_SELECTION_REQUIRED',
      );
    }

    if (fullNames.length > MAX_SELECTED_REPOSITORIES) {
      throw new BadRequestApplicationError(
        `Select at most ${MAX_SELECTED_REPOSITORIES} repositories`,
        'SKILL_PROFILE_REPOSITORY_SELECTION_LIMIT_EXCEEDED',
      );
    }

    for (const fullName of fullNames) {
      if (!GITHUB_FULL_NAME_PATTERN.test(fullName)) {
        throw new BadRequestApplicationError(
          'Repository fullName must use owner/repository format',
          'SKILL_PROFILE_REPOSITORY_FULL_NAME_INVALID',
        );
      }
    }

    return fullNames.map((fullName) => ({ fullName }));
  }
}
