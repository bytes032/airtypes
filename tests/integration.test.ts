import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import toml from '@iarna/toml';

const rootDir = resolve(new URL('.', import.meta.url).pathname, '..');
const configPath = resolve(rootDir, 'config.toml');

const run = async (): Promise<void> => {
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

  const tempDir = join(rootDir, 'tests', '.tmp');
  mkdirSync(tempDir, { recursive: true });
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

  const tableMatch = output.match(/export const (\w+Table)\s*=\s*\{/);
  if (!tableMatch) {
    throw new Error('Generated file missing table exports.');
  }

  const tableWithLinksMatch = output.match(/export const (\w+Table)\s*=\s*\{[\s\S]*?\n\s*links:\s*\{/);
  if (!tableWithLinksMatch) {
    throw new Error('Generated file missing links metadata.');
  }
  if (!output.includes('recordSchema')) {
    throw new Error('Generated file missing recordSchema.');
  }
  if (!output.includes('parseRecord')) {
    throw new Error('Generated file missing parseRecord helper.');
  }

  const moduleUrl = pathToFileURL(outputPath).href;
  const generated = (await import(moduleUrl)) as Record<string, unknown>;
  if (typeof generated.parseRecord !== 'function') {
    throw new Error('Generated module missing parseRecord export.');
  }

  const tableName = tableWithLinksMatch[1] ?? tableMatch[1];
  const table = generated[tableName] as
    | {
        schema?: { parse: (value: unknown) => unknown };
        links?: Record<string, { tableId: string }>;
        recordSchema?: { parse: (value: unknown) => unknown };
      }
    | undefined;

  if (!table?.schema || !table.recordSchema) {
    throw new Error('Generated table definition missing schema helpers.');
  }

  const parseRecord = generated.parseRecord as (
    table: unknown,
    record: { id: string; fields: unknown },
  ) => { id: string; fields: unknown };

  const parsedRecord = parseRecord(table, { id: 'rec_test', fields: {} });
  if (parsedRecord.id !== 'rec_test' || typeof parsedRecord.fields !== 'object') {
    throw new Error('parseRecord did not return expected shape.');
  }

  let threw = false;
  try {
    parseRecord(table, { id: 'rec_test', fields: { __invalid_field__: 'oops' } });
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error('parseRecord should reject unknown fields.');
  }

  if (!table.links || Object.keys(table.links).length === 0) {
    throw new Error('links metadata missing from table definition.');
  }
  for (const link of Object.values(table.links)) {
    if (!link?.tableId || typeof link.tableId !== 'string') {
      throw new Error('links metadata missing tableId for linked field.');
    }
  }

  rmSync(tempDir, { recursive: true, force: true });
};

try {
  await run();
  console.log('Integration test passed.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
