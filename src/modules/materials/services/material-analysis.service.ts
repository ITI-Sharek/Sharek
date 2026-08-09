import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MaterialAnalysisRunStatus,
  MaterialAnalysisSetStatus,
  MaterialAnalysisPurpose,
  MaterialDraftSuggestionType,
  MaterialScanStatus,
  Prisma,
  ProjectStatus,
} from '@prisma/client';

import { AiService } from '../../ai/ai.service';
import {
  MaterialAnalysisInput,
  MaterialAnalysisResult,
} from '../../ai/dto/material-analysis.dto';
import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { DatabaseService } from '../../../shared/database/database.service';
import {
  ApplicationError,
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../../shared/errors/application.error';
import { ProjectsService } from '../../projects/projects.service';
import { MaterialAnalysisQueue } from '../jobs/material-analysis.queue';
import {
  AdoptContributionRequestSuggestionDto,
  AdoptProjectSuggestionDto,
  CreateMaterialAnalysisSetDto,
} from '../dto/material-analysis-input.dto';
import {
  MaterialAnalysisRunDto,
  MaterialAnalysisSelectionDto,
  MaterialAnalysisSetDto,
  MaterialDraftSuggestionDto,
} from '../dto/material-analysis-response.dto';
import { MaterialStorage } from '../storage/material-storage';
import { ProjectPublicationService } from '../../projects/services/project-publication.service';
import {
  CreateContributionRequestDto,
} from '../../contribution-tasks/dto/contribution-request-input.dto';
import { ContributionTasksService } from '../../contribution-tasks/services/contribution-tasks.service';

const CONTRACT_VERSION = 'material-draft-v1' as const;
const SUPPORTED_ANALYSIS_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
  'text/x-markdown',
  'text/plain',
] as const;
type MaterialAnalysisSetVersionRow = Prisma.MaterialAnalysisSetGetPayload<{
  include: { versions: true };
}>['versions'][number];
type MaterialDraftSuggestionRow = Prisma.MaterialAnalysisRunGetPayload<{
  include: { suggestions: true };
}>['suggestions'][number];

