const { buildPrompt, mapFinding } = require('./openai');

const DEFAULT_TIMEOUT = 8000;

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

async function callGemini({ apiKey, model, timeoutMs, system, prompt, json }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: json ? 0.2 : 0.3,
            ...(json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      const error = new Error(`Gemini returned ${response.status}`);
      error.code = 'LLM_HTTP_ERROR';
      throw error;
    }
    const payload = await response.json();
    return (payload?.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('').trim();
  } catch (error) {
    if (error.name === 'AbortError' || error.code === 'ABORT_ERR') {
      const timeout = new Error('Gemini review timed out');
      timeout.code = 'LLM_TIMEOUT';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function createGeminiProvider(options = {}) {
  const { apiKey, model = 'gemini-2.0-flash', timeoutMs = DEFAULT_TIMEOUT } = options;
  return {
    name: 'gemini',
    version: model,
    external: true,
    async review({ text, channel, guidelines, facts }) {
      const content = await callGemini({
        apiKey,
        model,
        timeoutMs,
        system: 'You are a precise brand-governance reviewer. Return valid JSON only.',
        prompt: buildPrompt({ text, channel, guidelines, facts }),
        json: true,
      });
      const parsed = parseJsonText(content);
      const findings = Array.isArray(parsed.findings)
        ? parsed.findings.slice(0, 8).map((item) => mapFinding(item, text))
        : [];
      return { status: 'ok', findings, provider: 'gemini', version: model, external: true };
    },

    async draftGuideline({ guideline, issueCount = 0, teams = [] }) {
      const draft = await callGemini({
        apiKey,
        model,
        timeoutMs,
        system:
          'You improve brand guidelines. Write clear, testable rules for busy creators. Include exactly two examples (one good, one avoid). Return plain markdown only.',
        prompt: `Guideline ${guideline.stable_id} "${guideline.title}" is triggering repeated issues (${issueCount} recent) across teams: ${teams.join(', ') || 'several'}. Current text:\n\n${guideline.body}\n\nDraft a clearer version that keeps the original intent, with a one-sentence rule, 3 practical checks, and two examples. Do not ask for personal data.`,
        json: false,
      });
      return { status: 'ok', draft, provider: 'gemini', version: model, external: true };
    },
  };
}

module.exports = { createGeminiProvider, parseJsonText };
