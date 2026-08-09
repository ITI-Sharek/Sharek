import { Injectable, Optional } from '@nestjs/common';

import { ApplicationError } from '../../shared/errors/application.error';

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
import { MaterialAnalysisClient } from './integrations/material-analysis.client';
import {
  MaterialAnalysisInput,
  MaterialAnalysisResult,
} from './dto/material-analysis.dto';

@Injectable()
export class AiService {
  constructor(
    private readonly skillProfileClient: FastApiSkillProfileClient,
    @Optional() private readonly advisoryFitClient?: AdvisoryFitClient,
    @Optional() private readonly materialAnalysisClient?: MaterialAnalysisClient,
  ) {}

  generateSkillProfile(input: SkillProfileInput): Promise<SkillProfileResult> {
    return this.skillProfileClient.generate(input);
  }

  requestAdvisoryFit(
    input: AdvisoryFitAssessmentInput,
  ): Promise<AdvisoryFitAssessmentResult> {
    // The client is @Optional(), so a DI misconfiguration used to surface as a
    // TypeError on a non-null assertion — which the caller then recorded as
    // "the provider was unavailable". Fail with something that names itself.
    if (!this.advisoryFitClient) {
      throw new ApplicationError(
        'Advisory Fit client is not configured',
        'AI_ADVISORY_FIT_CLIENT_NOT_CONFIGURED',
        503,
      );
    }
    return this.advisoryFitClient.assess(input);
  }

  requestMaterialAnalysis(
    input: MaterialAnalysisInput,
  ): Promise<MaterialAnalysisResult> {
    if (!this.materialAnalysisClient) {
      throw new ApplicationError(
        'Material analysis client is not configured',
        'AI_MATERIAL_ANALYSIS_CLIENT_NOT_CONFIGURED',
        503,
      );
    }
    return this.materialAnalysisClient.analyze(input);
  }
}
