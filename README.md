# airtypes

Generate Zod schemas and TypeScript types from Airtable bases. Built for terminals, CI, and codegen workflows.

## Features

- Zod schemas and TypeScript types per table
- `*Table` definitions with Airtable field mappings
- Optional `recordSchema` + `parseRecord` helper
- `requiredFields` support for stricter list queries
- Config discovery + CLI flags

## Requirements

- Node.js >= 24

## Install

```sh
pnpm add -D airtypes
```

## Usage

```sh
# Generate with config discovery
npx airtypes generate

# Explicit config path
npx airtypes generate --config ./config.toml

# Override output path
npx airtypes generate --out ./types/airtable-types.ts

# Validate config only
npx airtypes validate

# Print effective config (secrets redacted)
npx airtypes print-config --json
```

## Configuration

### Discovery

airtypes uses cosmiconfig. It searches (in order) from the current working directory for:

- `package.json` (under `airtypes` key)
- `.airtypesrc`, `.airtypesrc.json`, `.airtypesrc.yaml`, `.airtypesrc.yml`, `.airtypesrc.js`, `.airtypesrc.cjs`
- `airtypes.config.js`, `airtypes.config.cjs`, `airtypes.config.mjs`, `airtypes.config.json`, `airtypes.config.yaml`, `airtypes.config.yml`, `airtypes.config.toml`
- `config.toml`

You can also force a config path:

```sh
npx airtypes generate --config ./config.toml
```

### Example `config.toml`

```toml
api_key_env = "AIRTABLE_API_KEY"
output = "airtable-types.ts"

[[bases]]
name = "my-base"
base_id = "app1234"
# table_ids = ["tbl123", "tbl456"]
# view_ids = ["viw123", "viw456"]
# required_fields = { "My Table" = ["Primary Field", "Status"] }
```

### API key

Provide an API key via one of:

- `api_key` in config
- `api_key_env` in config (recommended)
- `AIRTABLE_API_KEY` env var

## Output

The generated file exports:

- `*Schema` Zod objects per table
- `type` aliases via `z.infer`
- `*Table` definitions (mappings + schema)
- optional `recordSchema` and `parseRecord`
- `links` metadata for linked record fields

Example table snippet:

```ts
export const myTableTable = {
  name: 'My Table',
  baseId: 'app...',
  tableId: 'tbl...',
  mappings: { relatedItems: 'fld...' },
  requiredFields: ['name', 'status'],
  schema: MyTableSchema,
  recordSchema: MyTableRecordSchema,
  links: {
    relatedItems: { tableId: 'tblLinked' },
  },
} satisfies AirtableTableDefinition<MyTable>;
```

Use `parseRecord` to validate Airtable API records once and get typed fields:

```ts
import { parseRecord, myTableTable } from './airtable-types.js';

const parsed = parseRecord(myTableTable, { id: record.id, fields: record.fields });
const fields = parsed.fields; // fully typed
```

## Using with airtool

`airtool` consumes the generated table definitions directly:

```ts
import { createAirtableClient, pickFields } from 'airtool';
import { myTableTable } from './airtable-types.js';

const client = createAirtableClient({
  apiKey: process.env.AIRTABLE_API_KEY!,
  baseId: myTableTable.baseId!,
});

const table = client.table(myTableTable);
const records = await table.fetchAllRecords({
  fields: pickFields(myTableTable, 'primaryField', 'status'),
});
```

If you set `required_fields` in the config, airtypes adds a `requiredFields` list per table, and airtool automatically
includes those fields in typed list queries.

## Flags

- `-c, --config <path>` config file path
- `--config-file <path>` alias for `--config`
- `-o, --out <path>` override output path
- `--no-links` skip linked-record metadata
- `--no-record-schema` skip recordSchema helpers
- `-n, --dry-run` render output without writing
- `--json` machine output
- `--plain` compact JSON
- `-q, --quiet` suppress non-error output
- `-v, --verbose` verbose output
- `--no-color` disable color

## Exit codes

- `0` success
- `1` runtime or API error
- `2` CLI usage error

## License

MIT
