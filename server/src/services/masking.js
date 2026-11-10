/**
 * Confidential pattern masking. Defined by admins in Settings.
 * Patterns are applied before content leaves the platform; the original values
 * are restored locally only for display.
 */

function compilePattern(pattern) {
  try {
    return new RegExp(pattern, 'gi');
  } catch {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'gi');
  }
}

function maskContent(text, patterns = []) {
  let masked = String(text || '');
  const map = new Map();
  let tokenIndex = 0;
  for (const pattern of patterns) {
    if (!pattern || Number(pattern.active) === 0) continue;
    const regex = compilePattern(pattern.pattern);
    masked = masked.replace(regex, (match) => {
      tokenIndex += 1;
      const token = `[[BS-MASK-${tokenIndex}]]`;
      map.set(token, match);
      return token;
    });
  }
  return { masked, map, applied: map.size, names: patterns.filter((p) => Number(p.active) === 1).map((p) => p.name) };
}

function restoreContent(text, map) {
  if (!text || !map || map.size === 0) return text;
  let restored = String(text);
  for (const [token, original] of map.entries()) {
    restored = restored.split(token).join(original);
  }
  return restored;
}

function restoreFinding(finding, map) {
  return {
    ...finding,
    quote: restoreContent(finding.quote, map),
    explanation: restoreContent(finding.explanation, map),
    suggestion: restoreContent(finding.suggestion, map),
  };
}

module.exports = { maskContent, restoreContent, restoreFinding, compilePattern };
