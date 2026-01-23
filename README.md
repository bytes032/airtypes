# airtypes

Schema — Airtable + CLI
Fast Zod schemas and TypeScript types from Airtable bases. Built for terminals and CI.

## Install

```sh
pnpm install
```

## Quick Start

1) Create `config.toml`:

```toml
api_key = "pat1234"
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
node --import tsx src/index.ts --config-file ./tools/airtable.toml

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
# required_fields = { "My Table" = ["Primary Field"] }
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

## Flags

Common flags:
- `-c, --config-file <path>` config TOML (default `config.toml`)
- `-o, --out <path>` override output path
- `--no-links` skip linked-record metadata
- `--no-record-schema` skip recordSchema helpers
- `-n, --dry-run` render output without writing
- `--json` machine output
- `-q, --quiet` minimal output

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
