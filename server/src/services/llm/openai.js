const { findAll } = require('../ruleEngine');

function buildPrompt({ text, channel, guidelines, facts }) {
  const guidelineList = guidelines
    .map((g) => `- ${g.stable_id} ${g.title}: ${String(g.body || '').slice(0, 500)}`)
    .join('\n');
  const factList = facts
    .map((f) => `- ${f.stable_id} "${f.statement}" (source: ${f.source}; owner: ${f.owner}; expires: ${f.expiry_date || 'no expiry'})`)
    .join('\n');
  return `You are BrandShield.ai, a brand-governance reviewer. Review the content against the brand guidelines and approved facts below. Return JSON only.

Channel: ${channel}

GUIDELINES
${guidelineList}

APPROVED FACTS
${factList}

CONTENT
"""
${text}
"""

Return {"findings": [{"category": "tone|claim|visual|accessibility", "severity": "blocker|warning|suggestion", "quote": "exact text copied from CONTENT", "guideline_ref": "one stable guideline id or null", "fact_ref": "one stable fact id or null", "explanation": "plain-language explanation", "suggestion": "a replacement that keeps the author's meaning"}]}
Rules: never invent guideline or fact IDs. A finding without a guideline_ref or fact_ref must be severity "suggestion". Do not rewrite the whole document. Maximum 8 findings.`;
}

function mapFinding(item, text) {
  const quote = typeof item.quote === 'string' ? item.quote : '';
  const matches = quote ? findAll(text, quote) : [];
  const start = matches.length ? matches[0].start : 0;
  const end = matches.length ? matches[0].end : 0;
  const severity = ['blocker', 'warning', 'suggestion'].includes(item.severity) ? item.severity : 'suggestion';
  return {
    category: ['tone', 'claim', 'visual', 'accessibility'].includes(item.category) ? item.category : 'tone',
    severity,
    spanStart: start,
    spanEnd: end,
    quote: quote.slice(0, 180),
    guidelineRef: item.guideline_ref || null,
    ruleRef: null,
    factRef: item.fact_ref || null,
    explanation: String(item.explanation || 'Review this passage against the brand library.'),
    suggestion: item.suggestion ? String(item.suggestion) : null,
    evidence: null,
    source: 'llm',
  };
}

function createOpenAiProvider(options) {
  const { apiKey, model, baseUrl, timeoutMs, name = 'openai-compatible', extraHeaders = {} } = options;
  return {
    name,
    version: `${model}`,
    external: true,
    async review({ text, channel, guidelines, facts }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
            ...extraHeaders,
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: 'You are a precise brand-governance reviewer. Return valid JSON only.' },
              { role: 'user', content: buildPrompt({ text, channel, guidelines, facts }) },
            ],
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const error = new Error(`LLM provider returned ${response.status}`);
          error.code = 'LLM_HTTP_ERROR';
          throw error;
        }
        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content || '{}';
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch {
          const match = content.match(/\{[\s\S]*\}/);
          parsed = match ? JSON.parse(match[0]) : { findings: [] };
        }
        const findings = Array.isArray(parsed.findings) ? parsed.findings.slice(0, 8).map((item) => mapFinding(item, text)) : [];
        return { status: 'ok', findings, provider: name, version: model, external: true };
      } catch (error) {
        if (error.name === 'AbortError' || error.code === 'ABORT_ERR') {
          const timeout = new Error('LLM review timed out');
          timeout.code = 'LLM_TIMEOUT';
          throw timeout;
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },

    async draftGuideline({ guideline, issueCount = 0, teams = [] }) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}`, ...extraHeaders },
          body: JSON.stringify({
            model,
            temperature: 0.3,
            messages: [
              { role: 'system', content: 'You improve brand guidelines. Write clear, testable rules for busy creators. Include exactly two examples (one good, one avoid). Return plain markdown only.' },
              {
                role: 'user',
                content: `Guideline ${guideline.stable_id} "${guideline.title}" is triggering repeated issues (${issueCount} recent) across teams: ${teams.join(', ') || 'several'}. Current text:\n\n${guideline.body}\n\nDraft a clearer version that keeps the original intent, with a one-sentence rule, 3 practical checks, and two examples. Do not ask for personal data.`,
              },
            ],
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const error = new Error(`LLM provider returned ${response.status}`);
          error.code = 'LLM_HTTP_ERROR';
          throw error;
        }
        const payload = await response.json();
        const draft = payload?.choices?.[0]?.message?.content || '';
        return { status: 'ok', draft, provider: name, version: model, external: true };
      } catch (error) {
        if (error.name === 'AbortError') {
          const timeout = new Error('Guideline draft timed out');
          timeout.code = 'LLM_TIMEOUT';
          throw timeout;
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

module.exports = { createOpenAiProvider, buildPrompt, mapFinding };
