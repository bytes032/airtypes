import { dirname, resolve } from 'node:path';
import toml from '@iarna/toml';
import { cosmiconfig } from 'cosmiconfig';
import { z } from 'zod';
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

export type RawConfig = z.infer<typeof ConfigSchema>;

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

const explorer = cosmiconfig('airtypes', {
  searchPlaces: [
    'package.json',
    '.airtypesrc',
    '.airtypesrc.json',
    '.airtypesrc.yaml',
    '.airtypesrc.yml',
    '.airtypesrc.js',
    '.airtypesrc.cjs',
    'airtypes.config.js',
    'airtypes.config.cjs',
    'airtypes.config.mjs',
    'airtypes.config.json',
    'airtypes.config.yaml',
    'airtypes.config.yml',
    'airtypes.config.toml',
    'config.toml',
  ],
  loaders: {
    '.toml': (_filepath, content) => {
      const parsed = toml.parse(content);
      return stripSymbolKeys(parsed) as Record<string, unknown>;
    },
  },
});

export type ConfigSource = {
  config: RawConfig;
  filepath?: string;
  configDir: string;
};

export const loadConfigSource = async (options: { config?: string; configFile?: string }): Promise<ConfigSource> => {
  const explicitPath =
    options.config ?? options.configFile ?? process.env.AIRTYPES_CONFIG ?? process.env.AIRTYPE_CONFIG;

  const result = explicitPath ? await explorer.load(explicitPath) : await explorer.search(process.cwd());

  if (!result || result.isEmpty) {
    throw new Error('Config not found. Provide --config or add an airtypes config file.');
  }

  const config = ConfigSchema.parse(stripSymbolKeys(result.config));
  const configDir = result.filepath ? dirname(result.filepath) : process.cwd();

  return {
    config,
    filepath: result.filepath ?? undefined,
    configDir,
  };
};

export const loadConfigFromOptions = async (
  repoRoot: string,
  options: { config?: string; configFile?: string; out?: string },
): Promise<ParsedConfig> => {
  const source = await loadConfigSource(options);
  const config = source.config;
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
    throw new Error('Missing bases configuration. Set bases in the config.');
  }

  const outputBase = options.out ? repoRoot : source.configDir;
  const output = options.out
    ? resolve(repoRoot, options.out)
    : resolve(outputBase, config.output ?? 'airtable-types.ts');

  return {
    apiKey,
    output,
    bases,
  };
};
