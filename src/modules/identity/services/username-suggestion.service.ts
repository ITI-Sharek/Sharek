import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';

import { DatabaseService } from '../../../shared/database/database.service';

const USERNAME_MAX_LENGTH = 30;

@Injectable()
export class UsernameSuggestionService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Generates a list of available, high-quality username suggestions
   * by trying various sophisticated strategies (numbers, years, prefixes).
   */
  async generateSuggestions(
    requestedUsername: string,
    limit: number = 3,
  ): Promise<string[]> {
    const base = this.extractBaseUsername(requestedUsername);
    if (base.length < 3) {
      return [];
    }

    const candidates = this.generateCandidates(base);
    
    // Find which of these candidates already exist in the database
    const existingUsers = await this.database.user.findMany({
      where: {
        username: {
          in: candidates,
        },
      },
      select: { username: true },
    });

    const takenUsernames = new Set(existingUsers.map((u) => u.username));

    // Filter available candidates and limit
    const availableSuggestions: string[] = [];
    for (const candidate of candidates) {
      if (!takenUsernames.has(candidate)) {
        availableSuggestions.push(candidate);
        if (availableSuggestions.length >= limit) {
          break;
        }
      }
    }

    return availableSuggestions;
  }

  /**
   * Strips any trailing numbers or hyphens to get the clean base name.
   * e.g., 'ahmed-dev-123' -> 'ahmed-dev'
   */
  private extractBaseUsername(username: string): string {
    let base = username.trim().toLowerCase();
    // Remove trailing numbers and hyphens
    base = base.replace(/[-\d]+$/, '');
    
    // If stripping removed everything (e.g. they typed '12345'), revert to original
    if (base.length < 3) {
      base = username.trim().toLowerCase();
    }
    return base;
  }

  /**
   * Generates a wide pool of smart candidate usernames based on the base string.
   */
  private generateCandidates(base: string): string[] {
    const candidates = new Set<string>();

    // Strategy 1: Random Numbers (2 to 4 digits)
    for (let i = 0; i < 5; i++) {
      const suffix = `-${randomInt(10, 9999)}`;
      candidates.add(this.applySuffix(base, suffix));
    }

    // Strategy 2: Year-like numbers (e.g., 99, 24)
    const years = ['99', '24', '00', '88', '11'];
    for (const year of years) {
      candidates.add(this.applySuffix(base, `-${year}`));
    }

    // Strategy 3: Prefixes
    const prefixes = ['the-', 'real-', 'iam', 'its'];
    for (const prefix of prefixes) {
      const prepended = `${prefix}${base}`;
      if (this.isValidLength(prepended)) {
        candidates.add(prepended);
      }
    }

    // Return as array, ensuring they all match the basic length rules
    return Array.from(candidates).filter(c => this.isValidLength(c));
  }

  private applySuffix(base: string, suffix: string): string {
    // Ensure we don't exceed the max length
    const maxBaseLength = USERNAME_MAX_LENGTH - suffix.length;
    const truncatedBase = base.slice(0, maxBaseLength);
    return `${truncatedBase}${suffix}`;
  }

  private isValidLength(candidate: string): boolean {
    return candidate.length >= 3 && candidate.length <= USERNAME_MAX_LENGTH;
  }
}
