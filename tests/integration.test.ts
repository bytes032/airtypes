import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import toml from '@iarna/toml';

const rootDir = resolve(new URL('.', import.meta.url).pathname, '..');
const configPath = resolve(rootDir, 'config.toml');

const run = (): void => {
  const rawConfig = readFileSync(configPath, 'utf8').trim();
  if (!rawConfig) {
    throw new Error('config.toml is empty');
  }
  const parsed = toml.parse(rawConfig) as Record<string, unknown>;
  const apiKey =
    typeof parsed.api_key === 'string'
      ? parsed.api_key
      : typeof parsed.api_key_env === 'string'
        ? process.env[parsed.api_key_env]
        : process.env.AIRTABLE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing Airtable API key.');
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'airtypes-'));
  const outputPath = join(tempDir, 'airtable-types.ts');

  const result = spawnSync(
    'node',
    [
      '--import',
      'tsx',
      resolve(rootDir, 'src', 'index.ts'),
      'generate',
      '--config-file',
      configPath,
      '--out',
      outputPath,
      '--json',
      '--quiet',
    ],
    {
      cwd: rootDir,
      env: process.env,
      encoding: 'utf8',
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'airtypes CLI failed');
  }

  const payload = JSON.parse(result.stdout.trim()) as {
    outputPath: string;
    tableCount: number;
    bases: Array<{ name: string; tableCount: number }>;
  };

  if (!payload.outputPath || payload.outputPath !== outputPath) {
    throw new Error('Output path mismatch.');
  }
  if (!payload.tableCount || payload.tableCount <= 0) {
    throw new Error('Expected tableCount to be > 0.');
  }
  if (!payload.bases?.length) {
    throw new Error('Expected non-empty bases list.');
  }

  const output = readFileSync(outputPath, 'utf8');
  if (!output.includes('export const') || !output.includes('Schema')) {
    throw new Error('Generated file missing schemas.');
  }
  const linkBlocks = [...output.matchAll(/links:\s*\{([\s\S]*?)\n\s*\}/g)];
  if (linkBlocks.length === 0) {
    throw new Error('Generated file missing links metadata.');
  }
  const linkTableIds = linkBlocks.flatMap((block) =>
    [...block[1].matchAll(/tableId:\s*'([^']+)'/g)].map((match) => match[1]),
  );
  if (linkTableIds.length === 0) {
    throw new Error('Generated file missing linked table IDs.');
  }
  if (!output.includes('recordSchema')) {
    throw new Error('Generated file missing recordSchema.');
  }

  rmSync(tempDir, { recursive: true, force: true });
};

try {
  run();
  console.log('Integration test passed.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
