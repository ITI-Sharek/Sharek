export type AssessmentRequestStatusDto =
  | 'NOT_REQUESTED'
  | 'REQUESTED'
  | 'COMPLETED'
  | 'NOT_STARTED_SYSTEM_LIMIT'
  | 'NOT_STARTED_NO_ASSESSABLE_EVIDENCE'
  | 'CANCELLED_NOT_NEEDED'
  | 'UNAVAILABLE';

export type AssessmentFitBandDto =
  | 'STRONG'
  | 'PARTIAL'
  | 'LIMITED'
  | 'UNKNOWN'
  | 'UNAVAILABLE';

export type AssessmentFindingDto = {
  requirementId: string;
  requirementKind: 'REQUIRED' | 'PREFERRED';
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

export interface AdvisoryFitAssessmentDto {
  id: string | null;
  applicationId: string;
  requestStatus: AssessmentRequestStatusDto;
  fitBand: AssessmentFitBandDto | null;
  findings: AssessmentFindingDto[];
  presentedAt: Date | null;
  requestedAt: Date | null;
  completedAt: Date | null;
  attempts: number;
}
