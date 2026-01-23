import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { CliOptions } from './types.js';

export const formatJson = (value: unknown, options: CliOptions): string => {
  return JSON.stringify(value, null, options.plain ? 0 : 2);
};

export const emitJson = (value: unknown, options: CliOptions): void => {
  process.stdout.write(`${formatJson(value, options)}\n`);
};

export const getPackageVersion = (): string => {
  try {
    const raw = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    try {
      const raw = readFileSync(resolve(dirname(process.cwd()), 'package.json'), 'utf8');
      const pkg = JSON.parse(raw) as { version?: string };
      return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
    } catch {
      return '0.0.0';
    }
  }
};
