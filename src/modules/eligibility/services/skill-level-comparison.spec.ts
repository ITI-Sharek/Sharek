import { SkillProfileProficiencyLevel } from '@prisma/client';

import {
  findBlockingSkills,
  indexApprovedSkills,
  meetsLevel,
} from './skill-level-comparison';

const { beginner, intermediate, advanced } = SkillProfileProficiencyLevel;

const required = (
  skillName: string,
  requiredLevel: SkillProfileProficiencyLevel,
  kind: 'required' | 'preferred' = 'required',
) => ({
  skillName,
  skillNameNormalized: skillName.toLowerCase().replace(/[^a-z0-9+#]/g, ''),
  requiredLevel,
  kind,
});

const approved = (name: string, proficiencyLevel: SkillProfileProficiencyLevel) => ({
  name,
  proficiencyLevel,
});

describe('skill level comparison', () => {
  describe('the level matrix', () => {
    it.each([
      // held, required, clears
      [beginner, beginner, true],
      [beginner, intermediate, false],
      [beginner, advanced, false],
      [intermediate, beginner, true],
      [intermediate, intermediate, true],
      [intermediate, advanced, false],
      [advanced, beginner, true],
      [advanced, intermediate, true],
      [advanced, advanced, true],
    ])('holding %s against a required %s clears: %s', (held, bar, clears) => {
      expect(meetsLevel(held, bar)).toBe(clears);
    });

    it('lets an exact match through', () => {
      // `>=`, not `>`. Requiring strictly more would make every stated level
      // mean one level higher than it says, and no owner could express
      // "intermediate is enough".
      expect(
        findBlockingSkills(
          [required('React', intermediate)],
          [approved('React', intermediate)],
        ),
      ).toEqual([]);
    });
  });

  describe('blocking', () => {
    it('blocks a skill held below the bar and names both levels', () => {
      expect(
        findBlockingSkills(
          [required('React', advanced)],
          [approved('React', beginner)],
        ),
      ).toEqual([
        {
          skillName: 'React',
          requiredLevel: advanced,
          contributorLevel: beginner,
        },
      ]);
    });

    it('blocks a skill the contributor does not hold, with a null level', () => {
      // Distinct from holding it too low: the recovery advice differs, so the
      // UI has to be able to tell them apart.
      expect(
        findBlockingSkills(
          [required('Rust', beginner)],
          [approved('React', advanced)],
        ),
      ).toEqual([
        { skillName: 'Rust', requiredLevel: beginner, contributorLevel: null },
      ]);
    });

    it('names every required skill for a contributor with no approved skills', () => {
      // Never an empty list. "You are blocked" with no stated reason is exactly
      // the dead end DEC-078 exists to remove.
      const blocking = findBlockingSkills(
        [
          required('React', advanced),
          required('Node.js', intermediate),
          required('PostgreSQL', beginner),
        ],
        [],
      );
      expect(blocking).toHaveLength(3);
      expect(blocking.every((skill) => skill.contributorLevel === null)).toBe(true);
    });

    it('preserves the order the Request states its skills in', () => {
      // Two contributors reading the same refusal see the same list in the same
      // order.
      const blocking = findBlockingSkills(
        [
          required('React', advanced),
          required('Rust', advanced),
          required('Go', advanced),
        ],
        [],
      );
      expect(blocking.map((skill) => skill.skillName)).toEqual([
        'React',
        'Rust',
        'Go',
      ]);
    });

    it('never blocks on a preferred row', () => {
      expect(
        findBlockingSkills(
          [required('GraphQL', advanced, 'preferred')],
          [],
        ),
      ).toEqual([]);
    });

    it('blocks on required while ignoring preferred in the same set', () => {
      const blocking = findBlockingSkills(
        [
          required('React', advanced),
          required('GraphQL', advanced, 'preferred'),
        ],
        [approved('React', beginner)],
      );
      expect(blocking.map((skill) => skill.skillName)).toEqual(['React']);
    });

    it('is eligible when the Request asks for nothing', () => {
      expect(findBlockingSkills([], [approved('React', beginner)])).toEqual([]);
    });
  });

  describe('skill identity', () => {
    it('matches across spellings of one skill', () => {
      // Same normalization the unique index on the bar is built on, so a skill
      // that matched during shortlisting cannot fail to match here.
      expect(
        findBlockingSkills(
          [required('Node.js', intermediate)],
          [approved('nodejs', advanced)],
        ),
      ).toEqual([]);
    });

    it('keeps the highest level when a contributor holds a skill twice', () => {
      // Picking arbitrarily would make the verdict depend on row order.
      const held = indexApprovedSkills([
        approved('React', beginner),
        approved('react', advanced),
        approved('React', intermediate),
      ]);
      expect(held.get('react')).toBe(advanced);
      expect(held.size).toBe(1);
    });

    it('ignores an approved skill whose name normalizes to nothing', () => {
      expect(indexApprovedSkills([approved('---', advanced)]).size).toBe(0);
    });
  });

  describe('purity', () => {
    it('returns the same verdict for the same inputs', () => {
      // Clock-free and side-effect-free, which is what makes a refusal
      // reproducible for a dispute months later (ADR 0015).
      const bar = [required('React', advanced), required('Rust', beginner)];
      const skills = [approved('React', intermediate)];
      expect(findBlockingSkills(bar, skills)).toEqual(
        findBlockingSkills(bar, skills),
      );
    });

    it('does not mutate its inputs', () => {
      const bar = [required('React', advanced)];
      const skills = [approved('React', beginner)];
      const barCopy = JSON.parse(JSON.stringify(bar));
      const skillsCopy = JSON.parse(JSON.stringify(skills));
      findBlockingSkills(bar, skills);
      expect(bar).toEqual(barCopy);
      expect(skills).toEqual(skillsCopy);
    });
  });
});
