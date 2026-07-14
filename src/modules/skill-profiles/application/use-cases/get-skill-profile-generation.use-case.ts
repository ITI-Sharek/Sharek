import { Injectable } from '@nestjs/common';

import { NotFoundApplicationError } from '../../../../shared/errors/application.error';
import { SkillProfileGenerationDto } from '../dto/skill-profile-generation.dto';
import { SkillProfileGenerationRepository } from '../ports/skill-profile-generation.repository';
import { presentSkillProfileGeneration } from './skill-profile-generation-presenter';

@Injectable()
export class GetSkillProfileGenerationUseCase {
  constructor(
    private readonly generations: SkillProfileGenerationRepository,
  ) {}

  async execute(input: {
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
}
