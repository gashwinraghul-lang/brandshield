const { findAll } = require('../ruleEngine');

const VAGUE_INTENSIFIERS = ['very', 'really', 'incredibly', 'extremely', 'amazing', 'unbelievably'];
const UNSUPPORTED_NUMBER = /\b(\d{1,3}(?:[.,]\d{3})*|\d+)\s+(employees|staff|customers|users|clients)\b/gi;

function clipQuote(text, start, end) {
  return text.slice(start, Math.min(end, start + 180));
}

function finding({ category, severity, start = 0, end = 0, quote = '', guidelineRef = null, ruleRef = null, factRef = null, explanation, suggestion = null, evidence = null, source = 'llm' }) {
  return {
    category,
    severity,
    spanStart: Math.max(0, start),
    spanEnd: Math.max(0, end),
    quote,
    guidelineRef,
    ruleRef,
    factRef,
    explanation,
    suggestion,
    evidence,
    source,
  };
}

function keywordsFor(fact) {
  try {
    const parsed = JSON.parse(fact.keywords || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findFactMatch(text, fact) {
  for (const keyword of keywordsFor(fact)) {
    const matches = findAll(text, keyword);
    if (matches.length) return { ...matches[0], keyword };
  }
  return null;
}

/**
 * MOCK provider - returns realistic, deterministic findings when no API key is
 * configured. This is what makes the full demo work offline.
 */
function createMockProvider() {
  return {
    name: 'mock',
    version: 'mock-1.0.0',
    external: false,
    async review({ text = '', type = 'text', facts = [] }) {
      const findings = [];

      // Tone: repeated exclamation marks.
      const excl = /!{2,}/g;
      let match = excl.exec(text);
      while (match) {
        const start = Math.max(0, match.index - 40);
        const end = Math.min(text.length, match.index + match[0].length + 20);
        findings.push(
          finding({
            category: 'tone',
            severity: 'warning',
            guidelineRef: 'TONE-01',
            start: match.index,
            end: match.index + match[0].length,
            quote: clipQuote(text, match.index, match.index + match[0].length),
            explanation: 'Repeated exclamation marks sound shouted and weaken a calm, expert tone.',
            suggestion: 'Use a single full stop and let the sentence carry the energy.',
          })
        );
        void start;
        void end;
        match = excl.exec(text);
      }

      // Tone: ALL CAPS words (ignore short acronyms).
      const caps = /\b[A-Z]{4,}\b/g;
      match = caps.exec(text);
      while (match) {
        const word = match[0];
        if (!['ISO', 'GDPR', 'AI', 'B2B', 'SaaS'].includes(word) && !/^[A-Z]{2,5}$/.test(word)) {
          findings.push(
            finding({
              category: 'tone',
              severity: 'suggestion',
              guidelineRef: 'TONE-01',
              start: match.index,
              end: match.index + word.length,
              quote: word,
              explanation: 'All-caps emphasis reads as shouting and is harder to scan.',
              suggestion: word.charAt(0) + word.slice(1).toLowerCase(),
            })
          );
        }
        match = caps.exec(text);
      }

      // Vague intensifiers.
      for (const word of VAGUE_INTENSIFIERS) {
        for (const position of findAll(text, word)) {
          findings.push(
            finding({
              category: 'tone',
              severity: 'suggestion',
              guidelineRef: 'TONE-02',
              start: position.start,
              end: position.end,
              quote: clipQuote(text, position.start, position.end),
              explanation: `"${word}" adds emphasis without evidence. Plain-language guidance asks for specific detail instead.`,
              suggestion: 'Remove the intensifier or replace it with a concrete detail.',
            })
          );
        }
      }

      // Expired approved facts.
      for (const fact of facts) {
        if (!fact.expiry_date || new Date(fact.expiry_date).getTime() >= Date.now()) continue;
        const found = findFactMatch(text, fact);
        if (!found) continue;
        const nearest = fact.successor_statement
          ? {
              stableId: fact.successor_stable_id,
              statement: fact.successor_statement,
              source: fact.successor_source,
              owner: fact.successor_owner,
              expiryDate: fact.successor_expiry,
              expired: false,
            }
          : null;
        findings.push(
          finding({
            category: 'claim',
            severity: 'blocker',
            start: found.start,
            end: found.end,
            quote: clipQuote(text, found.start, found.end),
            guidelineRef: 'CLAIM-02',
            factRef: fact.stable_id,
            explanation: `This claim matches approved fact ${fact.stable_id}, which expired on ${fact.expiry_date}. ${nearest ? `The current approved fact is ${nearest.stableId}: "${nearest.statement}"` : 'No replacement fact is approved yet.'}`,
            suggestion: nearest ? nearest.statement : 'Remove the claim until a current approved fact is available.',
            evidence: {
              flaggedFact: {
                stableId: fact.stable_id,
                statement: fact.statement,
                source: fact.source,
                owner: fact.owner,
                expiryDate: fact.expiry_date,
                expired: true,
              },
              nearestFact: nearest,
            },
          })
        );
      }

      // Numbers without an approved fact.
      const knownNumbers = new Set();
      for (const fact of facts) {
        for (const keyword of keywordsFor(fact)) {
          if (/\d/.test(keyword)) knownNumbers.add(keyword.toLowerCase());
        }
      }
      match = UNSUPPORTED_NUMBER.exec(text);
      while (match) {
        const phrase = match[0];
        const supported = [...knownNumbers].some((keyword) => keyword.includes(phrase.toLowerCase()));
        if (!supported) {
          const currentFact = facts.find((fact) => {
            try {
              return JSON.parse(fact.keywords || '[]').some((k) => k.toLowerCase().includes(phrase.toLowerCase()));
            } catch {
              return false;
            }
          });
          findings.push(
            finding({
              category: 'claim',
              severity: 'warning',
              start: match.index,
              end: match.index + phrase.length,
              quote: phrase,
              guidelineRef: 'CLAIM-01',
              ruleRef: 'LLM-UNSUPPORTED',
              explanation: `"${phrase}" is a specific factual claim with no matching approved fact. ${currentFact ? `The nearest approved fact is ${currentFact.stable_id}.` : 'Add an approved fact before publishing a number.'}`,
              suggestion: 'Cite a current approved fact or remove the specific number.',
            })
          );
        }
        match = UNSUPPORTED_NUMBER.exec(text);
      }

      // Long sentences.
      const sentences = text.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        const words = sentence.trim().split(/\s+/).filter(Boolean);
        if (words.length > 32) {
          const start = text.indexOf(sentence);
          findings.push(
            finding({
              category: 'readability',
              severity: 'suggestion',
              guidelineRef: 'TONE-02',
              start: Math.max(0, start),
              end: Math.max(0, start) + sentence.length,
              quote: clipQuote(text, Math.max(0, start), Math.max(0, start) + sentence.length),
              explanation: `This sentence runs to ${words.length} words. Guidance asks for short sentences that busy readers can scan.`,
              suggestion: 'Split it into two sentences at the main idea.',
            })
          );
        }
      }

      // Visual consistency for images.
      if (type === 'image') {
        findings.push(
          finding({
            category: 'visual',
            severity: 'suggestion',
            guidelineRef: 'ACC-01',
            explanation:
              'Visual review (mock): the image should use an approved logo lock-up, keep clear space, and avoid text over busy areas. Automated checks cannot confirm colour contrast in the artwork.',
            suggestion: 'Compare the artwork with the approved logo and colour assets before publishing.',
            source: 'llm',
          })
        );
      }

      return { status: 'ok', findings, provider: 'mock', version: 'mock-1.0.0', external: false };
    },

    async draftGuideline({ guideline, issueCount = 0, teams = [] }) {
      const audience = teams.length ? teams.join(', ') : 'content teams';
      const draft = [
        `# ${guideline.title} (clearer draft)`,
        '',
        '## What this guideline means',
        `Writers in ${audience} keep hitting ${guideline.stable_id} (${issueCount} recent issue${issueCount === 1 ? '' : 's'}). The rule in one sentence: ${String(guideline.body || '').split('\n')[0]}`,
        '',
        '## How to apply it',
        '1. Check the approved facts before stating a number, certification or date.',
        '2. Use the approved terminology from the brand library, not the first phrase that comes to mind.',
        '3. When in doubt, ask the brand team in the review workspace before publishing.',
        '',
        '## Two examples',
        `- Good: "Northwind Labs has 310 employees across Leeds and Manchester." (approved fact, plain language)`,
        `- Avoid: "We are a world-class, 100% certified team of 240 people!" (banned phrasing, expired fact, exclamation marks)`,
        '',
        '## Escalation',
        'If a rule does not fit the content, reject the issue with a reason so the brand team can improve this guideline.',
      ].join('\n');
      return { status: 'ok', draft, provider: 'mock', version: 'mock-1.0.0', external: false };
    },
  };
}

module.exports = { createMockProvider };
