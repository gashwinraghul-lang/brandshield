const config = require('../../config');
const { createMockProvider } = require('./mock');
const { createOpenAiProvider } = require('./openai');
const { createGeminiProvider } = require('./gemini');
const { createPollinationsProvider } = require('./pollinations');

const PROVIDER_CATALOG = [
  {
    id: 'mock',
    label: 'MOCK (local, nothing leaves the server)',
    external: false,
    requiresKey: false,
    get configured() {
      return true;
    },
  },
  {
    id: 'gemini',
    label: 'Google Gemini (free tier)',
    external: true,
    requiresKey: true,
    get configured() {
      return Boolean(config.llm.gemini.apiKey);
    },
  },
  {
    id: 'groq',
    label: 'Groq (free tier)',
    external: true,
    requiresKey: true,
    get configured() {
      return Boolean(config.llm.groq.apiKey);
    },
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (free models)',
    external: true,
    requiresKey: true,
    get configured() {
      return Boolean(config.llm.openrouter.apiKey);
    },
  },
  {
    id: 'pollinations',
    label: 'Pollinations (no key, lower reliability)',
    external: true,
    requiresKey: false,
    get configured() {
      return true;
    },
  },
  {
    id: 'openai-compatible',
    label: 'Custom OpenAI-compatible endpoint',
    external: true,
    requiresKey: true,
    get configured() {
      return Boolean(config.llm.apiKey);
    },
  },
];

function catalog() {
  return PROVIDER_CATALOG.map((provider) => ({
    id: provider.id,
    label: provider.label,
    external: provider.external,
    requiresKey: provider.requiresKey,
    configured: provider.configured,
  }));
}

function buildProvider(id) {
  const timeoutMs = config.llm.timeoutMs;
  switch (id) {
    case 'gemini':
      return createGeminiProvider({ ...config.llm.gemini, timeoutMs });
    case 'groq':
      return createOpenAiProvider({
        name: 'groq',
        apiKey: config.llm.groq.apiKey,
        model: config.llm.groq.model,
        baseUrl: config.llm.groq.baseUrl,
        timeoutMs,
      });
    case 'openrouter':
      return createOpenAiProvider({
        name: 'openrouter',
        apiKey: config.llm.openrouter.apiKey,
        model: config.llm.openrouter.model,
        baseUrl: config.llm.openrouter.baseUrl,
        timeoutMs,
        extraHeaders: {
          'HTTP-Referer': config.publicUrl,
          'X-Title': 'BrandShield.ai',
        },
      });
    case 'pollinations':
      return createPollinationsProvider({ ...config.llm.pollinations, timeoutMs: Math.max(timeoutMs, 12000) });
    case 'openai-compatible':
      return createOpenAiProvider(config.llm);
    case 'mock':
    default:
      return createMockProvider();
  }
}

function isConfigured(id) {
  const entry = PROVIDER_CATALOG.find((provider) => provider.id === id);
  return Boolean(entry?.configured);
}

function mock(reason) {
  return { provider: createMockProvider(), external: false, reason };
}

/**
 * Resolves the LLM provider. The provider can be swapped without touching the
 * review pipeline: implement the same { name, version, external, review() } shape.
 * Pollinations is never chosen automatically because it is external and keyless.
 */
function resolveProvider(settings = {}) {
  const externalEnabled = String(settings.external_llm_enabled ?? 'false') === 'true';
  const configured = String(settings.llm_provider || config.llm.provider || 'auto').toLowerCase();

  if (!externalEnabled) {
    return mock('External AI is switched off in Settings.');
  }
  if (configured === 'mock') {
    return mock('MOCK provider selected in Settings.');
  }
  if (configured === 'pollinations') {
    return { provider: buildProvider('pollinations'), external: true, reason: null };
  }
  if (configured !== 'auto') {
    if (!isConfigured(configured)) {
      return mock(`The ${configured} provider is selected but no API key is configured. The MOCK provider is used instead.`);
    }
    return { provider: buildProvider(configured), external: true, reason: null };
  }

  for (const id of ['gemini', 'groq', 'openrouter', 'openai-compatible']) {
    if (isConfigured(id)) return { provider: buildProvider(id), external: true, reason: null };
  }
  return mock('No external AI key is configured, so the MOCK provider is used.');
}

module.exports = { resolveProvider, catalog, buildProvider, isConfigured, PROVIDER_CATALOG };
