import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CliOptions } from './types.js';

export const resolveConfigPath = (repoRoot: string, options: CliOptions): string => {
  const fromOptions = options.config ?? options.configFile;
  const fromEnv = process.env.AIRTYPES_CONFIG ?? process.env.AIRTYPE_CONFIG;
  return resolve(repoRoot, fromOptions ?? fromEnv ?? 'config.toml');
};

export const formatJson = (value: unknown, options: CliOptions): string => {
  return JSON.stringify(value, null, options.plain ? 0 : 2);
};

export const emitJson = (value: unknown, options: CliOptions): void => {
  process.stdout.write(`${formatJson(value, options)}\n`);
};

export const getPackageVersion = (): string => {
  try {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = resolve(scriptDir, '..');
    const raw = readFileSync(resolve(repoRoot, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
};
