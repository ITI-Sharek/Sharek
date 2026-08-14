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
import {
  SkillGapGuidanceInput,
  SkillGapGuidanceResult,
} from './dto/skill-gap-guidance.dto';
import { SkillGapGuidanceClient } from './integrations/skill-gap-guidance.client';
import {
  RequirementInferenceInput,
  RequirementInferenceResult,
} from './dto/requirement-inference.dto';
import { RequirementInferenceClient } from './integrations/requirement-inference.client';

@Injectable()
export class AiService {
  constructor(
    private readonly skillProfileClient: FastApiSkillProfileClient,
    @Optional() private readonly advisoryFitClient?: AdvisoryFitClient,
    @Optional() private readonly materialAnalysisClient?: MaterialAnalysisClient,
    @Optional() private readonly skillGapGuidanceClient?: SkillGapGuidanceClient,
    @Optional()
    private readonly requirementInferenceClient?: RequirementInferenceClient,
  ) {}

  /**
   * Infer the skills and levels a Contribution Request demands.
   *
   * Unlike every other client here, what this returns becomes an authorization
   * input (ADR 0015) — so the client revalidates the whole payload before it
   * reaches a caller, and this method adds nothing of its own.
   */
  inferRequirementSkills(
    input: RequirementInferenceInput,
  ): Promise<RequirementInferenceResult> {
    if (!this.requirementInferenceClient) {
      throw new ApplicationError(
        'Requirement inference client is not configured',
        'AI_REQUIREMENT_INFERENCE_CLIENT_NOT_CONFIGURED',
        503,
      );
    }
    return this.requirementInferenceClient.infer(input);
  }

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

  requestSkillGapGuidance(
    input: SkillGapGuidanceInput,
  ): Promise<SkillGapGuidanceResult> {
    if (!this.skillGapGuidanceClient) {
      throw new ApplicationError(
        'Skill-gap guidance client is not configured',
        'AI_SKILL_GAP_GUIDANCE_CLIENT_NOT_CONFIGURED',
        503,
      );
    }
    return this.skillGapGuidanceClient.generate(input);
  }

}
