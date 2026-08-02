import { Injectable, Optional } from '@nestjs/common';

import {
  SkillProfileInput,
  SkillProfileResult,
} from './dto/skill-profile-ai.dto';
import {
  AdvisoryFitAssessmentInput,
  AdvisoryFitAssessmentResult,
} from './dto/advisory-fit-assessment.dto';
import { AdvisoryFitClient } from './integrations/advisory-fit.client';
import { FastApiSkillProfileClient } from './integrations/fastapi-skill-profile.client';

@Injectable()
export class AiService {
  constructor(
    private readonly skillProfileClient: FastApiSkillProfileClient,
    @Optional() private readonly advisoryFitClient?: AdvisoryFitClient,
  ) {}

  generateSkillProfile(input: SkillProfileInput): Promise<SkillProfileResult> {
    return this.skillProfileClient.generate(input);
  }

  requestAdvisoryFit(
    input: AdvisoryFitAssessmentInput,
  ): Promise<AdvisoryFitAssessmentResult> {
    return this.advisoryFitClient!.assess(input);
  }
}
