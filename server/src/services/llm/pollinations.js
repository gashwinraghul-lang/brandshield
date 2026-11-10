const { buildPrompt, mapFinding } = require('./openai');

const DEFAULT_TIMEOUT = 12000;

function parseJsonText(content) {
  if (!content) return { findings: [] };
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return { findings: [] };
    try {
      return JSON.parse(match[0]);
    } catch {
      return { findings: [] };
    }
  }
}

async function callPollinations({ baseUrl, model, timeoutMs, messages, json }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/openai`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: json ? 0.2 : 0.3,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        messages,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`Pollinations returned ${response.status}`);
      error.code = 'LLM_HTTP_ERROR';
      throw error;
    }
    const payload = await response.json();
    return payload?.choices?.[0]?.message?.content || '';
  } catch (error) {
    if (error.name === 'AbortError' || error.code === 'ABORT_ERR') {
      const timeout = new Error('Pollinations review timed out');
      timeout.code = 'LLM_TIMEOUT';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function createPollinationsProvider(options = {}) {
  const { model = 'openai', baseUrl = 'https://text.pollinations.ai', timeoutMs = DEFAULT_TIMEOUT } = options;
  return {
    name: 'pollinations',
    version: model,
    external: true,
    async review({ text, channel, guidelines, facts }) {
      const content = await callPollinations({
        baseUrl,
        model,
        timeoutMs,
        json: true,
        messages: [
          { role: 'system', content: 'You are a precise brand-governance reviewer. Return valid JSON only.' },
          { role: 'user', content: buildPrompt({ text, channel, guidelines, facts }) },
        ],
      });
      const parsed = parseJsonText(content);
      const findings = Array.isArray(parsed.findings)
        ? parsed.findings.slice(0, 8).map((item) => mapFinding(item, text))
        : [];
      return { status: 'ok', findings, provider: 'pollinations', version: model, external: true };
    },

    async draftGuideline({ guideline, issueCount = 0, teams = [] }) {
      const draft = await callPollinations({
        baseUrl,
        model,
        timeoutMs,
        json: false,
        messages: [
          {
            role: 'system',
            content:
              'You improve brand guidelines. Write clear, testable rules for busy creators. Include exactly two examples (one good, one avoid). Return plain markdown only.',
          },
          {
            role: 'user',
            content: `Guideline ${guideline.stable_id} "${guideline.title}" is triggering repeated issues (${issueCount} recent) across teams: ${teams.join(', ') || 'several'}. Current text:\n\n${guideline.body}\n\nDraft a clearer version that keeps the original intent, with a one-sentence rule, 3 practical checks, and two examples. Do not ask for personal data.`,
          },
        ],
      });
      return { status: 'ok', draft, provider: 'pollinations', version: model, external: true };
    },
  };
}

module.exports = { createPollinationsProvider };
