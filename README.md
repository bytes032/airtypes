# airtypes

Fast Zod schemas and TypeScript types from Airtable bases. Built for terminals and CI.

## Install

```sh
pnpm install
```

## Quick Start

1) Copy `config.example.toml` to `config.toml` and edit it:

```toml
api_key_env = "AIRTABLE_API_KEY"
output = "airtable-types.ts"

[[bases]]
name = "my-base"
base_id = "app1234"
```

2) Run:

```sh
pnpm run generate
```

Default output is `airtable-types.ts` in the repo root. Override with `output` or `--out`.

## Usage

```sh
# Default (generate)
pnpm run generate

# Explicit generate
node --import tsx src/index.ts generate

# Validate config only
node --import tsx src/index.ts validate

# Print effective config (secrets redacted)
node --import tsx src/index.ts print-config --json

# Custom config path
node --import tsx src/index.ts --config ./tools/airtable.toml

# Override output path
node --import tsx src/index.ts --out ./types/airtable-types.ts

# Dry run
node --import tsx src/index.ts --dry-run --json
```

## Config

Required:
- `api_key` or `api_key_env`
- at least one `[[bases]]` block

Optional per-base keys:

```toml
[[bases]]
name = "my-base"
base_id = "app1234"
# table_ids = ["tbl123", "tbl456"]
# view_ids = ["viw123", "viw456"]
# required_fields = { "My Table" = ["Primary Field", "Status"] }
```

`required_fields` marks fields as non-optional in the generated schema and adds a `requiredFields` list to the table
definition. Keys can be table names or table IDs; values can be Airtable field names, field IDs, or the generated
camelCase field keys.

Precedence (high → low): flags → environment → config file.

## Output

The generated file exports:
- `*Schema` Zod objects per table
- `type` aliases via `z.infer`
- `*Table` definitions with mappings + schema (and optional `recordSchema`)
- `links` metadata for linked record fields (table IDs)
- `parseRecord` helper to validate `{ id, fields }` in one place

Example snippet:

```ts
export const myTableTable = {
  name: 'My Table',
  baseId: 'app...',
  tableId: 'tbl...',
  mappings: { relatedItems: 'fld...' },
  schema: MyTableSchema,
  recordSchema: MyTableRecordSchema,
  links: {
    relatedItems: { tableId: 'tblLinked' },
  },
} satisfies AirtableTableDefinition<MyTable>;
```

Use `parseRecord` to validate Airtable API records once and get typed fields:

```ts
import { parseRecord, myTableTable } from './airtable-types';

const parsed = parseRecord(myTableTable, { id: record.id, fields: record.fields });
const fields = parsed.fields; // fully typed
```

## Using with airtool

`airtool` can consume the generated table definitions directly for typed CRUD helpers:

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

If you set `required_fields` in `config.toml`, airtypes adds a `requiredFields` list per table, and airtool will always
include those fields in typed list queries.

## Flags

Common flags:
- `-c, --config <path>` config TOML (default `config.toml`)
- `--config-file <path>` alias for `--config`
- `-o, --out <path>` override output path
- `--no-links` skip linked-record metadata
- `--no-record-schema` skip recordSchema helpers
- `-n, --dry-run` render output without writing
- `--json` machine output
- `-q, --quiet` minimal output
- `-v, --verbose` verbose logging
- `--no-color` disable color output

## Exit Codes

- `0` success
- `1` generic failure (IO/network)
- `2` invalid config/usage

## Notes

- Output types use optional fields because Airtable omits empty values in API responses.
- Date/datetime fields are emitted as strings (ISO 8601).
- Linked records are emitted as `string[]` plus `links` metadata (IDs only).

## Troubleshooting

- Missing API key: set `api_key` in `config.toml` or `api_key_env` + environment variable.
- Empty output: confirm base/table IDs and view filters in config.
