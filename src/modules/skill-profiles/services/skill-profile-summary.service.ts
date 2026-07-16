import { Injectable } from '@nestjs/common';
import { SkillProfileStatus } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';

export interface SkillProfileSummaryDto {
  name: string;
  proficiencyLevel: 'beginner' | 'intermediate' | 'advanced';
  confidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'disputed' | 'superseded';
  evidenceSummary: string | null;
}

@Injectable()
export class SkillProfileSummaryService {
  constructor(private readonly database: DatabaseService) {}

  async listSkillsForProfile(
    userId: string,
    options: { includeGenerated: boolean },
  ): Promise<SkillProfileSummaryDto[]> {
    const skills = await this.database.skillProfile.findMany({
      where: {
        user_id: userId,
        ...(options.includeGenerated
          ? {
              status: {
                not: SkillProfileStatus.superseded,
              },
            }
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
