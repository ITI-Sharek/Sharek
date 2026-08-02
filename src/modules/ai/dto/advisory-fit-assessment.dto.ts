export interface AdvisoryFitAssessmentInput {
  assessmentRequestId: string;
  requirements: unknown[];
  evidence: unknown[];
  allowedEvidenceIds: string[];
  requestedAt: string;
  contractVersion: 'advisory-fit-v1';
}

export type AdvisoryFitFinding = {
  requirementId: string;
  requirementKind: 'required' | 'preferred';
  finding:
    | 'SUPPORTED'
    | 'PARTIALLY_SUPPORTED'
    | 'NOT_EVIDENCED'
    | 'INCONCLUSIVE';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  citations: string[];
  uncertainty: string[];
  explanation: string;
};

export type AdvisoryFitAssessmentResult =
  | { kind: 'system_limit' }
  | { kind: 'no_assessable_evidence' }
  | {
      kind: 'completed';
      findings: AdvisoryFitFinding[];
      provider: string;
      model: string;
      promptVersion: string;
      schemaVersion: string;
      serviceVersion: string;
      latencyMs?: number;
      inputTokens?: number;
      outputTokens?: number;
    };
