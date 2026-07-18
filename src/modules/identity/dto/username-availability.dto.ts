export type UsernameAvailabilityReason = 'invalid_format' | 'reserved' | 'taken';

export interface UsernameAvailabilityDto {
  available: boolean;
  reason: UsernameAvailabilityReason | null;
}
