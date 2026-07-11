import { Injectable } from '@nestjs/common';
import { SkillProfileStatus } from '@prisma/client';

import { ContributorProfileSkillDto } from '../../../contributor-profiles/application/dto/contributor-profile.dto';
import { DatabaseService } from '../../../../shared/database/database.service';

@Injectable()
export class SkillProfileSummaryReaderService {
  constructor(private readonly database: DatabaseService) {}

  async listSkillsForProfile(
    userId: string,
    options: { includeGenerated: boolean },
  ): Promise<ContributorProfileSkillDto[]> {
    const skills = await this.database.skillProfile.findMany({
      where: {
        user_id: userId,
        ...(options.includeGenerated
          ? {}
          : {
              status: SkillProfileStatus.approved,
            }),
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    return skills.map((skill) => ({
      name: skill.skill_name,
      proficiencyLevel: skill.proficiency_level,
      confidence: skill.confidence_score,
      status: skill.status,
      evidenceSummary: skill.evidence_summary,
    }));
  }
}
