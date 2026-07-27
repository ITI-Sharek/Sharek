import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  SkillProfileGenerationStatus,
  SkillProfileProficiencyLevel,
} from '@prisma/client';

import {
  GeneratedSkillCandidate,
  RepositoryEvidenceCapsule,
  SkillProfileResult,
} from '../../ai/dto/skill-profile-ai.dto';
import { AiService } from '../../ai/ai.service';
import { GitHubRepositoryImportSnapshot } from '../../github/dto/github-repository.dto';
import { GitHubEvidenceService } from '../../github/services/github-evidence.service';
import { SkillProfileGenerationRepository } from '../repositories/skill-profile-generation.repository';
import { canonicalizeSkillName } from '../utils/skill-name.util';
import { DatabaseService } from '../../../shared/database/database.service';

@Injectable()
export class SkillProfileGenerationService {
  constructor(
    private readonly generations: SkillProfileGenerationRepository,
    private readonly gitHubEvidenceService: GitHubEvidenceService,
    private readonly aiService: AiService,
    private readonly config: ConfigService,
    @Optional() private readonly database?: DatabaseService,
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
    if (!generation.github_app_installation_link_id) {
      await this.generations.fail(
        generationId,
        'GitHub App installation authorization is required.',
      );
      return;
    }
    await this.generations.updateStatus(
      generationId,
      SkillProfileGenerationStatus.collecting_evidence,
    );

    const selectedEvidence =
      await this.gitHubEvidenceService.getGitHubAppSkillProfilingEvidence(
        generation.user_id,
        generation.github_app_installation_link_id,
        selectedRepositories.map((repository) => repository.repositoryId),
      );
    const evidenceCapsules = selectedEvidence.snapshots.map((snapshot) => {
      const selection = selectedRepositories.find(
        (repository) => repository.fullName === snapshot.repository.fullName,
      );
      return this.toEvidenceCapsule(
        snapshot,
        this.opaqueEvidenceId(generation.id, selection?.repositoryId ?? ''),
      );
    });
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

    const githubLogin = evidenceCapsules[0]?.authorship.githubLogin || '';
    const aiResult = await this.aiService.generateSkillProfile({
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

  async transitionUnresolvedLegacyCandidates(now = new Date()): Promise<number> {
    if (!this.database) return 0;
    const cutover = await this.database.gitHubEvidenceCutover.findUnique({
      where: { id: 'github-evidence' },
      select: { legacy_evidence_cleanup_due_at: true },
    });
    if (
      !cutover?.legacy_evidence_cleanup_due_at ||
      now < cutover.legacy_evidence_cleanup_due_at
    ) {
      return 0;
    }
    return this.generations.transitionUnresolvedLegacyCandidates();
  }

  private toEvidenceCapsule(
    snapshot: GitHubRepositoryImportSnapshot,
    evidenceId: string,
  ): RepositoryEvidenceCapsule {
    const repository = snapshot.repository;

    return {
      evidenceId,
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

  private readSelectedRepositories(
    value: unknown,
  ): Array<{ repositoryId: string; fullName: string }> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && !Array.isArray(item),
      )
      .flatMap((item) =>
        typeof item.repositoryId === 'string' && typeof item.fullName === 'string'
          ? [{ repositoryId: item.repositoryId, fullName: item.fullName }]
          : [],
      );
  }

  private opaqueEvidenceId(generationId: string, repositoryId: string): string {
    return `github-evidence:${createHash('sha256')
      .update(`${generationId}:${repositoryId}`)
      .digest('base64url')}`;
  }
}
