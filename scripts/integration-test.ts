import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import toml from '@iarna/toml';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(rootDir, 'config.toml');

if (!existsSync(configPath)) {
  console.error(`Missing config.toml at ${configPath}. Create it before running this test.`);
  process.exit(2);
}

const rawConfig = readFileSync(configPath, 'utf8').trim();
if (!rawConfig) {
  console.error(`config.toml is empty: ${configPath}`);
  process.exit(2);
}

const parsed = toml.parse(rawConfig) as Record<string, unknown>;
const apiKey =
  typeof parsed.api_key === 'string'
    ? parsed.api_key
    : typeof parsed.api_key_env === 'string'
      ? process.env[parsed.api_key_env]
      : process.env.AIRTABLE_API_KEY;

if (!apiKey) {
  console.error('Missing Airtable API key. Set api_key, api_key_env, or AIRTABLE_API_KEY.');
  process.exit(2);
}

const nodeCheck = spawnSync('node', ['--version'], { encoding: 'utf8' });
if (nodeCheck.error) {
  console.error('Node.js is required to run the CLI. Ensure `node` is on PATH.');
  process.exit(2);
}

const cliPath = resolve(rootDir, 'src', 'index.ts');
const result = spawnSync(
  'node',
  ['--import', 'tsx', cliPath, 'generate', '--config-file', configPath, '--dry-run', '--json', '--quiet'],
  {
    cwd: rootDir,
    env: process.env,
    encoding: 'utf8',
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  console.error(output || 'airtypes CLI failed');
  process.exit(result.status ?? 1);
}

const stdout = result.stdout.trim();
if (!stdout) {
  console.error('airtypes CLI returned no output.');
  process.exit(1);
}

let payload: unknown;
try {
  payload = JSON.parse(stdout);
} catch (error) {
  console.error(`Failed to parse JSON output: ${error instanceof Error ? error.message : String(error)}`);
  console.error(stdout);
  process.exit(1);
}

const data = payload as {
  outputPath?: unknown;
  tableCount?: unknown;
  bases?: unknown;
};

if (typeof data.outputPath !== 'string') {
  console.error('Expected outputPath to be a string.');
  process.exit(1);
}

if (typeof data.tableCount !== 'number' || data.tableCount <= 0) {
  console.error('Expected tableCount to be a positive number.');
  process.exit(1);
}

if (!Array.isArray(data.bases) || data.bases.length === 0) {
  console.error('Expected bases to be a non-empty array.');
  process.exit(1);
}

console.log(`Integration test passed (${data.tableCount} tables).`);
