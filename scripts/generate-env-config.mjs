import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.env.local');

function readLocalEnv() {
  if (!fs.existsSync(envPath)) return {};

  return Object.fromEntries(
    fs.readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const eq = line.indexOf('=');
        if (eq === -1) return [line, ''];
        return [line.slice(0, eq).trim(), line.slice(eq + 1).trim()];
      })
  );
}

const localEnv = readLocalEnv();
const config = {
  SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || localEnv.SUPABASE_URL || localEnv.VITE_SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || localEnv.SUPABASE_ANON_KEY || localEnv.VITE_SUPABASE_ANON_KEY || ''
};

const output = `window.ENV = ${JSON.stringify(config, null, 2)};\n`;
fs.writeFileSync(path.join(root, 'env-config.js'), output);