@Injectable()
export class MaterialAnalysisService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly projects: ProjectsService,
    private readonly storage: MaterialStorage,
    private readonly ai: AiService,
    @Optional() private readonly queue?: MaterialAnalysisQueue,
    @Optional() private readonly publication?: ProjectPublicationService,
    @Optional() private readonly contributionTasks?: ContributionTasksService,
  ) {}

  async createSet(
    actor: AuthenticatedUser,
    projectId: string,
    input: CreateMaterialAnalysisSetDto,
  ): Promise<MaterialAnalysisSetDto> {
    this.assertEnabled();
    this.assertActiveOwner(actor);
    await this.assertEntitled(actor);
    const project = await this.projects.getMaterialProjectContext(projectId);
    if (project.ownerId !== actor.id) throw this.projectNotFound();
    if (project.status === ProjectStatus.archived) {
      throw new ConflictApplicationError(
        'Archived Projects cannot start Material analysis',
        'MATERIAL_ANALYSIS_PROJECT_ARCHIVED',
      );
    }

    const selections = this.uniqueSelections(input);
    const materialRows = await this.database.material.findMany({
      where: {
        id: { in: selections.map((selection) => selection.materialId) },
        project_id: projectId,
        owner_id: actor.id,
        deleted_at: null,
      },
      select: {
        id: true,
        versions: {
          where: { version: { in: selections.map((selection) => selection.version) } },
          select: {
            version: true,
            original_filename: true,
            mime_type: true,
            content_hash: true,
            scan_status: true,
            purged_at: true,
          },
        },
      },
    });
    const versionsByKey = new Map(
      materialRows.flatMap((material) =>
        material.versions.map((version) => [
          `${material.id}:${version.version}`,
          { materialId: material.id, ...version },
        ] as const),
      ),
    );
    if (
      materialRows.length !== new Set(selections.map((item) => item.materialId)).size ||
      selections.some(
        (selection) => !versionsByKey.has(`${selection.materialId}:${selection.version}`),
      )
    ) {
      throw this.selectionNotFound();
    }
    const selectedVersions = selections.map((selection) => {
      const version = versionsByKey.get(`${selection.materialId}:${selection.version}`)!;
      if (version.scan_status !== MaterialScanStatus.ready || version.purged_at) {
        throw new ConflictApplicationError(
          'Every selected Material version must be ready and unpurged',
          'MATERIAL_ANALYSIS_VERSION_NOT_READY',
        );
      }
      return version;
    });

    const set = await this.database.materialAnalysisSet.create({
      data: {
        id: randomUUID(),
        project_id: projectId,
        owner_id: actor.id,
        purpose: MaterialAnalysisPurpose.project_material_drafting,
        versions: {
          create: selectedVersions.map((version) => ({
            material_id: version.materialId,
            material_version: version.version,
            original_filename: version.original_filename,
            mime_type: version.mime_type,
            content_hash: version.content_hash,
          })),
        },
      },
      include: { versions: { orderBy: { material_id: 'asc' } } },
    });
    return this.toSetDto(set);
  }

  async listSets(
    actor: AuthenticatedUser,
    projectId: string,
  ): Promise<MaterialAnalysisSetDto[]> {
    this.assertEnabled();
    this.assertActiveOwner(actor);
    await this.assertEntitled(actor);
    const project = await this.projects.getMaterialProjectContext(projectId);
    if (project.ownerId !== actor.id) throw this.projectNotFound();
    const sets = await this.database.materialAnalysisSet.findMany({
      where: { project_id: projectId, owner_id: actor.id },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      include: { versions: { orderBy: { material_id: 'asc' } } },
    });
    return sets.map((set) => this.toSetDto(set));
  }

  async startSet(
    actor: AuthenticatedUser,
    analysisSetId: string,
  ): Promise<MaterialAnalysisRunDto> {
    this.assertEnabled();
    this.assertActiveOwner(actor);
    await this.assertEntitled(actor);
    const analysisSet = await this.database.materialAnalysisSet.findFirst({
      where: { id: analysisSetId, owner_id: actor.id },
      include: { versions: { orderBy: { material_id: 'asc' } } },
    });
    if (!analysisSet) throw this.setNotFound();
    if (analysisSet.status === MaterialAnalysisSetStatus.running) {
      throw new ConflictApplicationError(
        'Material analysis is already running',
        'MATERIAL_ANALYSIS_ALREADY_RUNNING',
      );
    }

    const run = await this.database.materialAnalysisRun.create({
      data: {
        id: randomUUID(),
        analysis_set_id: analysisSet.id,
        contract_version: CONTRACT_VERSION,
        status: MaterialAnalysisRunStatus.requested,
      },
      include: { suggestions: true },
    });
    await this.database.materialAnalysisSet.update({
      where: { id: analysisSet.id },
      data: { status: MaterialAnalysisSetStatus.running },
    });

    try {
      if (!this.queue) {
        throw new ApplicationError(
          'Material analysis queue is not configured',
          'MATERIAL_ANALYSIS_QUEUE_NOT_CONFIGURED',
          503,
        );
      }
      await this.queue.enqueueRun({ runId: run.id });
      return this.toRunDto(run);
    } catch (error) {
      const errorCode = this.errorCode(error);
      await this.database.materialAnalysisRun.update({
        where: { id: run.id },
        data: {
          status: MaterialAnalysisRunStatus.failed,
          error_code: errorCode,
          completed_at: new Date(),
        },
      });
      await this.database.materialAnalysisSet.update({
        where: { id: analysisSet.id },
        data: { status: MaterialAnalysisSetStatus.failed },
      });
      throw error;
    }
  }

  /** Called by the queue worker; the HTTP command above only schedules work. */
  async processRun(runId: string): Promise<void> {
    const run = await this.database.materialAnalysisRun.findUnique({
      where: { id: runId },
      include: { analysisSet: true },
    });
    if (!run || run.status !== MaterialAnalysisRunStatus.requested) return;

    const claimed = await this.database.materialAnalysisRun.updateMany({
      where: { id: runId, status: MaterialAnalysisRunStatus.requested },
      data: {
        status: MaterialAnalysisRunStatus.running,
        started_at: new Date(),
      },
    });
    if (claimed.count !== 1) return;

    try {
      const input = await this.buildAnalysisInput(
        run.analysis_set_id,
        run.id,
        run.analysisSet.owner_id,
      );
      const result = await this.ai.requestMaterialAnalysis(input);
      await this.persistCompletedRun(run.id, run.analysis_set_id, result);
    } catch (error) {
      const errorCode = this.errorCode(error);
      await this.database.materialAnalysisRun.update({
        where: { id: run.id },
        data: {
          status: MaterialAnalysisRunStatus.failed,
          error_code: errorCode,
          completed_at: new Date(),
        },
      });
      await this.database.materialAnalysisSet.update({
        where: { id: run.analysis_set_id },
        data: { status: MaterialAnalysisSetStatus.failed },
      });
      if (!(error instanceof ApplicationError)) throw error;
    }
  }

  async getRun(
    actor: AuthenticatedUser,
    runId: string,
  ): Promise<MaterialAnalysisRunDto> {
    this.assertEnabled();
    this.assertActiveOwner(actor);
    await this.assertEntitled(actor);
    const run = await this.database.materialAnalysisRun.findFirst({
      where: { id: runId, analysisSet: { owner_id: actor.id } },
      include: { suggestions: { orderBy: { created_at: 'asc' } } },
    });
    if (!run) throw this.runNotFound();
    return this.toRunDto(run);
  }

  async getConstraints(
    actor: AuthenticatedUser,
    projectId: string,
  ) {
    this.assertEnabled();
    this.assertActiveOwner(actor);
    await this.assertEntitled(actor);
    const project = await this.projects.getMaterialProjectContext(projectId);
    if (project.ownerId !== actor.id) throw this.projectNotFound();
    return {
      maxDocuments: this.maxDocuments(),
      maxExtractedCharacters: this.maxExtractedCharacters(),
      supportedMimeTypes: [...SUPPORTED_ANALYSIS_MIME_TYPES],
    };
  }

  async rejectSuggestion(
    actor: AuthenticatedUser,
    suggestionId: string,
  ): Promise<MaterialDraftSuggestionDto> {
    this.assertEnabled();
    this.assertActiveOwner(actor);
    await this.assertEntitled(actor);
    const suggestion = await this.findSuggestion(actor, suggestionId);
    this.assertReviewable(suggestion);
    const reviewed = await this.database.materialDraftSuggestion.update({
      where: { id: suggestion.id },
      data: {
        status: 'rejected',
        reviewed_by: actor.id,
        reviewed_at: new Date(),
      },
    });
    return this.toSuggestionDto(reviewed);
  }

  async adoptProjectSuggestion(
    actor: AuthenticatedUser,
    suggestionId: string,
    input: AdoptProjectSuggestionDto,
  ) {
    this.assertEnabled();
    this.assertActiveOwner(actor);
    await this.assertEntitled(actor);
    const suggestion = await this.findSuggestion(actor, suggestionId);
    this.assertReviewable(suggestion);
    if (
      suggestion.suggestion_type !== MaterialDraftSuggestionType.project_update ||
      !suggestion.target_field
    ) {
      throw new ConflictApplicationError(
        'This suggestion is not a Project update',
        'MATERIAL_ANALYSIS_SUGGESTION_TYPE_MISMATCH',
      );
    }
    const payload = this.record(suggestion.payload);
    const value = payload.value;
    if (!['title', 'description', 'technologies', 'category', 'difficulty'].includes(suggestion.target_field)) {
      throw new ConflictApplicationError(
        'This Project update field cannot be adopted',
        'MATERIAL_ANALYSIS_SUGGESTION_FIELD_INVALID',
      );
    }
    if (!this.publication) {
      throw new ApplicationError(
        'Project adoption is not configured',
        'MATERIAL_ANALYSIS_ADOPTION_NOT_CONFIGURED',
        503,
      );
    }
    const project = await this.publication.updateProject(
      actor,
      suggestion.run.analysisSet.project_id,
      {
        expectedRevision: input.expectedRevision,
        [suggestion.target_field]: value,
      } as never,
      input.idempotencyKey,
    );
    const reviewed = await this.database.materialDraftSuggestion.update({
      where: { id: suggestion.id },
      data: {
        status: 'accepted',
        reviewed_by: actor.id,
        reviewed_at: new Date(),
        adopted_entity_type: 'project',
        adopted_entity_id: suggestion.run.analysisSet.project_id,
      },
    });
    return { suggestion: this.toSuggestionDto(reviewed), project };
  }

  async adoptContributionRequestSuggestion(
    actor: AuthenticatedUser,
    suggestionId: string,
    input: AdoptContributionRequestSuggestionDto,
  ) {
    this.assertEnabled();
    this.assertActiveOwner(actor);
    await this.assertEntitled(actor);
    const suggestion = await this.findSuggestion(actor, suggestionId);
    this.assertReviewable(suggestion);
    if (suggestion.suggestion_type !== MaterialDraftSuggestionType.contribution_request) {
      throw new ConflictApplicationError(
        'This suggestion is not a Contribution Request draft',
        'MATERIAL_ANALYSIS_SUGGESTION_TYPE_MISMATCH',
      );
    }
    const payload = this.record(suggestion.payload);
    const requirements = Array.isArray(payload.requirements) ? payload.requirements : [];
    const body = Object.assign(new CreateContributionRequestDto(), {
      title: this.requiredPayloadString(payload, 'title'),
      description: this.requiredPayloadString(payload, 'description'),
      requiredRequirements: requirements
        .filter((item) => this.record(item).kind === 'required')
        .map((item) => ({ text: this.requiredPayloadString(this.record(item), 'text') })),
      preferredRequirements: requirements
        .filter((item) => this.record(item).kind === 'preferred')
        .map((item) => ({ text: this.requiredPayloadString(this.record(item), 'text') })),
      technologyTags: Array.isArray(payload.technologyTags) ? payload.technologyTags : [],
      difficulty: payload.difficulty ?? null,
      applicationsCloseTime: input.applicationsCloseTime,
      targetCompletionDate: input.targetCompletionDate ?? null,
      reward: input.rewardCents == null ? null : input.rewardCents / 100,
      rewardCurrency: input.rewardCurrency ?? null,
    });
    if (!this.contributionTasks) {
      throw new ApplicationError(
        'Contribution Request adoption is not configured',
        'MATERIAL_ANALYSIS_ADOPTION_NOT_CONFIGURED',
        503,
      );
    }
    const request = await this.contributionTasks.createDraft({
      user: actor,
      projectId: suggestion.run.analysisSet.project_id,
      body,
      idempotencyKey: input.idempotencyKey,
    });
    const reviewed = await this.database.materialDraftSuggestion.update({
      where: { id: suggestion.id },
      data: {
        status: 'accepted',
        reviewed_by: actor.id,
        reviewed_at: new Date(),
        adopted_entity_type: 'contribution_request',
        adopted_entity_id: request.id,
      },
    });
    return { suggestion: this.toSuggestionDto(reviewed), contributionRequest: request };
  }

  private async buildAnalysisInput(
    analysisSetId: string,
    runId: string,
    ownerId: string,
  ): Promise<MaterialAnalysisInput> {
    const selected = await this.database.materialAnalysisSetVersion.findMany({
      where: { analysis_set_id: analysisSetId },
      orderBy: { material_id: 'asc' },
      include: {
        material: {
          select: { owner_id: true, project_id: true, deleted_at: true },
        },
      },
    });
    if (selected.length === 0 || selected.length > this.maxDocuments()) {
      throw this.selectionNotFound();
    }
    if (
      selected.some(
        (item) =>
          item.material.owner_id !== ownerId ||
          item.material.project_id === null ||
          item.material.deleted_at !== null,
      )
    ) {
      throw this.selectionNotFound();
    }
    const materials = [];
    for (const item of selected) {
      const version = await this.database.materialVersion.findUnique({
        where: {
          material_id_version: {
            material_id: item.material_id,
            version: item.material_version,
          },
        },
        select: {
          storage_key: true,
          mime_type: true,
          original_filename: true,
          content_hash: true,
          scan_status: true,
          purged_at: true,
        },
      });
      if (
        !version ||
        version.content_hash !== item.content_hash ||
        version.scan_status !== MaterialScanStatus.ready ||
        version.purged_at
      ) {
        throw new ConflictApplicationError(
          'A selected Material version is no longer ready',
          'MATERIAL_ANALYSIS_VERSION_NOT_READY',
        );
      }
      const content = await this.readStorage(version.storage_key);
      materials.push({
        materialId: item.material_id,
        version: item.material_version,
        filename: item.original_filename,
        mimeType: item.mime_type,
        contentBase64: content.toString('base64'),
      });
    }
    return {
      analysisRunId: runId,
      analysisSetId,
      projectId: selected[0].material.project_id!,
      purpose: 'PROJECT_MATERIAL_DRAFTING',
      materials,
      maxExtractedCharacters: this.maxExtractedCharacters(),
      contractVersion: CONTRACT_VERSION,
    };
  }

  private async persistCompletedRun(
    runId: string,
    analysisSetId: string,
    result: MaterialAnalysisResult,
  ) {
    const run = await this.database.$transaction(async (transaction) => {
      const updated = await transaction.materialAnalysisRun.update({
        where: { id: runId },
        data: {
          status: MaterialAnalysisRunStatus.completed,
          provider: result.metadata.provider,
          model: result.metadata.model,
          prompt_version: result.metadata.promptVersion,
          schema_version: result.metadata.schemaVersion,
          service_version: result.metadata.serviceVersion,
          document_count: result.metadata.documentCount,
          extracted_characters: result.metadata.extractedCharacters,
          completed_at: new Date(),
        },
      });
      for (const suggestion of result.projectSuggestions) {
        await transaction.materialDraftSuggestion.create({
          data: {
            id: randomUUID(),
            run_id: runId,
            suggestion_type: MaterialDraftSuggestionType.project_update,
            target_field: suggestion.targetField,
            payload: { value: suggestion.value },
            rationale: suggestion.rationale,
            source_versions: suggestion.sourceVersions,
          },
        });
      }
      for (const suggestion of result.contributionRequestSuggestions) {
        await transaction.materialDraftSuggestion.create({
          data: {
            id: randomUUID(),
            run_id: runId,
            suggestion_type: MaterialDraftSuggestionType.contribution_request,
            payload: {
              title: suggestion.title,
              description: suggestion.description,
              requirements: suggestion.requirements,
              technologyTags: suggestion.technologyTags,
              difficulty: suggestion.difficulty,
            },
            rationale: suggestion.rationale,
            source_versions: suggestion.sourceVersions,
          },
        });
      }
      for (const chunk of result.chunks ?? []) {
        const vectorLiteral = `[${chunk.embedding.join(',')}]`;
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO "MaterialAnalysisChunk"
            ("id", "run_id", "analysis_set_id", "material_id", "material_version",
             "chunk_index", "text", "character_start", "character_end", "embedding")
          VALUES
            (${randomUUID()}::uuid, ${runId}::uuid, ${analysisSetId}::uuid,
             ${chunk.materialId}::uuid, ${chunk.version},
             ${result.chunks.indexOf(chunk)}, ${chunk.text},
             ${chunk.characterStart}, ${chunk.characterEnd}, ${vectorLiteral}::vector)
        `);
      }
      await transaction.materialAnalysisSet.update({
        where: { id: analysisSetId },
        data: { status: MaterialAnalysisSetStatus.completed },
      });
      return transaction.materialAnalysisRun.findUniqueOrThrow({
        where: { id: updated.id },
        include: { suggestions: { orderBy: { created_at: 'asc' } } },
      });
    });
    return run;
  }

  private async readStorage(storageKey: string): Promise<Buffer> {
    let stream: Readable;
    try {
      stream = await this.storage.getStream(storageKey);
    } catch {
      throw new ApplicationError(
        'Selected Material content is unavailable',
        'MATERIAL_ANALYSIS_CONTENT_UNAVAILABLE',
        409,
      );
    }
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private uniqueSelections(input: CreateMaterialAnalysisSetDto) {
    if (input.materialVersions.length > this.maxDocuments()) {
      throw new ConflictApplicationError(
        `An Analysis Set may contain at most ${this.maxDocuments()} Material versions`,
        'MATERIAL_ANALYSIS_TOO_MANY_MATERIALS',
      );
    }
    const keys = input.materialVersions.map(
      (selection) => `${selection.materialId}:${selection.version}`,
    );
    if (keys.length !== new Set(keys).size) {
      throw new ConflictApplicationError(
        'An Analysis Set cannot repeat a Material version',
        'MATERIAL_ANALYSIS_DUPLICATE_VERSION',
      );
    }
    return input.materialVersions;
  }

  private assertEnabled() {
    if (!this.config.get<boolean>('MATERIAL_ANALYSIS_ENABLED', true)) {
      throw new ForbiddenApplicationError(
        'Material analysis is not enabled',
        'MATERIAL_ANALYSIS_NOT_ENTITLED',
      );
    }
  }

  private async assertEntitled(actor: AuthenticatedUser): Promise<void> {
    if (!this.config.get<boolean>('MATERIAL_ANALYSIS_REQUIRE_SUBSCRIPTION', false)) {
      return;
    }
    const minimumPlan = this.config.get<'bronze' | 'silver' | 'gold'>(
      'MATERIAL_ANALYSIS_MIN_PLAN',
      'gold',
    );
    const entitlement = await this.projects.getMaterialAnalysisEntitlement(
      actor.id,
      minimumPlan,
    );
    if (!entitlement.entitled) {
      throw new ForbiddenApplicationError(
        'The current subscription does not include Material analysis',
        'MATERIAL_ANALYSIS_NOT_ENTITLED',
      );
    }
  }

  private maxDocuments(): number {
    return this.config.get<number>('MATERIAL_ANALYSIS_MAX_DOCUMENTS', 5);
  }

  private maxExtractedCharacters(): number {
    return this.config.get<number>(
      'MATERIAL_ANALYSIS_MAX_EXTRACTED_CHARACTERS',
      250_000,
    );
  }

  private assertActiveOwner(actor: AuthenticatedUser) {
    if (actor.status !== 'active' || actor.role !== 'owner') {
      throw new ForbiddenApplicationError(
        'An active Project owner account is required',
        'MATERIAL_ANALYSIS_OWNER_REQUIRED',
      );
    }
  }

  private errorCode(error: unknown): string {
    if (error instanceof ApplicationError) return error.code;
    return 'MATERIAL_ANALYSIS_FAILED';
  }

  private toSetDto(set: Prisma.MaterialAnalysisSetGetPayload<{ include: { versions: true } }>): MaterialAnalysisSetDto {
    return {
      id: set.id,
      projectId: set.project_id,
      ownerId: set.owner_id,
      purpose: 'PROJECT_MATERIAL_DRAFTING',
      status: set.status.toUpperCase() as MaterialAnalysisSetDto['status'],
      materialVersions: set.versions.map(this.toSelectionDto),
      createdAt: set.created_at,
      updatedAt: set.updated_at,
    };
  }

  private toSelectionDto(
    version: MaterialAnalysisSetVersionRow,
  ): MaterialAnalysisSelectionDto {
    return {
      materialId: version.material_id,
      version: version.material_version,
      originalFilename: version.original_filename,
      mimeType: version.mime_type,
      contentHash: version.content_hash,
    };
  }

  private toRunDto(
    run: Prisma.MaterialAnalysisRunGetPayload<{ include: { suggestions: true } }>,
  ): MaterialAnalysisRunDto {
    return {
      id: run.id,
      analysisSetId: run.analysis_set_id,
      contractVersion: run.contract_version as 'material-draft-v1',
      status: run.status.toUpperCase() as MaterialAnalysisRunDto['status'],
      provider: run.provider,
      model: run.model,
      promptVersion: run.prompt_version,
      schemaVersion: run.schema_version,
      serviceVersion: run.service_version,
      documentCount: run.document_count,
      extractedCharacters: run.extracted_characters,
      errorCode: run.error_code,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      createdAt: run.created_at,
      suggestions: run.suggestions.map(this.toSuggestionDto),
    };
  }

  private toSuggestionDto(
    suggestion: MaterialDraftSuggestionRow,
  ): MaterialDraftSuggestionDto {
    return {
      id: suggestion.id,
      type:
        suggestion.suggestion_type === MaterialDraftSuggestionType.project_update
          ? 'PROJECT_UPDATE'
          : 'CONTRIBUTION_REQUEST',
      targetField: suggestion.target_field,
      payload: suggestion.payload,
      rationale: suggestion.rationale,
      sourceVersions: suggestion.source_versions as Array<{
        materialId: string;
        version: number;
      }>,
      status: suggestion.status.toUpperCase() as MaterialDraftSuggestionDto['status'],
      reviewedAt: suggestion.reviewed_at,
      sourceRemovedAt: suggestion.source_removed_at,
      adoptedEntityType: suggestion.adopted_entity_type,
      adoptedEntityId: suggestion.adopted_entity_id,
      createdAt: suggestion.created_at,
    };
  }

  private async findSuggestion(actor: AuthenticatedUser, suggestionId: string) {
    const suggestion = await this.database.materialDraftSuggestion.findFirst({
      where: { id: suggestionId, run: { analysisSet: { owner_id: actor.id } } },
      include: { run: { include: { analysisSet: true } } },
    });
    if (!suggestion) {
      throw new NotFoundApplicationError(
        'Material draft suggestion was not found',
        'MATERIAL_ANALYSIS_SUGGESTION_NOT_FOUND',
      );
    }
    return suggestion;
  }

  private assertReviewable(suggestion: { status: string; source_removed_at: Date | null }) {
    if (suggestion.source_removed_at) {
      throw new ConflictApplicationError(
        'The source Material was deleted; this draft cannot be adopted',
        'MATERIAL_ANALYSIS_SOURCE_REMOVED',
      );
    }
    if (suggestion.status !== 'pending') {
      throw new ConflictApplicationError(
        'This draft suggestion has already been reviewed',
        'MATERIAL_ANALYSIS_SUGGESTION_ALREADY_REVIEWED',
      );
    }
  }

  private record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ConflictApplicationError(
        'Material analysis payload is invalid',
        'MATERIAL_ANALYSIS_PAYLOAD_INVALID',
      );
    }
    return value as Record<string, unknown>;
  }

  private requiredPayloadString(payload: Record<string, unknown>, key: string): string {
    const value = payload[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new ConflictApplicationError(
        'Material analysis payload is invalid',
        'MATERIAL_ANALYSIS_PAYLOAD_INVALID',
      );
    }
    return value.trim();
  }

  private projectNotFound() {
    return new NotFoundApplicationError(
      'Project was not found',
      'MATERIAL_ANALYSIS_PROJECT_NOT_FOUND',
    );
  }

  private selectionNotFound() {
    return new NotFoundApplicationError(
      'Selected Material version was not found',
      'MATERIAL_ANALYSIS_VERSION_NOT_FOUND',
    );
  }

  private setNotFound() {
    return new NotFoundApplicationError(
      'Material Analysis Set was not found',
      'MATERIAL_ANALYSIS_SET_NOT_FOUND',
    );
  }

  private runNotFound() {
    return new NotFoundApplicationError(
      'Material Analysis Run was not found',
      'MATERIAL_ANALYSIS_RUN_NOT_FOUND',
    );
  }
}
