export abstract class SkillProfileGenerationJobQueue {
  abstract enqueue(generationId: string): Promise<void>;
  abstract hasJob(generationId: string): Promise<boolean>;
}
