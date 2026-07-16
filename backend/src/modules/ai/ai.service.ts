import { Injectable } from '@nestjs/common';

import {
  SkillProfileInput,
  SkillProfileResult,
} from './dto/skill-profile-ai.dto';
import { FastApiSkillProfileClient } from './integrations/fastapi-skill-profile.client';

@Injectable()
export class AiService {
  constructor(private readonly skillProfileClient: FastApiSkillProfileClient) {}

  generateSkillProfile(input: SkillProfileInput): Promise<SkillProfileResult> {
    return this.skillProfileClient.generate(input);
  }
}
