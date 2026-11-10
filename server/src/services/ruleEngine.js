/**
 * BrandShield.ai deterministic rule engine.
 * Runs before any LLM call. Rules are data in the database, not hard-coded.
 * Every finding carries a reference (rule, guideline, or approved fact) so it
 * can be shown as an error. Findings without a reference are downgraded to
 * suggestions by the review service.
 */

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findAll(haystack, needle) {
  const results = [];
  const source = haystack.toLowerCase();
  const target = needle.toLowerCase();
  if (!target) return results;
  let index = source.indexOf(target);
  while (index !== -1) {
    results.push({ start: index, end: index + target.length });
    index = source.indexOf(target, index + target.length);
  }
  return results;
}

function countOccurrences(text, needle) {
  return findAll(text, needle).length;
}

function clipQuote(text, start, end) {
  return text.slice(start, Math.min(end, start + 180));
}

function finding({ category, severity, start = 0, end = 0, quote = '', guidelineRef = null, ruleRef = null, factRef = null, explanation, suggestion = null, evidence = null, source = 'rule' }) {
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

function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, ' $1 ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, ' $1 ')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countSyllables(word) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 0;
  if (clean.length <= 3) return 1;
  const groups = clean
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

function readingGrade(text) {
  const plain = stripMarkdown(text);
  const sentences = plain.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean);
  const words = plain.split(/\s+/).filter((word) => /[a-zA-Z]/.test(word));
  if (words.length < 20 || sentences.length === 0) return null;
  const syllables = words.reduce((total, word) => total + countSyllables(word), 0);
  const grade = 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59;
  return Math.max(0, Math.round(grade * 10) / 10);
}

function checkTerminology(content, terminology) {
  const findings = [];
  for (const entry of terminology) {
    let banned = [];
    try {
      banned = JSON.parse(entry.banned_terms || '[]');
    } catch {
      banned = [];
    }
    for (const term of banned) {
      for (const match of findAll(content, term)) {
        findings.push(
          finding({
            category: 'terminology',
            severity: 'warning',
            start: match.start,
            end: match.end,
            quote: clipQuote(content, match.start, match.end),
            guidelineRef: entry.guideline_ref || 'TERM-01',
            ruleRef: entry.code,
            explanation: `"${term}" is not approved terminology. Northwind Labs uses "${entry.preferred_term}" instead.${entry.notes ? ` ${entry.notes}` : ''}`,
            suggestion: entry.preferred_term,
          })
        );
      }
    }
  }
  return findings;
}

function checkBannedPhrase(content, rule) {
  const findings = [];
  const config = rule.config || {};
  const phrases = Array.isArray(config.phrases) ? config.phrases : [];
  const replacements = config.replacements || {};
  for (const phrase of phrases) {
    for (const match of findAll(content, phrase)) {
      findings.push(
        finding({
          category: 'tone',
          severity: rule.severity,
          start: match.start,
          end: match.end,
          quote: clipQuote(content, match.start, match.end),
          guidelineRef: rule.guideline_ref,
          ruleRef: rule.code,
          explanation: `"${phrase}" is on the banned-phrase list for brand tone. ${config.rationale || 'Use plain, specific language instead.'}`,
          suggestion: replacements[phrase] || `Rephrase without "${phrase}"`,
        })
      );
    }
  }
  return findings;
}

function checkRequiredTerm(content, rule) {
  const config = rule.config || {};
  const term = config.term;
  if (!term) return [];
  const minimum = Number(config.minCount || 1);
  if (countOccurrences(content, term) >= minimum) return [];
  return [
    finding({
      category: 'terminology',
      severity: rule.severity,
      guidelineRef: rule.guideline_ref,
      ruleRef: rule.code,
      explanation: `This channel requires "${term}" at least ${minimum} time${minimum === 1 ? '' : 's'}. It is currently missing.`,
      suggestion: `Add "${term}" where it reads naturally.`,
    }),
  ];
}

