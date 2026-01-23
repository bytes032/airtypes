import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { resolveConfigPath } from './cli-utils.js';
import type { GeneratorConfig, ParsedConfig } from './types.js';

const BaseConfigSchema = z.object({
  name: z.string().trim().min(1),
  base_id: z.string().trim().min(1),
  table_ids: z.array(z.string().trim().min(1)).optional(),
  view_ids: z.array(z.string().trim().min(1)).optional(),
  required_fields: z.record(z.string(), z.array(z.string().trim().min(1))).optional(),
});

const ConfigSchema = z.object({
  api_key: z.string().trim().min(1).optional(),
  api_key_env: z.string().trim().min(1).optional(),
  output: z.string().trim().min(1).optional(),
  bases: z.array(BaseConfigSchema).min(1).optional(),
});

const parseToml = async (raw: string): Promise<unknown> => {
  const toml = await import('@iarna/toml');
  return toml.parse(raw);
};

const stripSymbolKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stripSymbolKeys);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      cleaned[key] = stripSymbolKeys(entry);
    }
    return cleaned;
  }
  return value;
};

export const loadConfig = async (
  repoRoot: string,
  options: { configPath: string; out?: string },
): Promise<ParsedConfig> => {
  const configPath = options.configPath;
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = readFileSync(configPath, 'utf8').trim();
  if (!raw) {
    throw new Error(`Config file is empty: ${configPath}`);
  }

  const parsed = await parseToml(raw);
  const config = ConfigSchema.parse(stripSymbolKeys(parsed));
  const apiKey =
    config.api_key ??
    (config.api_key_env ? process.env[config.api_key_env] : undefined) ??
    process.env.AIRTABLE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing api key. Set api_key, api_key_env, or AIRTABLE_API_KEY in the environment.');
  }

  const bases: GeneratorConfig[] | null =
    config.bases && config.bases.length > 0
      ? config.bases.map((base) => ({
          baseName: base.name,
          baseId: base.base_id,
          tableIds: base.table_ids && base.table_ids.length > 0 ? base.table_ids : undefined,
          viewIds: base.view_ids && base.view_ids.length > 0 ? base.view_ids : undefined,
          requiredFields: base.required_fields ?? undefined,
        }))
      : null;

  if (!bases || bases.length === 0) {
    throw new Error('Missing bases configuration. Set bases in the TOML config.');
  }

  return {
    apiKey,
    output: options.out ? resolve(repoRoot, options.out) : (config.output ?? 'airtable-types.ts'),
    bases,
  };
};

export const loadConfigFromOptions = async (
  repoRoot: string,
  options: { config?: string; configFile?: string; out?: string },
): Promise<ParsedConfig> => {
  const configPath = resolveConfigPath(repoRoot, options);
  return loadConfig(repoRoot, { configPath, out: options.out });
};

export const parseRawConfig = async (raw: string): Promise<unknown> => {
  const parsed = await parseToml(raw);
  return ConfigSchema.parse(stripSymbolKeys(parsed));
};
