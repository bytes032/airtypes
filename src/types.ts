export type AirtableField = {
  id: string;
  name: string;
  type: string;
  options?: Record<string, unknown> | null;
};

export type AirtableFieldOptions = {
  linkedTableId?: string;
};

export type AirtableView = {
  id: string;
  name: string;
  type: string;
  visibleFieldIds?: string[];
};

export type AirtableTable = {
  id: string;
  name: string;
  fields: AirtableField[];
  views: AirtableView[];
};

export type BaseSchema = { tables: AirtableTable[] };

export type GeneratorConfig = {
  baseName: string;
  baseId: string;
  tableIds?: string[];
  viewIds?: string[];
  requiredFields?: Record<string, string[]>;
};

export type ParsedConfig = {
  apiKey: string;
  output: string;
  bases: GeneratorConfig[];
};

export type CliOptions = {
  config?: string;
  configFile?: string;
  out?: string;
  color?: boolean;
  json: boolean;
  plain: boolean;
  quiet: boolean;
  verbose: boolean;
  noLinks: boolean;
  noRecordSchema: boolean;
  dryRun: boolean;
};