function checkClaim(content, rule) {
  const findings = [];
  const config = rule.config || {};
  const phrases = Array.isArray(config.phrases) ? config.phrases : [];
  for (const phrase of phrases) {
    for (const match of findAll(content, phrase)) {
      findings.push(
        finding({
          category: 'claim',
          severity: rule.severity,
          start: match.start,
          end: match.end,
          quote: clipQuote(content, match.start, match.end),
          guidelineRef: rule.guideline_ref,
          ruleRef: rule.code,
          explanation: `"${phrase}" is a claim that needs evidence from the approved facts library. ${config.rationale || 'Only claims with a current approved fact may be published.'}`,
          suggestion: config.replacements?.[phrase] || 'Replace with a specific, evidence-backed statement.',
        })
      );
    }
  }
  return findings;
}

function checkLength(content, rule) {
  const config = rule.config || {};
  const unit = config.unit === 'words' ? 'words' : 'characters';
  const plain = unit === 'words' ? stripMarkdown(content).split(/\s+/).filter(Boolean).length : content.length;
  const max = Number(config.max || 0);
  if (!max || plain <= max) return [];
  return [
    finding({
      category: 'length',
      severity: rule.severity,
      guidelineRef: rule.guideline_ref,
      ruleRef: rule.code,
      explanation: `This ${rule.channel || ''} submission is ${plain} ${unit}; the limit is ${max}. Trim ${plain - max} ${unit}.`,
      suggestion: `Remove or shorten content to fit ${max} ${unit}.`,
    }),
  ];
}

function checkAltText(content, altText, type, rule) {
  const findings = [];
  if (type === 'image' && !String(altText || '').trim()) {
    findings.push(
      finding({
        category: 'accessibility',
        severity: rule.severity,
        guidelineRef: rule.guideline_ref,
        ruleRef: rule.code,
        explanation: 'This image has no alternative text. Every image needs a short description of what it shows and why it matters.',
        suggestion: 'Add alt text such as "Two colleagues reviewing a dashboard in the Leeds studio".',
        source: 'accessibility',
      })
    );
  }
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match = imagePattern.exec(content);
  while (match) {
    if (!match[1].trim()) {
      const start = match.index;
      findings.push(
        finding({
          category: 'accessibility',
          severity: rule.severity,
          start,
          end: start + match[0].length,
          quote: clipQuote(content, start, start + match[0].length),
          guidelineRef: rule.guideline_ref,
          ruleRef: rule.code,
          explanation: 'A markdown image has empty alt text, so screen-reader users get no description.',
          suggestion: 'Describe the image inside the square brackets: ![A team workshop in Leeds](image.jpg).',
          source: 'accessibility',
        })
      );
    }
    match = imagePattern.exec(content);
  }
  return findings;
}

function checkReadingLevel(content, rule) {
  const config = rule.config || {};
  const maxGrade = Number(config.maxGrade || 0);
  const grade = readingGrade(content);
  if (!maxGrade || grade === null || grade <= maxGrade) return [];
  return [
    finding({
      category: 'readability',
      severity: rule.severity,
      guidelineRef: rule.guideline_ref,
      ruleRef: rule.code,
      explanation: `This text reads at roughly grade ${grade}; the guideline asks for grade ${maxGrade} or below. Shorten sentences and swap long words for everyday ones.`,
      suggestion: 'Split long sentences and replace specialist words with plain alternatives.',
    }),
  ];
}

