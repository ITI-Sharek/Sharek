export interface EmbeddingInput {
  text: string;
  sourceId: string;
}

export interface EmbeddingResult {
  vector: number[];
  provider: string;
  model: string;
}

export abstract class EmbeddingGenerator {
  abstract generate(input: EmbeddingInput): Promise<EmbeddingResult>;
}

