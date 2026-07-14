import { canonicalizeSkillName } from './skill-name.policy';

describe('canonicalizeSkillName', () => {
  it('maps common aliases to one canonical skill', () => {
    expect(canonicalizeSkillName(' ts ')).toEqual({
      key: 'typescript',
      name: 'TypeScript',
    });
    expect(canonicalizeSkillName('TypeScript')).toEqual({
      key: 'typescript',
      name: 'TypeScript',
    });
    expect(canonicalizeSkillName('C Sharp')).toEqual({
      key: 'c#',
      name: 'C#',
    });
    expect(canonicalizeSkillName('C++')).toEqual({
      key: 'c++',
      name: 'C++',
    });
  });

  it('normalizes unknown skill names without discarding them', () => {
    expect(canonicalizeSkillName('  REST   API Design  ')).toEqual({
      key: 'rest api design',
      name: 'REST API Design',
    });
  });
});
