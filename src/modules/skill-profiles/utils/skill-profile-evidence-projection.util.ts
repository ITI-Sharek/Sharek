export interface BoundedSkillEvidenceSources {
  evidenceIds: string[];
  limitations: string[];
}

export function toBoundedSkillEvidenceSources(
  value: unknown,
): BoundedSkillEvidenceSources {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { evidenceIds: [], limitations: [] };
  }
  const record = value as Record<string, unknown>;
  return {
    evidenceIds: stringArray(record.evidenceIds),
    limitations: stringArray(record.limitations),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').slice(0, 50)
    : [];
}
