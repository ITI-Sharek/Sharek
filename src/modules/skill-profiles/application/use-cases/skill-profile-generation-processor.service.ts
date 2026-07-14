import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SkillProfileGenerationStatus,
  SkillProfileProficiencyLevel,
} from '@prisma/client';

import {
  GeneratedSkillCandidate,
  RepositoryEvidenceCapsule,
  SkillProfileGenerator,
  SkillProfileResult,
} from '../../../ai/application/ports/skill-profile-generator.port';
import { GitHubRepositoryImportSnapshot } from '../../../github/application/dto/github-repository.dto';
import { GitHubRepositoryService } from '../../../github/application/use-cases/github-repository.service';
import { SkillProfileGenerationRepository } from '../ports/skill-profile-generation.repository';
import { canonicalizeSkillName } from '../../domain/policies/skill-name.policy';

@Injectable()
export class SkillProfileGenerationProcessorService {
  constructor(
    private readonly generations: SkillProfileGenerationRepository,
    private readonly gitHubRepositoryService: GitHubRepositoryService,
    private readonly skillProfileGenerator: SkillProfileGenerator,
    private readonly config: ConfigService,
  ) {}

  async process(generationId: string): Promise<void> {
    const generation = await this.generations.findById(generationId);
    if (
      !generation ||
      generation.status === SkillProfileGenerationStatus.pending_review ||
      generation.status === SkillProfileGenerationStatus.needs_more_evidence ||
      generation.status === SkillProfileGenerationStatus.failed
    ) {
      return;
    }

    const selectedRepositories = this.readSelectedRepositories(
      generation.selected_repositories,
    );
    await this.generations.updateStatus(
      generationId,
      SkillProfileGenerationStatus.collecting_evidence,
    );

    const selectedEvidence =
      await this.gitHubRepositoryService.getSelectedSkillProfilingEvidence(
        generation.user_id,
        selectedRepositories,
      );
    const evidenceCapsules = selectedEvidence.snapshots.map((snapshot) =>
      this.toEvidenceCapsule(snapshot),
    );
    const evidenceSnapshot = {
      repositories: evidenceCapsules,
      failures: selectedEvidence.failures,
    };

    await this.generations.updateStatus(
      generationId,
      SkillProfileGenerationStatus.analyzing,
      {
        snapshottedRepositoryCount: evidenceCapsules.length,
        evidenceSnapshot,
      },
    );

    if (evidenceCapsules.length === 0) {
      await this.generations.completeNeedsMoreEvidence({
        generationId,
        fraudSignals: [],
        evidenceQuality: 'weak',
        provider: 'none',
        model: 'none',
        promptVersion: 'not-run',
        schemaVersion: 'skill-profile-result-v1',
        serviceVersion: 'not-run',
        evidenceSnapshot,
      });
      return;
    }

    const githubLogin = await this.gitHubRepositoryService.getConnectedUsername(
      generation.user_id,
    );
    const aiResult = await this.skillProfileGenerator.generate({
      contributorId: generation.user_id,
      githubLogin,
      generationId,
      selectedRepositories: evidenceCapsules,
      requestedAt: generation.created_at.toISOString(),
    });
    const pendingSkills = this.toPendingSkills(aiResult);

    if (
      aiResult.recommendation === 'needs_more_evidence' ||
      aiResult.evidenceQuality === 'weak' ||
      pendingSkills.length === 0
    ) {
      await this.generations.completeNeedsMoreEvidence({
        generationId,
        fraudSignals: aiResult.fraudSignals,
        evidenceQuality: aiResult.evidenceQuality,
        provider: aiResult.provider,
        model: aiResult.model,
        promptVersion: aiResult.promptVersion,
        schemaVersion: aiResult.schemaVersion,
        serviceVersion: aiResult.serviceVersion,
        evidenceSnapshot,
      });
      return;
    }

    await this.generations.completeWithPendingSkills({
        generationId,
        skills: pendingSkills,
        fraudSignals: aiResult.fraudSignals,
        evidenceQuality: aiResult.evidenceQuality,
        provider: aiResult.provider,
        model: aiResult.model,
        promptVersion: aiResult.promptVersion,
        schemaVersion: aiResult.schemaVersion,
        serviceVersion: aiResult.serviceVersion,
        evidenceSnapshot,
      });
  }

  private toEvidenceCapsule(
    snapshot: GitHubRepositoryImportSnapshot,
  ): RepositoryEvidenceCapsule {
    const repository = snapshot.repository;

    return {
      evidenceId: `github:${repository.fullName}`,
      fullName: repository.fullName,
      htmlUrl: repository.htmlUrl,
      private: repository.private,
      fork: repository.fork,
      archived: repository.archived,
      defaultBranch: repository.defaultBranch,
      owner: repository.owner,
      description: repository.description,
      topics: repository.topics,
      primaryLanguage: repository.primaryLanguage,
      languages: repository.languages,
      technologies: snapshot.technologies,
      statistics: snapshot.repoStatistics,
      readmeExcerpt: snapshot.readmeContent
        ? snapshot.readmeContent.slice(0, 4000)
        : null,
      contributionActivity: snapshot.contributionActivity as unknown as Record<
        string,
        unknown
      >,
      commitSignals: snapshot.commitSignals as unknown as Record<
        string,
        unknown
      >,
      authorship: snapshot.authorship ?? {
        githubLogin: '',
        repositoryOwned: false,
        recentCommitCount: 0,
        totalCommits: 0,
        additions: 0,
        deletions: 0,
        contributionDetected: false,
        matchedRecentCommitShas: [],
      },
      evidenceFailures: snapshot.evidenceFailures,
    };
  }

  private toPendingSkills(
    aiResult: SkillProfileResult,
  ): Array<{
    name: string;
    key: string;
    proficiency: SkillProfileProficiencyLevel;
    confidence: number;
    evidenceSummary: string | null;
    evidenceSources: unknown;
  }> {
    const threshold = this.config.get<number>('AI_LOW_CONFIDENCE_THRESHOLD', 0.7);
    const bestBySkill = new Map<string, GeneratedSkillCandidate>();

    for (const skill of aiResult.skills) {
      if (skill.confidence < threshold || skill.evidenceIds.length === 0) {
        continue;
      }

      const canonicalName = canonicalizeSkillName(skill.name);
      if (!canonicalName) {
        continue;
      }
      const existing = bestBySkill.get(canonicalName.key);
      if (!existing || skill.confidence > existing.confidence) {
        bestBySkill.set(canonicalName.key, {
          ...skill,
          name: canonicalName.name,
        });
      }
    }

    return Array.from(bestBySkill.entries()).map(([key, skill]) => ({
      name: skill.name,
      key,
      proficiency: skill.proficiency,
      confidence: skill.confidence,
      evidenceSummary: skill.evidenceSummary ?? null,
      evidenceSources: {
        evidenceIds: skill.evidenceIds,
        limitations: skill.limitations ?? [],
      },
    }));
  }

  private readSelectedRepositories(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && !Array.isArray(item),
      )
      .map((item) => item.fullName)
      .filter((fullName): fullName is string => typeof fullName === 'string');
  }
}
