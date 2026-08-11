export type ContributorMatchingRequirementKind = 'required' | 'preferred';
export type ContributorMatchingProficiency =
  | 'beginner'
  | 'intermediate'
  | 'advanced';

export interface ContributorMatchingRequirementSnapshot {
  id: string;
  kind: ContributorMatchingRequirementKind;
  position: number;
  text: string;
}

export interface ContributorMatchingApprovedSkillSnapshot {
  skillProfileId: string;
  name: string;
  proficiency: ContributorMatchingProficiency;
  confidence: number;
  evidenceIds: string[];
  evidenceSummary?: string | null;
}

export interface ContributorMatchingReputationSnapshot {
  rating: number | null;
  completedContributions: number;
  successRate: number;
  topVerifiedSkills: string[];
}

export interface ContributorMatchingCandidateSnapshot {
  contributorId: string;
  displayName: string;
  username: string | null;
  approvedSkills: ContributorMatchingApprovedSkillSnapshot[];
  reputation: ContributorMatchingReputationSnapshot;
}

export type ContributorMatchingEvidenceType =
  | 'approved_skill'
  | 'contribution_requirement'
  | 'reputation_signal'
  | 'retrieved_evidence';

export interface ContributorMatchingEvidenceCapsule {
  evidenceId: string;
  type: ContributorMatchingEvidenceType;
  label: string;
  summary?: string | null;
  contributorId?: string | null;
}

export interface ContributorMatchingInput {
  matchingRequestId: string;
  contributionRequestId: string;
  title: string;
  description: string;
  requirements: ContributorMatchingRequirementSnapshot[];
  candidates: ContributorMatchingCandidateSnapshot[];
  evidence: ContributorMatchingEvidenceCapsule[];
  allowedEvidenceIds: string[];
  requestedAt: string;
  contractVersion: 'contributor-matching-v1';
}

export interface ContributorMatchingMatchedSkill {
  name: string;
  proficiency: ContributorMatchingProficiency;
  evidenceIds: string[];
}

export type ContributorMatchingConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ContributorMatchingProviderMatch {
  contributorId: string;
  matchScore: number;
  confidence: ContributorMatchingConfidence;
  justification: string;
  matchedSkills: ContributorMatchingMatchedSkill[];
  evidenceIds: string[];
}

export interface ContributorMatchingMetadata {
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  serviceVersion: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export type ContributorMatchingResult =
  | { kind: 'no_candidates' }
  | { kind: 'system_limit' }
  | {
      kind: 'completed';
      matches: ContributorMatchingProviderMatch[];
      metadata: ContributorMatchingMetadata;
    };
