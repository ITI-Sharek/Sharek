import { Injectable } from '@nestjs/common';
import {
  Prisma,
  Project,
  ProjectStatus,
  UserStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { DatabaseService } from '../../../shared/database/database.service';
import {
  ApplicationError,
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
  UnprocessableApplicationError,
} from '../../../shared/errors/application.error';
import { GitHubRepositoryImportSnapshot } from '../../github/dto/github-repository.dto';
import { GitHubEvidenceService } from '../../github/services/github-evidence.service';
import { IdentityAccountStatusService } from '../../identity/services/identity-account-status.service';
import {
  ConfirmProjectTransitionDto,
  CreateProjectDraftDto,
  ProjectPresentationDto,
  RefreshProjectSourceDto,
  UpdateProjectDto,
} from '../dto/project-publication.dto';
import {
  ProjectOwnerViewDto,
  ProjectPreviewResponseDto,
  ProjectTransitionResponseDto,
} from '../dto/project-owner-response.dto';

const SOURCE_FRESHNESS_MS = 15 * 60 * 1000;
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{8,128}$/;
type ProjectTransaction = Prisma.TransactionClient;

@Injectable()
export class ProjectPublicationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly gitHubEvidence: GitHubEvidenceService,
    private readonly identityAccountStatus: IdentityAccountStatusService,
  ) {}

  async preview(
    actor: AuthenticatedUser,
    repositoryReference: string,
  ): Promise<ProjectPreviewResponseDto> {
    this.assertEligibleActor(actor);
    const snapshot = await this.gitHubEvidence.getProjectImportSnapshot(
      actor.id,
      repositoryReference,
    );
    return this.toPreview(snapshot);
  }

  async createDraft(
    actor: AuthenticatedUser,
    input: CreateProjectDraftDto,
    idempotencyKey: string,
  ): Promise<ProjectOwnerViewDto> {
    this.assertEligibleActor(actor);
    this.assertIdempotencyKey(idempotencyKey);
    const replay = await this.findReplay<ProjectOwnerViewDto>(
      actor.id,
      'create_draft',
      idempotencyKey,
      input,
    );
    if (replay) return replay;
    const snapshot = await this.gitHubEvidence.getProjectImportSnapshot(
      actor.id,
      input.source.repositoryReference,
    );
    if (this.fingerprint(snapshot) !== input.source.previewFingerprint) {
      throw new ConflictApplicationError(
        'Repository source changed since preview',
        'PROJECT_SOURCE_CHANGED_SINCE_PREVIEW',
        { recoveryAction: 'preview_again' },
      );
    }

    return this.executeIdempotent(
      actor.id,
      'create_draft',
      idempotencyKey,
      input,
      async (transaction) => {
        const now = new Date();
        const projectData = this.buildProjectCreateData(
          actor.id,
          input.project,
          snapshot,
          now,
        );
        const project = await transaction.project.create({ data: projectData });
        return {
          result: this.toOwnerView(project, true),
          projectId: project.id,
        };
      },
    );
  }

  async getOwnerProject(
    actor: AuthenticatedUser,
    projectId: string,
  ): Promise<ProjectOwnerViewDto> {
    this.assertEligibleActor(actor);
    const project = await this.findOwnedProject(this.database, actor.id, projectId);
    const includeSnapshot = await this.canReadCurrentSnapshot(actor.id, project);
    return this.toOwnerView(project, includeSnapshot);
  }

  async updateProject(
    actor: AuthenticatedUser,
    projectId: string,
    input: UpdateProjectDto,
    idempotencyKey: string,
  ): Promise<ProjectOwnerViewDto> {
    this.assertEligibleActor(actor);
    this.assertIdempotencyKey(idempotencyKey);
    this.assertHasProjectChanges(input);
    return this.executeIdempotent(
      actor.id,
      'update',
      idempotencyKey,
      { projectId, ...input },
      async (transaction) => {
        const current = await this.findOwnedProject(
          transaction,
          actor.id,
          projectId,
        );
        this.assertRevision(current, input.expectedRevision);
        const data = this.buildProjectUpdateData(current, input);
        const project = await this.updateOwnedAtRevision(
          transaction,
          current,
          { ...data, revision: { increment: 1 } },
        );
        return {
          result: this.toOwnerView(project, project.source_visibility !== 'private'),
          projectId,
        };
      },
    );
  }

  async refreshSource(
    actor: AuthenticatedUser,
    projectId: string,
    input: RefreshProjectSourceDto,
    idempotencyKey: string,
  ): Promise<ProjectOwnerViewDto> {
    this.assertEligibleActor(actor);
    this.assertIdempotencyKey(idempotencyKey);
    const replay = await this.findReplay<ProjectOwnerViewDto>(
      actor.id,
      'refresh',
      idempotencyKey,
      { projectId, ...input },
    );
    if (replay) return replay;
    const current = await this.findOwnedProject(this.database, actor.id, projectId);
    this.assertRevision(current, input.expectedRevision);
    const snapshot = await this.gitHubEvidence.getProjectImportSnapshot(
      actor.id,
      current.github_repo_url,
    );
    if (
      current.github_repo_id &&
      snapshot.repository.githubRepoId !== current.github_repo_id
    ) {
      throw new ConflictApplicationError(
        'Repository identity changed during refresh',
        'PROJECT_SOURCE_CHANGED_SINCE_PREVIEW',
        { recoveryAction: 'review_source' },
      );
    }

    return this.executeIdempotent(
      actor.id,
      'refresh',
      idempotencyKey,
      { projectId, ...input },
      async (transaction) => {
        const locked = await this.findOwnedProject(
          transaction,
          actor.id,
          projectId,
        );
        this.assertRevision(locked, input.expectedRevision);
        const project = await this.updateOwnedAtRevision(
          transaction,
          locked,
          {
            ...this.buildSourceRefreshData(locked, snapshot),
            revision: { increment: 1 },
          },
        );
        return { result: this.toOwnerView(project, true), projectId };
      },
    );
  }

  async publish(
    actor: AuthenticatedUser,
    projectId: string,
    input: ConfirmProjectTransitionDto,
    idempotencyKey: string,
  ): Promise<ProjectTransitionResponseDto> {
    this.assertEligibleActor(actor);
    this.assertIdempotencyKey(idempotencyKey);
    const replay = await this.findReplay<ProjectTransitionResponseDto>(
      actor.id,
      'publish',
      idempotencyKey,
      { projectId, ...input },
    );
    if (replay) return replay;
    const current = await this.findOwnedProject(this.database, actor.id, projectId);
    this.assertRevision(current, input.expectedRevision);
    if (current.status !== ProjectStatus.draft) {
      throw this.invalidTransition(current.status);
    }
    this.assertPublicationComplete(current);
    const snapshot = await this.gitHubEvidence.getProjectImportSnapshot(
      actor.id,
      current.github_repo_url,
    );
    if (snapshot.repository.githubRepoId !== current.github_repo_id) {
      throw new ConflictApplicationError(
        'Repository identity changed before publication',
        'PROJECT_SOURCE_CHANGED_SINCE_PREVIEW',
      );
    }
    await this.assertRepositoryControl(actor.id, snapshot);

    try {
      return await this.executeIdempotent(
        actor.id,
        'publish',
        idempotencyKey,
        { projectId, ...input },
        async (transaction) => {
          const locked = await this.findOwnedProject(
            transaction,
            actor.id,
            projectId,
          );
          this.assertRevision(locked, input.expectedRevision);
          if (locked.status !== ProjectStatus.draft) {
            throw this.invalidTransition(locked.status);
          }
          const duplicate = await transaction.project.findFirst({
            where: {
              id: { not: projectId },
              github_repo_id: snapshot.repository.githubRepoId,
              status: ProjectStatus.published,
            },
            select: { id: true, slug: true },
          });
          if (duplicate) {
            throw new ConflictApplicationError(
              'This repository already has a published project',
              'PROJECT_REPOSITORY_ALREADY_PUBLISHED',
              { projectId: duplicate.id, projectSlug: duplicate.slug },
            );
          }
          const publishedAt = new Date();
          const project = await this.updateOwnedAtRevision(
            transaction,
            locked,
            {
              ...this.buildSourceRefreshData(locked, snapshot),
              status: ProjectStatus.published,
              published_at: publishedAt,
              archived_at: null,
              revision: { increment: 1 },
            },
            ProjectStatus.draft,
          );
          const transition = await transaction.projectStateTransition.create({
            data: {
              project_id: projectId,
              actor_id: actor.id,
              from_status: ProjectStatus.draft,
              to_status: ProjectStatus.published,
              validation_outcome: {
                metadata: 'complete',
                sourceIdentity: 'verified',
                repositoryControl: 'verified',
              },
            },
          });
          return {
            result: {
              projectId,
              status: ProjectStatus.published,
              revision: project.revision,
              publishedAt,
              transitionId: transition.id,
            },
            projectId,
          };
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictApplicationError(
          'This repository already has a published project',
          'PROJECT_REPOSITORY_ALREADY_PUBLISHED',
        );
      }
      throw error;
    }
  }

  async archive(
    actor: AuthenticatedUser,
    projectId: string,
    input: ConfirmProjectTransitionDto,
    idempotencyKey: string,
  ): Promise<ProjectTransitionResponseDto> {
    this.assertEligibleActor(actor);
    this.assertIdempotencyKey(idempotencyKey);
    return this.executeIdempotent(
      actor.id,
      'archive',
      idempotencyKey,
      { projectId, ...input },
      async (transaction) => {
        const current = await this.findOwnedProject(
          transaction,
          actor.id,
          projectId,
        );
        this.assertRevision(current, input.expectedRevision);
        if (current.status !== ProjectStatus.published) {
          throw this.invalidTransition(current.status);
        }
        const archivedAt = new Date();
        const project = await this.updateOwnedAtRevision(
          transaction,
          current,
          {
            status: ProjectStatus.archived,
            archived_at: archivedAt,
            revision: { increment: 1 },
          },
          ProjectStatus.published,
        );
        const transition = await transaction.projectStateTransition.create({
          data: {
            project_id: projectId,
            actor_id: actor.id,
            from_status: ProjectStatus.published,
            to_status: ProjectStatus.archived,
            validation_outcome: { ownerConfirmed: true },
          },
        });
        return {
          result: {
            projectId,
            status: ProjectStatus.archived,
            revision: project.revision,
            archivedAt,
            transitionId: transition.id,
          },
          projectId,
        };
      },
    );
  }

  private async executeIdempotent<T>(
    actorId: string,
    operation: string,
    key: string,
    request: unknown,
    action: (
      transaction: ProjectTransaction,
    ) => Promise<{ result: T; projectId: string | null }>,
  ): Promise<T> {
    const keyHash = this.hash(key);
    const requestHash = this.hash(JSON.stringify(request));
    const existing = await this.database.projectOperation.findUnique({
      where: {
        actor_id_operation_key_hash: {
          actor_id: actorId,
          operation,
          key_hash: keyHash,
        },
      },
    });
    if (existing) {
      if (existing.request_hash !== requestHash) {
        throw new ConflictApplicationError(
          'Idempotency key was reused for a different request',
          'PROJECT_IDEMPOTENCY_KEY_REUSED',
          { operation },
        );
      }
      if (existing.response !== null) return existing.response as T;
    }

    try {
      return await this.database.$transaction(async (transaction) => {
        const receipt = await transaction.projectOperation.create({
          data: {
            actor_id: actorId,
            operation,
            key_hash: keyHash,
            request_hash: requestHash,
          },
        });
        const outcome = await action(transaction);
        await transaction.projectOperation.update({
          where: { id: receipt.id },
          data: {
            project_id: outcome.projectId,
            response: JSON.parse(
              JSON.stringify(outcome.result),
            ) as Prisma.InputJsonValue,
          },
        });
        return outcome.result;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const replay = await this.findReplay<T>(
          actorId,
          operation,
          key,
          request,
        );
        if (replay) return replay;
      }
      throw error;
    }
  }

  private async findReplay<T>(
    actorId: string,
    operation: string,
    key: string,
    request: unknown,
  ): Promise<T | null> {
    const receipt = await this.database.projectOperation.findUnique({
      where: {
        actor_id_operation_key_hash: {
          actor_id: actorId,
          operation,
          key_hash: this.hash(key),
        },
      },
    });
    if (!receipt) return null;
    if (receipt.request_hash !== this.hash(JSON.stringify(request))) {
      throw new ConflictApplicationError(
        'Idempotency key was reused for a different request',
        'PROJECT_IDEMPOTENCY_KEY_REUSED',
        { operation },
      );
    }
    return receipt.response === null ? null : (receipt.response as T);
  }

  private buildProjectCreateData(
    ownerId: string,
    input: ProjectPresentationDto,
    snapshot: GitHubRepositoryImportSnapshot,
    now: Date,
  ): Prisma.ProjectUncheckedCreateInput {
    const repository = snapshot.repository;
    const title = input.title?.trim() || repository.name;
    const slugBase = this.slugify(title || repository.name);
    const id = randomUUID();
    const slug = `${slugBase.slice(0, 47)}-${id.replace(/-/g, '')}`;
    const manualOverrides = (
      ['title', 'description', 'tags', 'technologies'] as const
    ).filter((field) => input[field] !== undefined);
    return {
      id,
      owner_id: ownerId,
      title,
      slug,
      slug_normalized: slug.toLowerCase(),
      description:
        input.description === undefined
          ? repository.description
          : input.description?.trim() || null,
      github_repo_url: repository.htmlUrl,
      github_repo_id: repository.githubRepoId,
      languages: repository.languages,
      tags: this.cleanArray(input.tags ?? repository.topics),
      technologies: this.cleanArray(
        input.technologies ?? snapshot.technologies,
      ),
      repo_statistics: snapshot.repoStatistics as Prisma.InputJsonObject,
      category: input.category ?? null,
      difficulty: input.difficulty ?? null,
      status: ProjectStatus.draft,
      readme_content: snapshot.readmeContent,
      revision: 1,
      manual_overrides: manualOverrides,
      source_visibility: repository.private ? 'private' : 'public',
      source_owner_id: repository.ownerId,
      source_owner_type: repository.ownerType,
      source_default_branch: repository.defaultBranch,
      source_updated_at: repository.updatedAt,
      source_fetched_at: now,
      published_at: null,
      archived_at: null,
    };
  }

  private buildProjectUpdateData(
    current: Project,
    input: UpdateProjectDto,
  ): Prisma.ProjectUpdateInput {
    const manual = new Set(this.stringArray(current.manual_overrides));
    const data: Prisma.ProjectUpdateInput = {};
    const restorable = new Set(input.restoreFromSource ?? []);
    for (const field of restorable) manual.delete(field);

    if (input.title !== undefined) {
      data.title = input.title.trim();
      manual.add('title');
    } else if (restorable.has('title')) {
      data.title = this.repositoryName(current.github_repo_url);
    }
    if (input.description !== undefined) {
      data.description = input.description?.trim() || null;
      manual.add('description');
    } else if (restorable.has('description')) {
      data.description = null;
    }
    if (input.tags !== undefined) {
      data.tags = this.cleanArray(input.tags);
      manual.add('tags');
    }
    if (input.technologies !== undefined) {
      data.technologies = this.cleanArray(input.technologies);
      manual.add('technologies');
    }
    if (input.category !== undefined) data.category = input.category;
    if (input.difficulty !== undefined) data.difficulty = input.difficulty;
    data.manual_overrides = [...manual];
    return data;
  }

  private buildSourceRefreshData(
    current: Project,
    snapshot: GitHubRepositoryImportSnapshot,
  ): Prisma.ProjectUpdateInput {
    const repository = snapshot.repository;
    const manual = new Set(this.stringArray(current.manual_overrides));
    const data: Prisma.ProjectUpdateInput = {
      github_repo_url: repository.htmlUrl,
      github_repo_id: repository.githubRepoId,
      languages: repository.languages,
      repo_statistics: snapshot.repoStatistics as Prisma.InputJsonObject,
      readme_content: snapshot.readmeContent,
      source_visibility: repository.private ? 'private' : 'public',
      source_owner_id: repository.ownerId,
      source_owner_type: repository.ownerType,
      source_default_branch: repository.defaultBranch,
      source_updated_at: repository.updatedAt,
      source_fetched_at: new Date(),
    };
    if (!manual.has('title')) data.title = repository.name;
    if (!manual.has('description')) data.description = repository.description;
    if (!manual.has('tags')) data.tags = repository.topics;
    if (!manual.has('technologies')) data.technologies = snapshot.technologies;
    return data;
  }

  private toPreview(
    snapshot: GitHubRepositoryImportSnapshot,
  ): ProjectPreviewResponseDto {
    const repository = snapshot.repository;
    const fetchedAt = new Date();
    const unavailableAreas = snapshot.evidenceFailures ?? [];
    return {
      previewFingerprint: this.fingerprint(snapshot),
      source: {
        provider: 'github',
        repositoryId: repository.githubRepoId,
        fullName: repository.fullName,
        repositoryUrl: repository.htmlUrl,
        visibility: repository.private ? 'private' : 'public',
        ownerType: repository.ownerType,
        defaultBranch: repository.defaultBranch,
        sourceVersion: repository.updatedAt?.toISOString() ?? null,
        sourceUpdatedAt: repository.updatedAt,
        fetchedAt,
      },
      imported: {
        repositoryName: repository.name,
        description: repository.description,
        languages: repository.languages,
        topics: repository.topics,
        technologies: snapshot.technologies,
        statistics: snapshot.repoStatistics,
        readmeContent: snapshot.readmeContent,
      },
      ownerDefaults: {
        title: repository.name,
        description: repository.description,
        tags: repository.topics,
        technologies: snapshot.technologies,
      },
      evidence: {
        completeness: unavailableAreas.length > 0 ? 'partial' : 'complete',
        fieldStatus: {
          languages: repository.languages ? 'updated' : 'unavailable',
          readme: snapshot.readmeContent ? 'updated' : 'unavailable',
          statistics: snapshot.repoStatistics ? 'updated' : 'unavailable',
        },
        unavailableAreas,
        authorizationStatus: repository.private ? 'authorized' : 'public_read',
        selectionStatus: repository.private ? 'selected' : 'not_required',
      },
    };
  }

  private toOwnerView(
    project: Project,
    includeSnapshot: boolean,
  ): ProjectOwnerViewDto {
    const fetchedAt = project.source_fetched_at;
    const freshUntil = fetchedAt
      ? new Date(fetchedAt.getTime() + SOURCE_FRESHNESS_MS)
      : null;
    const isStale = !freshUntil || freshUntil <= new Date();
    return {
      id: project.id,
      slug: project.slug,
      status: project.status,
      revision: project.revision,
      project: {
        title: project.title,
        description: project.description,
        tags: this.stringArray(project.tags),
        technologies: this.stringArray(project.technologies),
        category: project.category,
        difficulty: project.difficulty,
        manualOverrides: this.stringArray(project.manual_overrides),
      },
      source: {
        attribution: {
          provider: 'github',
          repositoryId: project.github_repo_id,
          fullName: this.fullName(project.github_repo_url),
          repositoryUrl: project.github_repo_url,
          visibility: project.source_visibility === 'private' ? 'private' : 'public',
          ownerType: this.ownerType(project.source_owner_type),
          defaultBranch: project.source_default_branch,
          sourceVersion: project.source_updated_at?.toISOString() ?? null,
          sourceUpdatedAt: project.source_updated_at,
          fetchedAt,
        },
        latestSnapshot: includeSnapshot
          ? {
              description: project.description,
              languages: project.languages,
              topics: this.stringArray(project.tags),
              technologies: this.stringArray(project.technologies),
              statistics: project.repo_statistics,
              readmeContent: project.readme_content,
              completeness: 'complete',
              fieldStatus: {},
              uncertainty: [],
            }
          : null,
        status: {
          syncStatus: isStale ? 'stale' : 'fresh',
          authorizationStatus:
            project.source_visibility === 'private'
              ? includeSnapshot
                ? 'authorized'
                : 'authorization_required'
              : 'public_read',
          selectionStatus:
            project.source_visibility === 'private'
              ? includeSnapshot
                ? 'selected'
                : 'unselected'
              : 'not_required',
          lastAttemptAt: fetchedAt,
          lastRequiredReadAt: fetchedAt,
          freshUntil,
          isStale,
          invalidationReason: null,
          lastSuccessfulRefreshAt: fetchedAt,
          unavailableAreas: [],
          recoveryAction: includeSnapshot ? null : 'reconnect_or_select_repository',
        },
      },
      publishedAt: project.published_at,
      archivedAt: project.archived_at,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    };
  }

  private async canReadCurrentSnapshot(
    userId: string,
    project: Project,
  ): Promise<boolean> {
    if (project.source_visibility !== 'private') return true;
    if (!project.github_repo_id) return false;
    try {
      return await this.gitHubEvidence.verifySelectedRepositoryControl(
        userId,
        project.github_repo_id,
      );
    } catch {
      return false;
    }
  }

  private async assertRepositoryControl(
    userId: string,
    snapshot: GitHubRepositoryImportSnapshot,
  ): Promise<void> {
    const repository = snapshot.repository;
    const identity = await this.identityAccountStatus.getGitHubIdentityForUser(
      userId,
    );
    const personalControl =
      repository.ownerType === 'user' &&
      identity !== null &&
      repository.ownerId !== null &&
      identity.providerAccountId === repository.ownerId;
    if (personalControl) return;
    const selected = await this.gitHubEvidence.verifySelectedRepositoryControl(
      userId,
      repository.githubRepoId,
    );
    if (selected) return;
    throw new UnprocessableApplicationError(
      'Verified GitHub repository control is required before publication',
      'PROJECT_REPOSITORY_CONTROL_REQUIRED',
    );
  }

  private async findOwnedProject(
    database: DatabaseService | ProjectTransaction,
    ownerId: string,
    projectId: string,
  ): Promise<Project> {
    const project = await database.project.findFirst({
      where: { id: projectId, owner_id: ownerId },
    });
    if (!project) {
      throw new NotFoundApplicationError(
        'Project was not found',
        'PROJECT_NOT_FOUND',
      );
    }
    return project;
  }

  private async updateOwnedAtRevision(
    transaction: ProjectTransaction,
    current: Project,
    data: Prisma.ProjectUpdateManyMutationInput,
    expectedStatus?: ProjectStatus,
  ): Promise<Project> {
    const updated = await transaction.project.updateMany({
      where: {
        id: current.id,
        owner_id: current.owner_id,
        revision: current.revision,
        ...(expectedStatus ? { status: expectedStatus } : {}),
      },
      data,
    });
    if (updated.count !== 1) {
      const latest = await transaction.project.findFirst({
        where: { id: current.id, owner_id: current.owner_id },
        select: { revision: true },
      });
      throw new ConflictApplicationError(
        'Project revision is stale',
        'PROJECT_REVISION_CONFLICT',
        latest ? { currentRevision: latest.revision } : undefined,
      );
    }
    return transaction.project.findUniqueOrThrow({ where: { id: current.id } });
  }

  private assertEligibleActor(actor: AuthenticatedUser): void {
    if (
      actor.status !== UserStatus.active ||
      (actor.role !== 'owner' && actor.role !== 'contributor')
    ) {
      throw new ForbiddenApplicationError(
        'An active owner or contributor account is required',
        'PROJECT_ACCOUNT_NOT_ELIGIBLE',
      );
    }
  }

  private assertRevision(project: Project, expected: number): void {
    if (project.revision !== expected) {
      throw new ConflictApplicationError(
        'Project revision is stale',
        'PROJECT_REVISION_CONFLICT',
        { currentRevision: project.revision },
      );
    }
  }

  private assertPublicationComplete(project: Project): void {
    const missing: string[] = [];
    if (!project.title.trim()) missing.push('title');
    if (!project.category) missing.push('category');
    if (!project.difficulty) missing.push('difficulty');
    if (missing.length > 0) {
      throw new ApplicationError(
        'Project is incomplete for publication',
        'PROJECT_PUBLICATION_INCOMPLETE',
        422,
        { fields: missing },
      );
    }
  }

  private assertHasProjectChanges(input: UpdateProjectDto): void {
    const keys = [
      'title',
      'description',
      'tags',
      'technologies',
      'category',
      'difficulty',
    ] as const;
    if (
      !keys.some((key) => input[key] !== undefined) &&
      (input.restoreFromSource?.length ?? 0) === 0
    ) {
      throw new ApplicationError(
        'At least one project field change is required',
        'PROJECT_REQUEST_INVALID',
        400,
      );
    }
    for (const field of input.restoreFromSource ?? []) {
      if (input[field] !== undefined) {
        throw new ApplicationError(
          `Project field ${field} cannot be edited and restored together`,
          'PROJECT_REQUEST_INVALID',
          400,
        );
      }
    }
  }

  private assertIdempotencyKey(key: string): void {
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new ApplicationError(
        'A valid Idempotency-Key header is required',
        'PROJECT_REQUEST_INVALID',
        400,
      );
    }
  }

  private invalidTransition(status: ProjectStatus): ConflictApplicationError {
    return new ConflictApplicationError(
      'Project state transition is not allowed',
      'PROJECT_STATE_TRANSITION_INVALID',
      { currentState: status },
    );
  }

  private fingerprint(snapshot: GitHubRepositoryImportSnapshot): string {
    const repository = snapshot.repository;
    return this.hash(
      JSON.stringify({
        repositoryId: repository.githubRepoId,
        fullName: repository.fullName.toLowerCase(),
        visibility: repository.private ? 'private' : 'public',
        sourceUpdatedAt: repository.updatedAt?.toISOString() ?? null,
        description: repository.description,
        languages: repository.languages,
        topics: repository.topics,
        technologies: snapshot.technologies,
      }),
    );
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private cleanArray(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private ownerType(value: string | null): 'user' | 'organization' | 'unknown' {
    return value === 'user' || value === 'organization' ? value : 'unknown';
  }

  private repositoryName(repositoryUrl: string): string {
    return this.fullName(repositoryUrl).split('/')[1] || 'project';
  }

  private fullName(repositoryUrl: string): string {
    try {
      return new URL(repositoryUrl).pathname.replace(/^\//, '').replace(/\.git$/, '');
    } catch {
      return repositoryUrl;
    }
  }

  private slugify(value: string): string {
    return (
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'project'
    );
  }
}
