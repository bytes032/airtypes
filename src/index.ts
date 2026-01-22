#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { z } from 'zod';

type AirtableField = {
  id: string;
  name: string;
  type: string;
  options?: Record<string, unknown> | null;
};

type AirtableFieldOptions = {
  linkedTableId?: string;
};

type AirtableView = {
  id: string;
  name: string;
  type: string;
  visibleFieldIds?: string[];
};

type AirtableTable = {
  id: string;
  name: string;
  fields: AirtableField[];
  views: AirtableView[];
};

type BaseSchema = { tables: AirtableTable[] };

type GeneratorConfig = {
  baseName: string;
  baseId: string;
  tableIds?: string[];
  viewIds?: string[];
};

type ParsedConfig = {
  apiKey: string;
  output: string;
  bases: GeneratorConfig[];
};

const BaseConfigSchema = z.object({
  name: z.string().trim().min(1),
  base_id: z.string().trim().min(1),
  table_ids: z.array(z.string().trim().min(1)).optional(),
  view_ids: z.array(z.string().trim().min(1)).optional(),
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

type CliOptions = {
  configFile: string;
  out?: string;
  json: boolean;
  plain: boolean;
  quiet: boolean;
  verbose: boolean;
  noLinks: boolean;
  noRecordSchema: boolean;
  dryRun: boolean;
};

const loadConfig = async (repoRoot: string, options: CliOptions): Promise<ParsedConfig> => {
  const configPath = resolve(repoRoot, options.configFile);
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = readFileSync(configPath, 'utf8').trim();
  if (!raw) {
    throw new Error(`Config file is empty: ${configPath}`);
  }

  const parsed = await parseToml(raw);
  const config = ConfigSchema.parse(parsed);
  const apiKey =
    config.api_key ??
    (config.api_key_env ? process.env[config.api_key_env] : undefined) ??
    process.env.AIRTABLE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing api key. Set api_key, api_key_env, or AIRTABLE_API_KEY in the environment.');
  }

  const bases =
    config.bases && config.bases.length > 0
      ? config.bases.map((base) => ({
          baseName: base.name,
          baseId: base.base_id,
          tableIds: base.table_ids && base.table_ids.length > 0 ? base.table_ids : undefined,
          viewIds: base.view_ids && base.view_ids.length > 0 ? base.view_ids : undefined,
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

const toWords = (input: string): string[] => {
  const withSpaces = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim();

  if (!withSpaces) {
    return [];
  }

  return withSpaces.split(/\s+/).filter(Boolean);
};

const capitalize = (word: string): string => {
  if (!word) {
    return '';
  }
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
};

const toCamelCase = (input: string): string => {
  const words = toWords(input);
  if (words.length === 0) {
    return '';
  }
  return words[0].toLowerCase() + words.slice(1).map(capitalize).join('');
};

const toPascalCase = (input: string): string => {
  return toWords(input).map(capitalize).join('');
};

let invalidIdentifierCount = 0;
const usedIdentifiers = new Set<string>();

const resetIdentifierState = (): void => {
  usedIdentifiers.clear();
  invalidIdentifierCount = 0;
};

const isValidJsIdentifier = (value: string): boolean => {
  if (!/^[$A-Z_a-z][\w$]*$/.test(value)) {
    return false;
  }
  try {
    // eslint-disable-next-line no-new, no-new-func
    new Function(`const ${value} = 1;`);
    return true;
  } catch {
    return false;
  }
};

const DEFAULT_IDENTIFIER = 'invalidIdentifier';

const escapeIdentifier = (name: string): string => {
  const trimmed = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (isValidJsIdentifier(trimmed)) {
    return trimmed;
  }

  const sanitized = trimmed
    .replace(/[^\p{L}\p{N}_\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^\d+$/.test(sanitized)) {
    invalidIdentifierCount += 1;
    console.warn(
      `Invalid identifier "${name}" became purely numeric after sanitization ("${sanitized}"). Using default identifier "${DEFAULT_IDENTIFIER}${invalidIdentifierCount}".`,
    );
    return `${DEFAULT_IDENTIFIER}${invalidIdentifierCount}`;
  }

  let pascal = toPascalCase(sanitized);
  if (/^\d/.test(pascal)) {
    pascal = `_${pascal}`;
  }

  if (!isValidJsIdentifier(pascal)) {
    const validStartIndex = pascal.search(/[$A-Za-z]/);
    if (validStartIndex === -1) {
      invalidIdentifierCount += 1;
      console.warn(
        `Invalid identifier "${name}" contains no valid starting character after sanitization. Using default identifier "${DEFAULT_IDENTIFIER}${invalidIdentifierCount}".`,
      );
      return `${DEFAULT_IDENTIFIER}${invalidIdentifierCount}`;
    }

    pascal = pascal
      .slice(validStartIndex)
      .replace(/[^A-Za-z0-9_$]/g, '_')
      .replace(/_+/g, '_');

    pascal = toPascalCase(pascal);

    if (!isValidJsIdentifier(pascal) || pascal.length === 0) {
      invalidIdentifierCount += 1;
      console.warn(
        `Invalid identifier "${name}" could not be salvaged. Using default identifier "${DEFAULT_IDENTIFIER}${invalidIdentifierCount}".`,
      );
      return `${DEFAULT_IDENTIFIER}${invalidIdentifierCount}`;
    }
  }

  let finalIdentifier = pascal;
  let counter = 2;
  while (usedIdentifiers.has(finalIdentifier)) {
    finalIdentifier = `${pascal}${counter}`;
    counter += 1;
  }

  usedIdentifiers.add(finalIdentifier);
  return finalIdentifier;
};

const escapeString = (value: string): string => value.replace(/'/g, "\\'").replace(/\n/g, '\\n');

type ZodSpec = {
  kind: 'string' | 'number' | 'boolean' | 'record' | 'array' | 'object';
  optional: boolean;
  inner?: ZodSpec;
};

const withOptional = (spec: ZodSpec): ZodSpec => ({ ...spec, optional: true });

const asInnerSpec = (spec: ZodSpec): ZodSpec => ({
  ...spec,
  optional: false,
  inner: spec.inner ? asInnerSpec(spec.inner) : undefined,
});

const zodSpecForAirtableType = (field: AirtableField): ZodSpec | null => {
  switch (field.type) {
    case 'url':
    case 'email':
    case 'phoneNumber':
    case 'singleLineText':
    case 'multilineText':
    case 'richText':
    case 'singleSelect':
    case 'externalSyncSource':
    case 'aiText':
      return { kind: 'string', optional: true };
    case 'singleCollaborator':
    case 'lastModifiedBy':
    case 'barcode':
    case 'button':
      return { kind: 'object', optional: true };
    case 'createdBy':
      return { kind: 'object', optional: true };
    case 'multipleAttachments':
    case 'multipleCollaborators':
      return {
        kind: 'array',
        optional: true,
        inner: { kind: 'object', optional: false },
      };
    case 'multipleRecordLinks':
    case 'multipleSelects':
      return {
        kind: 'array',
        optional: true,
        inner: { kind: 'string', optional: false },
      };
    case 'number':
    case 'rating':
    case 'duration':
    case 'currency':
    case 'percent':
      return { kind: 'number', optional: true };
    case 'count':
    case 'autoNumber':
      return { kind: 'number', optional: true };
    case 'date':
    case 'dateTime':
    case 'lastModifiedTime':
      return { kind: 'string', optional: true };
    case 'createdTime':
      return { kind: 'string', optional: true };
    case 'checkbox':
      return { kind: 'boolean', optional: true };
    case 'lookup':
    case 'multipleLookupValues':
    case 'rollup':
    case 'formula': {
      if (
        field.options &&
        typeof field.options === 'object' &&
        'result' in field.options &&
        typeof (field.options as { result: unknown }).result === 'object' &&
        (field.options as { result: unknown }).result !== null
      ) {
        const innerSpec = zodSpecForAirtableType((field.options as { result: AirtableField }).result);
        if (!innerSpec) {
          return null;
        }
        return withOptional(innerSpec);
      }
      throw new Error(`Invalid ${field.type} field (no options.result): ${field.id}`);
    }
    default:
      console.warn(`Could not convert Airtable type "${field.type}" to a Zod schema for field ${field.id}`);
      return null;
  }
};

const renderZodSpec = (spec: ZodSpec): string => {
  let expr: string;
  switch (spec.kind) {
    case 'string':
      expr = 'z.string()';
      break;
    case 'number':
      expr = 'z.number()';
      break;
    case 'boolean':
      expr = 'z.boolean()';
      break;
    case 'record':
      expr = 'z.record(z.string(), z.unknown())';
      break;
    case 'object':
      expr = 'z.object({ id: z.string() }).passthrough()';
      break;
    case 'array': {
      const inner = spec.inner ? renderZodSpec(asInnerSpec(spec.inner)) : 'z.unknown()';
      expr = `z.array(${inner})`;
      break;
    }
    default:
      expr = 'z.unknown()';
  }
  if (spec.optional) {
    expr = `${expr}.optional()`;
  }
  return expr;
};

const getBaseSchema = async (baseId: string, apiKey: string): Promise<AirtableTable[]> => {
  const response = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to fetch base schema: ${response.status} ${errorBody}`);
  }

  const data = (await response.json()) as BaseSchema;
  if (!Array.isArray(data.tables)) {
    throw new Error('Unexpected Airtable response: missing tables.');
  }

  return data.tables;
};

const resolveTableIds = (tables: AirtableTable[], idsOrNames?: string[]): string[] | undefined => {
  if (!idsOrNames || idsOrNames.length === 0) {
    return undefined;
  }

  const resolved: string[] = [];
  for (const token of idsOrNames) {
    const match = tables.find((table) => table.id === token || table.name === token);
    if (!match) {
      throw new Error(`Table "${token}" not found in base schema.`);
    }
    resolved.push(match.id);
  }

  return Array.from(new Set(resolved));
};

const filterTablesById = (tables: AirtableTable[], tableIds?: string[]): AirtableTable[] => {
  if (!tableIds || tableIds.length === 0) {
    return tables;
  }

  const tableIdSet = new Set(tableIds);
  return tables.filter((table) => tableIdSet.has(table.id));
};

const filterBaseSchemaByView = (tables: AirtableTable[], viewIds?: string[]): AirtableTable[] => {
  if (!viewIds || viewIds.length === 0) {
    return tables;
  }

  const findViewInBaseSchema = (viewId: string) => {
    for (const table of tables) {
      const view = table.views.find((candidate) => candidate.id === viewId);
      if (view) {
        return { table, view };
      }
    }
    return null;
  };

  const matchedTableIds = new Set<string>();
  const viewToTableMap = new Map<string, { table: AirtableTable; view: AirtableView }>();

  for (const viewId of viewIds) {
    const result = findViewInBaseSchema(viewId);
    if (!result) {
      throw new Error(`View "${viewId}" not found in any table. Please check the view ID is correct.`);
    }
    viewToTableMap.set(viewId, result);
    matchedTableIds.add(result.table.id);
  }

  const filteredTables: AirtableTable[] = [];
  for (const table of tables) {
    if (!matchedTableIds.has(table.id)) {
      continue;
    }

    const matchingViews = viewIds
      .map((viewId) => viewToTableMap.get(viewId))
      .filter((result): result is { table: AirtableTable; view: AirtableView } => Boolean(result))
      .filter((result) => result.table.id === table.id)
      .map((result) => result.view);

    const gridViewsWithVisibleFields = matchingViews.filter(
      (view) => view.type === 'grid' && view.visibleFieldIds && view.visibleFieldIds.length > 0,
    );

    let filteredTable = table;
    if (gridViewsWithVisibleFields.length > 0) {
      const allVisibleFieldIds = new Set<string>();
      for (const view of gridViewsWithVisibleFields) {
        for (const fieldId of view.visibleFieldIds ?? []) {
          allVisibleFieldIds.add(fieldId);
        }
      }

      filteredTable = {
        ...table,
        fields: table.fields.filter((field) => allVisibleFieldIds.has(field.id)),
      };
    }

    filteredTables.push(filteredTable);
  }

  return filteredTables;
};

type LinkedFieldMeta = {
  jsName: string;
  linkedTableId: string;
};

const getLinkedFieldMeta = (field: AirtableField, jsName: string): LinkedFieldMeta | null => {
  if (field.type !== 'multipleRecordLinks') {
    return null;
  }

  const options = field.options as AirtableFieldOptions | null | undefined;
  const linkedTableId = options?.linkedTableId?.trim();
  if (!linkedTableId) {
    return null;
  }

  return { jsName, linkedTableId };
};

type GeneratedField = AirtableField & {
  jsName: string;
  zodSpec: ZodSpec | null;
  originalName: string;
};

type GenerateOptions = {
  includeLinks: boolean;
  includeRecordSchema: boolean;
};

const generateMappingEntry = (field: GeneratedField): string => {
  if (field.zodSpec === null) {
    return `\n    // Unsupported field "${field.name}": ${escapeString(field.id)}`;
  }
  const comment = field.originalName !== field.jsName ? ` // Original field: "${field.originalName}"` : '';
  return `\n    ${field.jsName}: '${escapeString(field.id)}',${comment}`;
};

const generateZodEntry = (field: GeneratedField): string => {
  if (field.zodSpec === null) {
    return `\n  // Unsupported field "${field.name}" of type ${field.type}`;
  }
  const comment = field.originalName !== field.jsName ? ` // Original field: "${field.originalName}"` : '';
  return `\n  ${field.jsName}: ${renderZodSpec(field.zodSpec)},${comment}`;
};

const generateCode = (config: GeneratorConfig, table: AirtableTable, options: GenerateOptions): string => {
  resetIdentifierState();
  const basePrefixPascal = escapeIdentifier(toPascalCase(config.baseName));
  const basePrefixCamel = escapeIdentifier(toCamelCase(config.baseName));
  const itemNameRaw = escapeIdentifier(toPascalCase(table.name));
  const itemName = /\.s$/.test(itemNameRaw) ? itemNameRaw.slice(0, itemNameRaw.length - 1) : itemNameRaw;
  const tableName = escapeIdentifier(`${basePrefixCamel}${toPascalCase(table.name)}Table`);
  const finalItemName = escapeIdentifier(`${basePrefixPascal}${itemName}`);
  const schemaName = `${finalItemName}Schema`;
  const recordSchemaName = `${finalItemName}RecordSchema`;
  const linkedFieldMap = new Map<string, LinkedFieldMeta>();

  const fields: GeneratedField[] = table.fields.map((field) => {
    const jsName = escapeIdentifier(toCamelCase(field.name) || field.name);
    const linkMeta = getLinkedFieldMeta(field, jsName);
    if (linkMeta) {
      linkedFieldMap.set(jsName, linkMeta);
    }
    return {
      ...field,
      originalName: field.name,
      jsName,
      zodSpec: zodSpecForAirtableType(field),
    };
  });

  const links = [...linkedFieldMap.values()]
    .map((link) => {
      return `\n    ${link.jsName}: { tableId: '${escapeString(link.linkedTableId)}' },`;
    })
    .join('');

  const linksBlock = options.includeLinks && links ? `\n  links: {${links}\n  },` : '';
  const recordSchemaBlock = options.includeRecordSchema
    ? `\n\nexport const ${recordSchemaName} = z\n  .object({\n    id: z.string(),\n    fields: ${schemaName},\n  })\n  .strict();\n\nexport type ${finalItemName}Record = z.infer<typeof ${recordSchemaName}>;`
    : '';
  const recordSchemaField = options.includeRecordSchema ? `\n  recordSchema: ${recordSchemaName},` : '';

  return `export const ${schemaName} = z.object({${fields.map(generateZodEntry).join('')}\n}).strict();\n\nexport type ${finalItemName} = z.infer<typeof ${schemaName}>;${recordSchemaBlock}\n\nexport const ${tableName} = {\n  name: '${escapeString(
    table.name,
  )}',\n  baseId: '${escapeString(config.baseId)}',\n  tableId: '${escapeString(
    table.id,
  )}',\n  mappings: {${fields.map(generateMappingEntry).join('')}\n  },\n  schema: ${schemaName},${recordSchemaField}${linksBlock}\n} satisfies AirtableTableDefinition<${finalItemName}>;`;
};

const generateHeader = (options: GenerateOptions): string => {
  return [
    '/* DO NOT EDIT: this file was automatically generated by airtypes */',
    '/* eslint-disable */',
    "import { z } from 'zod';",
    '',
    ...(options.includeRecordSchema
      ? ['export type AirtableRecord<T extends Record<string, unknown>> = {', '  id: string;', '  fields: T;', '};', '']
      : []),
    'export type AirtableTableDefinition<T extends Record<string, unknown>> = {',
    '  name: string;',
    '  baseId: string;',
    '  tableId: string;',
    '  mappings: {',
    '    [K in keyof T]: T[K] extends Array<unknown> ? string | string[] : string;',
    '  };',
    '  schema: z.ZodType<T>;',
    ...(options.includeRecordSchema ? ['  recordSchema: z.ZodType<AirtableRecord<T>>;'] : []),
    ...(options.includeLinks ? ['  links?: Record<string, { tableId: string }>;'] : []),
    '};',
    '',
  ].join('\n');
};

type GenerateResult = {
  outputPath: string;
  bases: Array<{ name: string; tableCount: number }>;
  tableCount: number;
};

const generateTypes = async (options: CliOptions): Promise<GenerateResult> => {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = dirname(scriptDir);
  const config = await loadConfig(repoRoot, options);

  const outputPath = resolve(repoRoot, config.output);
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  if (!options.quiet) {
    console.log(`Generating Zod definitions for ${config.bases.length} Airtable bases...`);
  }

  const generatedBlocks: string[] = [];
  const summary: Array<{ name: string; tableCount: number }> = [];
  let totalTables = 0;
  const generateOptions: GenerateOptions = {
    includeLinks: !options.noLinks,
    includeRecordSchema: !options.noRecordSchema,
  };

  for (const baseConfig of config.bases) {
    if (!options.quiet) {
      console.log(`Fetching schema for ${baseConfig.baseName} (${baseConfig.baseId})...`);
    }
    const tables = await getBaseSchema(baseConfig.baseId, config.apiKey);
    const resolvedTableIds = resolveTableIds(tables, baseConfig.tableIds);
    const scopedTables = filterTablesById(tables, resolvedTableIds);
    const filteredTables = filterBaseSchemaByView(scopedTables, baseConfig.viewIds);

    generatedBlocks.push(`// Base: ${baseConfig.baseName}`);
    for (const table of filteredTables) {
      generatedBlocks.push(generateCode(baseConfig, table, generateOptions));
      generatedBlocks.push('');
    }

    summary.push({ name: baseConfig.baseName, tableCount: filteredTables.length });
    totalTables += filteredTables.length;
  }

  const contents = `${`${generateHeader(generateOptions)}${generatedBlocks.join('\n')}`.trimEnd()}\n`;
  if (!options.dryRun) {
    writeFileSync(outputPath, contents, 'utf8');
  }

  if (!options.quiet) {
    const suffix = options.dryRun ? ' (dry-run)' : '';
    console.log(`Generated Airtable types: ${outputPath}${suffix}`);
  }

  return {
    outputPath,
    bases: summary,
    tableCount: totalTables,
  };
};

const validateConfig = async (options: CliOptions): Promise<void> => {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = dirname(scriptDir);
  await loadConfig(repoRoot, options);
};

const printConfig = async (options: CliOptions): Promise<void> => {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = dirname(scriptDir);
  const configPath = resolve(repoRoot, options.configFile);
  const raw = readFileSync(configPath, 'utf8').trim();
  const parsed = await parseToml(raw);
  const config = ConfigSchema.parse(parsed);
  const sanitized = {
    ...config,
    api_key: config.api_key ? '[redacted]' : undefined,
  };
  if (options.json) {
    console.log(JSON.stringify(sanitized, null, options.plain ? 0 : 2));
    return;
  }
  const output = options.plain ? JSON.stringify(sanitized) : JSON.stringify(sanitized, null, 2);
  console.log(output);
};

const main = async () => {
  const program = new Command();
  program
    .name('airtable-typegen')
    .description('Generate Zod schemas and TypeScript types from Airtable bases.')
    .option('-c, --config-file <path>', 'Path to config TOML', 'config.toml')
    .option('-o, --out <path>', 'Override output path')
    .option('--json', 'Emit machine-readable output', false)
    .option('--plain', 'Plain text output (no color)', false)
    .option('-q, --quiet', 'Suppress non-error output', false)
    .option('-v, --verbose', 'Verbose output', false)
    .option('--no-links', 'Do not emit links metadata', false)
    .option('--no-record-schema', 'Do not emit recordSchema helpers', false)
    .option('-n, --dry-run', 'Do not write output file', false)
    .version('0.1.0');

  program
    .command('generate')
    .description('Generate types from the config file')
    .action(async () => {
      const opts = program.opts();
      const result = await generateTypes(opts as CliOptions);
      if (opts.json) {
        console.log(JSON.stringify(result));
      }
    });

  program
    .command('validate')
    .description('Validate config file and exit')
    .action(async () => {
      const opts = program.opts();
      await validateConfig(opts as CliOptions);
      if (!opts.quiet) {
        console.log('Config is valid.');
      }
    });

  program
    .command('print-config')
    .description('Print effective config (secrets redacted)')
    .action(async () => {
      const opts = program.opts();
      await printConfig(opts as CliOptions);
    });

  program.action(async () => {
    const opts = program.opts();
    const result = await generateTypes(opts as CliOptions);
    if (opts.json) {
      console.log(JSON.stringify(result));
    }
  });

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