function checkHeadingOrder(content, rule) {
  const lines = content.split(/\r?\n/);
  let offset = 0;
  let previousLevel = 0;
  for (const line of lines) {
    const match = /^(#{1,6})\s+\S/.exec(line);
    if (match) {
      const level = match[1].length;
      if (previousLevel !== 0 && level > previousLevel + 1) {
        return [
          finding({
            category: 'accessibility',
            severity: rule.severity,
            start: offset,
            end: offset + line.length,
            quote: line,
            guidelineRef: rule.guideline_ref,
            ruleRef: rule.code,
            explanation: `Heading order skips from H${previousLevel} to H${level}. Screen-reader users rely on a logical outline.`,
            suggestion: `Change this heading to H${previousLevel + 1} or restructure the section.`,
            source: 'accessibility',
          }),
        ];
      }
      previousLevel = level;
    }
    offset += line.length + 1;
  }
  return [];
}

function checkLinkText(content, rule) {
  const config = rule.config || {};
  const banned = Array.isArray(config.banned) ? config.banned : ['click here', 'read more', 'learn more'];
  const findings = [];
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match = linkPattern.exec(content);
  while (match) {
    const text = match[1].trim();
    if (banned.some((item) => item.toLowerCase() === text.toLowerCase())) {
      const start = match.index + 1;
      findings.push(
        finding({
          category: 'accessibility',
          severity: rule.severity,
          start,
          end: start + text.length,
          quote: text,
          guidelineRef: rule.guideline_ref,
          ruleRef: rule.code,
          explanation: `Link text "${text}" does not describe its destination out of context.`,
          suggestion: `Use descriptive link text, for example "Read the ${config.example || 'sustainability report'}" instead.`,
          source: 'accessibility',
        })
      );
    }
    match = linkPattern.exec(content);
  }
  return findings;
}

function checkContrast(_content, type, rule) {
  if (type !== 'image') return [];
  const config = rule.config || {};
  return [
    finding({
      category: 'accessibility',
      severity: 'suggestion',
      guidelineRef: rule.guideline_ref,
      ruleRef: rule.code,
      explanation: `Automated contrast checks on uploaded images are approximate. ${config.note || 'Check text over imagery and logo clear space manually before publishing.'}`,
      suggestion: 'Test the final image against the approved colour palette at 100% zoom.',
      source: 'accessibility',
    }),
  ];
}

function dedupe(findings) {
  const seen = new Set();
  return findings.filter((item) => {
    const key = `${item.category}|${item.ruleRef || item.guidelineRef}|${item.spanStart}|${item.spanEnd}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * @param {object} input
 * @param {string} input.content
 * @param {string} [input.altText]
 * @param {string} [input.type]
 * @param {string} input.channel
 * @param {Array} [input.terminology]
 * @param {Array} [input.rules]
 */
function runRules({ content = '', altText = '', type = 'text', channel = 'website', terminology = [], rules = [] }) {
  const findings = [];
  findings.push(...checkTerminology(content, terminology));

  const rulesRun = [];
  for (const rule of rules) {
    if (Number(rule.active) !== 1) continue;
    if (rule.channel && rule.channel !== 'all' && rule.channel !== channel) continue;
    const config = (() => {
      try {
        return typeof rule.config === 'string' ? JSON.parse(rule.config) : rule.config || {};
      } catch {
        return {};
      }
    })();
    const enriched = { ...rule, config };
    rulesRun.push(rule.code);
    switch (rule.type) {
      case 'banned_phrase':
        findings.push(...checkBannedPhrase(content, enriched));
        break;
      case 'required_term':
        findings.push(...checkRequiredTerm(content, enriched));
        break;
      case 'claim':
        findings.push(...checkClaim(content, enriched));
        break;
      case 'length':
        findings.push(...checkLength(content, enriched));
        break;
      case 'alt_text':
        findings.push(...checkAltText(content, altText, type, enriched));
        break;
      case 'reading_level':
        findings.push(...checkReadingLevel(content, enriched));
        break;
      case 'heading_order':
        findings.push(...checkHeadingOrder(content, enriched));
        break;
      case 'link_text':
        findings.push(...checkLinkText(content, enriched));
        break;
      case 'contrast':
        findings.push(...checkContrast(content, type, enriched));
        break;
      default:
        break;
    }
  }
  return { findings: dedupe(findings), rulesRun };
}

module.exports = {
  runRules,
  readingGrade,
  countSyllables,
  stripMarkdown,
  checkTerminology,
  checkRequiredTerm,
  checkBannedPhrase,
  checkClaim,
  checkLength,
  checkAltText,
  checkReadingLevel,
  checkHeadingOrder,
  checkLinkText,
  checkContrast,
  findAll,
};
