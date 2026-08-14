import { Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import { MaterialScanStatus, ProjectStatus } from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { MaterialAnalysisService } from './material-analysis.service';

describe('MaterialAnalysisService', () => {
  const ownerId = '77777777-7777-4777-8777-777777777777';
  const projectId = '33333333-3333-4333-8333-333333333333';
  const materialId = '44444444-4444-4444-8444-444444444444';
  const actor: AuthenticatedUser = {
    id: ownerId,
    email: 'owner@example.com',
    role: 'owner',
    status: 'active',
  };
  const database = {
    material: { findMany: jest.fn() },
    materialAnalysisSet: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    materialAnalysisRun: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    materialAnalysisSetVersion: { findMany: jest.fn() },
    materialVersion: { findUnique: jest.fn() },
    materialDraftSuggestion: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };
  const config = {
    get: jest.fn((_key: string, fallback: unknown) => fallback),
  };
  const projects = { getMaterialProjectContext: jest.fn() };
  const storage = { getStream: jest.fn() };
  const ai = { requestMaterialAnalysis: jest.fn() };
  const entitlements = { hasMinimumOwnerPlan: jest.fn() };
  const queue = { enqueueRun: jest.fn() };
  const publication = { updateProject: jest.fn() };
  const contributionTasks = { createDraft: jest.fn() };
  const service = new MaterialAnalysisService(
    database as never,
    config as unknown as ConfigService,
    projects as never,
    storage as never,
    ai as never,
    entitlements as never,
    queue as never,
    publication as never,
    contributionTasks as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    projects.getMaterialProjectContext.mockResolvedValue({
      id: projectId,
      ownerId,
      status: ProjectStatus.draft,
    });
    database.material.findMany.mockResolvedValue([
      {
        id: materialId,
        versions: [
          {
            version: 2,
            original_filename: 'brief.md',
            mime_type: 'text/markdown',
            content_hash: 'a'.repeat(64),
            scan_status: MaterialScanStatus.ready,
            purged_at: null,
          },
        ],
      },
    ]);
    database.materialAnalysisSet.create.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      project_id: projectId,
      owner_id: ownerId,
      purpose: 'project_material_drafting',
      status: 'draft',
      created_at: new Date('2026-08-09T12:00:00Z'),
      updated_at: new Date('2026-08-09T12:00:00Z'),
      versions: [
        {
          material_id: materialId,
          material_version: 2,
          original_filename: 'brief.md',
          mime_type: 'text/markdown',
          content_hash: 'a'.repeat(64),
        },
      ],
    });
  });

  it('snapshots the exact ready Material version and does not start AI work', async () => {
    const result = await service.createSet(actor, projectId, {
      materialVersions: [{ materialId, version: 2 }],
    });

    expect(result.materialVersions[0]).toMatchObject({
      materialId,
      version: 2,
      originalFilename: 'brief.md',
    });
    expect(database.materialAnalysisSet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          project_id: projectId,
          owner_id: ownerId,
          versions: {
            create: [
              expect.objectContaining({ material_id: materialId, material_version: 2 }),
            ],
          },
        }),
      }),
    );
  });

  it('does not let a contributor create an Analysis Set', async () => {
    await expect(
      service.createSet(
        { ...actor, role: 'contributor' },
        projectId,
        { materialVersions: [{ materialId, version: 2 }] },
      ),
    ).rejects.toMatchObject({ code: 'MATERIAL_ANALYSIS_OWNER_REQUIRED' });
    expect(database.material.findMany).not.toHaveBeenCalled();
  });

  it('refuses a version that has not passed the Material scan', async () => {
    database.material.findMany.mockResolvedValueOnce([
      {
        id: materialId,
        versions: [
          {
            version: 2,
            original_filename: 'brief.md',
            mime_type: 'text/markdown',
            content_hash: 'a'.repeat(64),
            scan_status: MaterialScanStatus.quarantined,
            purged_at: null,
          },
        ],
      },
    ]);

    await expect(
      service.createSet(actor, projectId, {
        materialVersions: [{ materialId, version: 2 }],
      }),
    ).rejects.toMatchObject({ code: 'MATERIAL_ANALYSIS_VERSION_NOT_READY' });
    expect(database.materialAnalysisSet.create).not.toHaveBeenCalled();
  });

  it('queues the Run, then processes it asynchronously and persists suggestions atomically', async () => {
    const analysisSetId = '55555555-5555-4555-8555-555555555555';
    const runId = '66666666-6666-4666-8666-666666666666';
    database.materialAnalysisSet.findFirst.mockResolvedValue({
      id: analysisSetId,
      owner_id: ownerId,
      versions: [
        {
          material_id: materialId,
          material_version: 2,
          original_filename: 'brief.md',
          mime_type: 'text/markdown',
          content_hash: 'a'.repeat(64),
        },
      ],
    });
    database.materialAnalysisRun.create.mockResolvedValue({
      id: runId,
      analysis_set_id: analysisSetId,
      contract_version: 'material-draft-v1',
      status: 'requested',
      provider: null,
      model: null,
      prompt_version: null,
      schema_version: null,
      service_version: null,
      document_count: null,
      extracted_characters: null,
      error_code: null,
      started_at: null,
      completed_at: null,
      created_at: new Date(),
      suggestions: [],
    });
    database.materialAnalysisRun.update.mockResolvedValue({ id: runId });
    database.materialAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    database.materialAnalysisRun.findUnique.mockResolvedValue({
      id: runId,
      analysis_set_id: analysisSetId,
      status: 'requested',
      analysisSet: { owner_id: ownerId },
    });
    database.materialAnalysisSet.update.mockResolvedValue({ id: analysisSetId });
    database.materialAnalysisSetVersion.findMany.mockResolvedValue([
      {
        material_id: materialId,
        material_version: 2,
        original_filename: 'brief.md',
        mime_type: 'text/markdown',
        content_hash: 'a'.repeat(64),
        material: { owner_id: ownerId, project_id: projectId, deleted_at: null },
      },
    ]);
    database.materialVersion.findUnique.mockResolvedValue({
      storage_key: 'material/brief',
      mime_type: 'text/markdown',
      original_filename: 'brief.md',
      content_hash: 'a'.repeat(64),
      scan_status: MaterialScanStatus.ready,
      purged_at: null,
    });
    storage.getStream.mockResolvedValue(Readable.from([Buffer.from('# Brief')]));
    ai.requestMaterialAnalysis.mockResolvedValue({
      status: 'COMPLETED',
      projectSuggestions: [
        {
          targetField: 'title',
          value: 'A better title',
          rationale: 'The brief names the project.',
          sourceVersions: [{ materialId, version: 2 }],
        },
      ],
      contributionRequestSuggestions: [],
      metadata: {
        provider: 'fixture',
        model: 'fixture',
        promptVersion: 'material-draft-v1',
        schemaVersion: 'material-draft-v1',
        serviceVersion: 'test',
        latencyMs: 1,
        documentCount: 1,
        extractedCharacters: 7,
      },
    });
    const completedRun = {
      id: runId,
      analysis_set_id: analysisSetId,
      contract_version: 'material-draft-v1',
      status: 'completed',
      provider: 'fixture',
      model: 'fixture',
      prompt_version: 'material-draft-v1',
      schema_version: 'material-draft-v1',
      service_version: 'test',
      document_count: 1,
      extracted_characters: 7,
      error_code: null,
      started_at: new Date(),
      completed_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
      suggestions: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          run_id: runId,
          suggestion_type: 'project_update',
          target_field: 'title',
          payload: { value: 'A better title' },
          rationale: 'The brief names the project.',
          source_versions: [{ materialId, version: 2 }],
          status: 'pending',
          reviewed_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    };
    const transaction = {
      materialAnalysisRun: {
        update: jest.fn().mockResolvedValue({ id: runId }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(completedRun),
      },
      materialDraftSuggestion: { create: jest.fn() },
      materialAnalysisSet: { update: jest.fn() },
    };
    database.$transaction.mockImplementation(async (callback) => callback(transaction));

    const result = await service.startSet(actor, analysisSetId);

    expect(result.status).toBe('REQUESTED');
    expect(queue.enqueueRun).toHaveBeenCalledWith({ runId });
    expect(storage.getStream).not.toHaveBeenCalled();
    expect(ai.requestMaterialAnalysis).not.toHaveBeenCalled();

    await service.processRun(runId);

    expect(storage.getStream).toHaveBeenCalledWith('material/brief');
    expect(ai.requestMaterialAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisSetId,
        analysisRunId: runId,
        materials: [expect.objectContaining({ materialId, version: 2 })],
      }),
    );
    expect(transaction.materialDraftSuggestion.create).toHaveBeenCalledTimes(1);
    expect(transaction.materialDraftSuggestion.create).toHaveBeenCalledTimes(1);
  });

  it('adopts a Project suggestion through the revision-checked Project service', async () => {
    const suggestion = {
      id: '77777777-7777-4777-8777-777777777777',
      suggestion_type: 'project_update',
      target_field: 'title',
      payload: { value: 'A better title' },
      rationale: 'The brief names the project.',
      source_versions: [{ materialId, version: 2 }],
      status: 'pending',
      reviewed_at: null,
      source_removed_at: null,
      adopted_entity_type: null,
      adopted_entity_id: null,
      created_at: new Date(),
      run: { analysisSet: { project_id: projectId } },
    };
    database.materialDraftSuggestion.findFirst.mockResolvedValue(suggestion);
    database.materialDraftSuggestion.update.mockResolvedValue({
      ...suggestion,
      status: 'accepted',
      reviewed_at: new Date(),
      adopted_entity_type: 'project',
      adopted_entity_id: projectId,
    });
    publication.updateProject.mockResolvedValue({ id: projectId, revision: 2 });

    const result = await service.adoptProjectSuggestion(actor, suggestion.id, {
      expectedRevision: 1,
      idempotencyKey: 'project-adoption-key',
    });

    expect(publication.updateProject).toHaveBeenCalledWith(
      actor,
      projectId,
      { expectedRevision: 1, title: 'A better title' },
      'project-adoption-key',
    );
    expect(result.suggestion.status).toBe('ACCEPTED');
    expect(result.project).toEqual({ id: projectId, revision: 2 });
  });

  it('creates a draft Contribution Request from a reviewed suggestion', async () => {
    const suggestion = {
      id: '77777777-7777-4777-8777-777777777777',
      suggestion_type: 'contribution_request',
      target_field: null,
      payload: {
        title: 'Add API tests',
        description: 'Create focused tests for the API boundary.',
        requirements: [
          { kind: 'required', text: 'Write API tests' },
          { kind: 'preferred', text: 'Know TypeScript' },
        ],
        technologyTags: ['TypeScript'],
        difficulty: 'intermediate',
      },
      rationale: 'The brief identifies an API surface without test coverage.',
      source_versions: [{ materialId, version: 2 }],
      status: 'pending',
      reviewed_at: null,
      source_removed_at: null,
      adopted_entity_type: null,
      adopted_entity_id: null,
      created_at: new Date(),
      run: { analysisSet: { project_id: projectId } },
    };
    database.materialDraftSuggestion.findFirst.mockResolvedValue(suggestion);
    database.materialDraftSuggestion.update.mockResolvedValue({
      ...suggestion,
      status: 'accepted',
      reviewed_at: new Date(),
      adopted_entity_type: 'contribution_request',
      adopted_entity_id: '88888888-8888-4888-8888-888888888888',
    });
    contributionTasks.createDraft.mockResolvedValue({
      id: '88888888-8888-4888-8888-888888888888',
    });

    const result = await service.adoptContributionRequestSuggestion(
      actor,
      suggestion.id,
      {
        applicationsCloseTime: '2099-08-09T12:00:00.000Z',
        idempotencyKey: 'contribution-adoption-key',
      },
    );

    expect(contributionTasks.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        user: actor,
        projectId,
        idempotencyKey: 'contribution-adoption-key',
        body: expect.objectContaining({
          title: 'Add API tests',
          requiredRequirements: [{ text: 'Write API tests' }],
          preferredRequirements: [{ text: 'Know TypeScript' }],
          applicationsCloseTime: '2099-08-09T12:00:00.000Z',
        }),
      }),
    );
    expect(result.suggestion.status).toBe('ACCEPTED');
    expect(result.contributionRequest.id).toBe('88888888-8888-4888-8888-888888888888');
  });
});
