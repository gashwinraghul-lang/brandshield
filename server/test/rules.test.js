const { runRules, readingGrade } = require('../src/services/ruleEngine');
const { maskContent, restoreContent } = require('../src/services/masking');

function makeRule(type, config, overrides = {}) {
  return {
    code: `TEST-${type.toUpperCase()}`,
    name: `Test ${type}`,
    type,
    config,
    severity: 'warning',
    guideline_ref: 'TONE-01',
    channel: null,
    active: 1,
    ...overrides,
  };
}

function run({ content, type = 'text', altText = '', channel = 'website', rules = [], terminology = [] }) {
  return runRules({ content, type, altText, channel, rules, terminology });
}

describe('deterministic rule engine', () => {
  it('flags banned phrases with a reference and suggestion', () => {
    const { findings } = run({
      content: 'We are a world-class team.',
      rules: [makeRule('banned_phrase', { phrases: ['world-class'], replacements: { 'world-class': 'high quality' } })],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ category: 'tone', severity: 'warning', guidelineRef: 'TONE-01', ruleRef: 'TEST-BANNED_PHRASE', suggestion: 'high quality' });
    expect(findings[0].spanStart).toBe(9);
  });

  it('flags missing required terminology', () => {
    const { findings } = run({
      content: 'A post without the company name.',
      channel: 'LinkedIn',
      rules: [makeRule('required_term', { term: 'Northwind Labs', minCount: 1 }, { channel: 'LinkedIn' })],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].explanation).toContain('Northwind Labs');
    expect(findings[0].severity).toBe('warning');
  });

  it('does not flag required terminology that is present', () => {
    const { findings } = run({
      content: 'Northwind Labs is hiring.',
      channel: 'LinkedIn',
      rules: [makeRule('required_term', { term: 'Northwind Labs', minCount: 1 })],
    });
    expect(findings).toHaveLength(0);
  });

  it('flags absolute claims as blockers', () => {
    const { findings } = run({
      content: 'We are the market leader.',
      rules: [makeRule('claim', { phrases: ['market leader'] }, { severity: 'blocker', guideline_ref: 'CLAIM-01' })],
    });
    expect(findings[0]).toMatchObject({ category: 'claim', severity: 'blocker', guidelineRef: 'CLAIM-01' });
  });

  it('flags length limits per channel', () => {
    const long = 'x'.repeat(40);
    const { findings } = run({
      content: long,
      channel: 'LinkedIn',
      rules: [makeRule('length', { unit: 'characters', max: 20 }, { channel: 'LinkedIn' })],
    });
    expect(findings[0].category).toBe('length');
    expect(findings[0].explanation).toContain('40');
  });

  it('applies channel-scoped rules only to their channel', () => {
    const rule = makeRule('length', { unit: 'characters', max: 5 }, { channel: 'LinkedIn' });
    expect(run({ content: 'this is long', channel: 'website', rules: [rule] }).findings).toHaveLength(0);
    expect(run({ content: 'this is long', channel: 'LinkedIn', rules: [rule] }).findings.length).toBeGreaterThan(0);
  });

  it('flags images with no alt text and markdown images with empty alt', () => {
    const imageRule = makeRule('alt_text', {}, { severity: 'blocker', guideline_ref: 'ACC-01' });
    const imageFindings = run({ type: 'image', rules: [imageRule] }).findings;
    expect(imageFindings[0]).toMatchObject({ category: 'accessibility', severity: 'blocker' });

    const markdown = run({ content: '![ ](photo.jpg)', rules: [imageRule] }).findings;
    expect(markdown[0].explanation).toContain('empty alt text');
  });

  it('passes images with alt text', () => {
    const { findings } = run({
      type: 'image',
      altText: 'Two colleagues testing a dashboard in the Leeds studio',
      rules: [makeRule('alt_text', {}, { severity: 'blocker' })],
    });
    expect(findings).toHaveLength(0);
  });

  it('computes reading grade and flags text above the limit', () => {
    const content =
      'Notwithstanding comprehensive organisational restructuring, the interdisciplinary implementation committee encountered considerable administrative complexity during preliminary evaluation phases, and subsequently initiated supplementary documentation activities.';
    expect(readingGrade(content)).toBeGreaterThan(10);
    const { findings } = run({
      content,
      rules: [makeRule('reading_level', { maxGrade: 10 }, { guideline_ref: 'TONE-02' })],
    });
    expect(findings[0].category).toBe('readability');
  });

  it('skips reading level for very short text', () => {
    const { findings } = run({ content: 'Short note.', rules: [makeRule('reading_level', { maxGrade: 1 })] });
    expect(findings).toHaveLength(0);
  });

  it('flags skipped heading levels', () => {
    const { findings } = run({
      content: '# Title\n\n### Skipped level\n\nBody',
      rules: [makeRule('heading_order', {}, { guideline_ref: 'ACC-02' })],
    });
    expect(findings[0].category).toBe('accessibility');
    expect(findings[0].explanation).toContain('H1 to H3');
  });

  it('allows consecutive heading levels', () => {
    const { findings } = run({ content: '# Title\n\n## Section\n\nBody', rules: [makeRule('heading_order', {})] });
    expect(findings).toHaveLength(0);
  });

  it('flags non-descriptive link text', () => {
    const { findings } = run({
      content: 'Our report is ready. [click here](https://example.com/report)',
      rules: [makeRule('link_text', { banned: ['click here'] }, { guideline_ref: 'ACC-02' })],
    });
    expect(findings[0]).toMatchObject({ category: 'accessibility', ruleRef: 'TEST-LINK_TEXT' });
  });

  it('adds a contrast suggestion for images', () => {
    const { findings } = run({
      type: 'image',
      altText: 'A poster',
      rules: [makeRule('contrast', { note: 'Check contrast.' }, { guideline_ref: 'ACC-01' })],
    });
    expect(findings[0].severity).toBe('suggestion');
    expect(findings[0].category).toBe('accessibility');
  });

  it('flags banned terminology with the preferred term', () => {
    const { findings } = run({
      content: 'Try our chatbot today.',
      terminology: [{ code: 'TERM-02', preferred_term: 'AI assistant', banned_terms: JSON.stringify(['chatbot']), guideline_ref: 'TERM-01', notes: '' }],
    });
    expect(findings[0]).toMatchObject({ category: 'terminology', ruleRef: 'TERM-02', suggestion: 'AI assistant' });
  });

  it('ignores inactive rules', () => {
    const { findings } = run({
      content: 'world-class',
      rules: [makeRule('banned_phrase', { phrases: ['world-class'] }, { active: 0 })],
    });
    expect(findings).toHaveLength(0);
  });

  it('masks confidential patterns before external use and restores locally', () => {
    const { masked, map, applied } = maskContent('Call me on Project Aurora or alex@northwindlabs.example', [
      { name: 'projects', pattern: 'Project\\s+(Aurora|Meridian)', active: 1 },
      { name: 'emails', pattern: '[a-z0-9._%+-]+@northwindlabs\\.example', active: 1 },
    ]);
    expect(applied).toBe(2);
    expect(masked).not.toContain('Aurora');
    expect(masked).not.toContain('alex@northwindlabs.example');
    expect(restoreContent(masked, map)).toContain('Project Aurora');
    expect(restoreContent(masked, map)).toContain('alex@northwindlabs.example');
  });
});
