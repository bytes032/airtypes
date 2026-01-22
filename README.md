# airtypes

Generate Zod schemas (and inferred TypeScript types) from Airtable base schemas.
Supports multiple bases, optional table/view scoping, and linked-record metadata.

## Quick Start

1) Install dependencies:

```sh
pnpm install
```

2) Create `config.toml`:

```toml
api_key = "pat1234"
output = "airtable-types.ts"

[[bases]]
name = "my-base"
base_id = "app1234"
```

3) Run the generator:

```sh
pnpm run generate
```

By default it writes to `airtable-types.ts` at the repo root. Use `output` to change that.

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
```

## CLI

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

Common flags:
- `-c, --config-file <path>` config TOML (default `config.toml`)
- `-o, --out <path>` override output path
- `--no-links` skip linked-record metadata
- `--no-record-schema` skip recordSchema helpers
- `-n, --dry-run` render output without writing
- `--json` machine output
- `-q, --quiet` minimal output

## Output

The generated file exports:
- `*Schema` Zod objects per table
- `type` aliases via `z.infer`
- `*Table` definitions with mappings + schema (and optional `recordSchema`)
- `links` metadata for linked record fields (table IDs)

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

## Notes

- Output types use optional fields because Airtable omits empty values in API responses.
- Date/datetime fields are emitted as strings (ISO 8601).
- Linked records are emitted as `string[]` plus `links` metadata (IDs only).
