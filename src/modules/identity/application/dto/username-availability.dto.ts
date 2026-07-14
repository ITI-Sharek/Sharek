export type UsernameAvailabilityReason = 'invalid_format' | 'reserved' | 'taken';

export interface UsernameAvailabilityDto {
  available: boolean;
  suggestion: string | null;
  reason: UsernameAvailabilityReason | null;
}
