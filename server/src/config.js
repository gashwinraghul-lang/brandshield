const path = require('node:path');
const fs = require('node:fs');
const dotenv = require('dotenv');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const IS_VERCEL = process.env.VERCEL === '1';

for (const envFile of [path.join(ROOT_DIR, '.env'), path.join(ROOT_DIR, 'server', '.env')]) {
  if (fs.existsSync(envFile)) dotenv.config({ path: envFile });
}

function resolveFromRoot(value, fallback) {
  const raw = value && value.trim() ? value.trim() : fallback;
  return path.isAbsolute(raw) ? raw : path.resolve(ROOT_DIR, raw);
}

function parseDatabaseUrl(raw) {
  const fallbackPath = IS_VERCEL ? '/tmp/brandshield.db' : './data/brandshield.db';
  const value = (raw || `sqlite:${fallbackPath}`).trim();
  if (value === ':memory:' || value === 'sqlite::memory:') return { dialect: 'sqlite', location: ':memory:' };
  if (value.startsWith('sqlite:')) {
    return { dialect: 'sqlite', location: resolveFromRoot(value.slice('sqlite:'.length), fallbackPath) };
  }
  if (value.startsWith('postgres://') || value.startsWith('postgresql://')) {
    return { dialect: 'postgres', location: value };
  }
  return { dialect: 'sqlite', location: resolveFromRoot(value, fallbackPath) };
}

const database = parseDatabaseUrl(process.env.BRANDSHIELD_DB_URL);

const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
const defaultOrigin = vercelUrl || 'http://localhost:5173';

const config = {
  rootDir: ROOT_DIR,
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.BRANDSHIELD_PORT || 4100),
  webOrigin: process.env.BRANDSHIELD_WEB_ORIGIN || defaultOrigin,
  publicUrl: (process.env.BRANDSHIELD_PUBLIC_URL || process.env.BRANDSHIELD_WEB_ORIGIN || defaultOrigin).replace(/\/$/, ''),
  database,
  sessionDays: Number(process.env.BRANDSHIELD_SESSION_DAYS || 7),
  uploadDir: resolveFromRoot(process.env.BRANDSHIELD_UPLOAD_DIR, IS_VERCEL ? '/tmp/uploads' : './data/uploads'),
  maxUploadBytes: Number(process.env.BRANDSHIELD_MAX_UPLOAD_MB || 10) * 1024 * 1024,
  llm: {
    provider: (process.env.BRANDSHIELD_LLM_PROVIDER || 'auto').toLowerCase(),
    apiKey: process.env.BRANDSHIELD_LLM_API_KEY || '',
    model: process.env.BRANDSHIELD_LLM_MODEL || 'gpt-4o-mini',
    baseUrl: (process.env.BRANDSHIELD_LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    timeoutMs: Number(process.env.BRANDSHIELD_LLM_TIMEOUT_MS || 8000),
    gemini: {
      apiKey: process.env.BRANDSHIELD_GEMINI_API_KEY || '',
      model: process.env.BRANDSHIELD_GEMINI_MODEL || 'gemini-2.0-flash',
    },
    groq: {
      apiKey: process.env.BRANDSHIELD_GROQ_API_KEY || '',
      model: process.env.BRANDSHIELD_GROQ_MODEL || 'llama-3.3-70b-versatile',
      baseUrl: 'https://api.groq.com/openai/v1',
    },
    openrouter: {
      apiKey: process.env.BRANDSHIELD_OPENROUTER_API_KEY || '',
      model: process.env.BRANDSHIELD_OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
      baseUrl: 'https://openrouter.ai/api/v1',
    },
    pollinations: {
      model: process.env.BRANDSHIELD_POLLINATIONS_MODEL || 'openai',
      baseUrl: 'https://text.pollinations.ai',
    },
  },
  email: {
    provider: (process.env.BRANDSHIELD_EMAIL_PROVIDER || 'mock').toLowerCase(),
  },
  demoPassword: process.env.BRANDSHIELD_DEMO_PASSWORD || 'BrandShield!23',
  uploadTypes: {
    'text/plain': '.txt',
    'text/markdown': '.md',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'image/png': '.png',
    'image/jpeg': '.jpg',
  },
};

fs.mkdirSync(config.uploadDir, { recursive: true });
if (config.database.dialect === 'sqlite' && config.database.location !== ':memory:') {
  fs.mkdirSync(path.dirname(config.database.location), { recursive: true });
}

module.exports = config;
