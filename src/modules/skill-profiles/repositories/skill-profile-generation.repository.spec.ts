import { SkillProfileGenerationRepository } from './skill-profile-generation.repository';

describe('SkillProfileGenerationRepository', () => {
  it('loads the authenticated user latest generation with skills', async () => {
    const database = {
      skillProfileGeneration: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const repository = new SkillProfileGenerationRepository(database as never);

    await repository.findLatestForUser('user-1');

    expect(database.skillProfileGeneration.findFirst).toHaveBeenCalledWith({
      where: { user_id: 'user-1' },
      include: {
        skillProfiles: { orderBy: { created_at: 'asc' } },
      },
      orderBy: { created_at: 'desc' },
    });
  });

  it('supersedes older pending aliases before creating current candidates', async () => {
    const database = {
      skillProfileGeneration: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ user_id: 'user-1' }),
        update: jest.fn().mockReturnValue({ operation: 'update-generation' }),
      },
      skillProfile: {
        deleteMany: jest.fn().mockReturnValue({ operation: 'delete-current' }),
        updateMany: jest.fn().mockReturnValue({ operation: 'supersede-old' }),
        create: jest.fn().mockReturnValue({ operation: 'create-skill' }),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const repository = new SkillProfileGenerationRepository(
      database as never,
    );

    await repository.completeWithPendingSkills({
      generationId: 'generation-2',
      skills: [
        {
          name: 'TypeScript',
          key: 'typescript',
          proficiency: 'intermediate',
          confidence: 0.8,
          evidenceSummary: 'Authored TypeScript changes',
          evidenceSources: { evidenceIds: ['github:user/repo'] },
        },
      ],
      fraudSignals: [],
      evidenceQuality: 'medium',
      provider: 'groq',
      model: 'model',
      promptVersion: 'v1',
      schemaVersion: 'v1',
      serviceVersion: 'v1',
      evidenceSnapshot: { repositories: [{}], failures: [] },
    });

    expect(database.skillProfile.updateMany).toHaveBeenCalledWith({
      where: {
        user_id: 'user-1',
        generation_id: { not: 'generation-2' },
        status: 'pending',
        skill_key: { in: ['typescript'] },
      },
      data: {
        status: 'superseded',
        superseded_at: expect.any(Date),
      },
    });
    expect(database.skillProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        skill_name: 'TypeScript',
        skill_key: 'typescript',
        status: 'pending',
      }),
    });
  });
});
