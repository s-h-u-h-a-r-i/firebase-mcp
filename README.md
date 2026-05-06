# firebase-mcp

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that exposes Firebase Firestore and Authentication to AI agents. Built with the Firebase Admin SDK, it runs over stdio and is designed to be wired directly into any MCP-compatible host (Cursor, Claude Desktop, etc.).

## Features

- **13 Firestore read operations** — list/browse collections and documents, query (including collection groups), aggregates, counts, schema sampling, composite indexes, distinct value counts, and **`list_paths`** for configured path templates
- **2 Firebase Auth operations** — look up users by UID or email, list users with pagination
- **Multi-project support** — configure multiple Firebase projects in one config file; each tool call targets a specific project via `projectId`
- **Glob-based access control** — allow/deny rules evaluated per Firestore path before any read is performed
- **Pagination** on `query_collection`, `read_collection`, and `list_users` via cursor-based tokens
- **Batch fetching** with configurable `maxBatchFetchSize`
- **Schema inference** via `get_collection_schema` — samples documents and infers field types without reading the full collection
- **Distinct value counts** via `distinct_values` — count occurrences of unique field values across a collection or collection group
- **Normalized output** — Firestore Timestamps, GeoPoints, and DocumentReferences are converted to JSON-serializable values on all tools
- Zero runtime state — each tool call hits Firebase directly through the Admin SDK

## Tools

### Config

| Tool            | Description                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `create_config` | Returns a full config template (every supported field) and setup instructions. Use this when no `firebase-mcp.json` exists yet. |
| `get_config`    | Returns the current in-memory config, listing all available projects. Call this first to discover valid `projectId` values. |
| `reload_config` | Re-reads `firebase-mcp.json` from disk and evicts all cached project runtimes.                                              |

### Firestore (`firestore_read`)

All operations are dispatched through the single `firestore_read` tool via the `operation` field. Every call requires a `projectId` matching a key in `firebase-mcp.json`.

| Operation                | Description                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `list_paths`             | Lists named [`firestore.paths`](#configuration) templates: placeholders, resolved type (collection vs document), optional description. |
| `list_collections`       | List root collections or subcollections of a document. Optionally include document counts.                                   |
| `list_documents`         | List all document IDs in a collection, including phantom documents. Optionally include subcollection names.                  |
| `read_collection`        | Read documents from a collection with optional phantom-doc surfacing.                                                        |
| `get_document`           | Fetch a single document by path.                                                                                             |
| `get_many_documents`     | Batch-fetch documents by a list of paths or a collection + ID list.                                                          |
| `query_collection`       | Query with filters, ordering, limit, and pagination.                                                                         |
| `query_collection_group` | Query across all collections sharing the same name, regardless of parent path.                                               |
| `count_documents`        | Server-side document count with optional filters.                                                                            |
| `aggregate_collection`   | Native `sum()`, `avg()`, and `count()` aggregations without fetching documents.                                              |
| `get_collection_schema`  | Sample a collection from both ends and infer field types.                                                                    |
| `list_indexes`           | List Firestore composite indexes for the project.                                                                            |
| `distinct_values`        | Count occurrences of each unique value (or value combination) of one or more fields across a collection or collection group. |

### Auth (`auth_read`)

All operations are dispatched through the single `auth_read` tool via the `operation` field. Every call requires a `projectId`.

| Operation    | Description                                                        |
| ------------ | ------------------------------------------------------------------ |
| `get_user`   | Fetch a Firebase Auth user by UID or email.                        |
| `list_users` | List Firebase Auth users with optional pagination via `pageToken`. |

## Requirements

- Node.js 18+
- A Firebase project with Firestore enabled
- A service account JSON key with Firestore and Auth read permissions

## Setup

**1. Create `firebase-mcp.json`**

The config supports multiple projects under a `projects` key. Each key becomes the `projectId` value you pass to tool calls.

```json
{
  "projects": {
    "my-app": {
      "firebase": {
        "projectId": "your-firebase-project-id",
        "serviceAccountPath": "secrets/serviceAccount.json"
      },
      "firestore": {
        "rules": {
          "allow": ["**"],
          "deny": []
        },
        "maxCollectionReadSize": 100,
        "maxBatchFetchSize": 200,
        "paths": {
          "example_orders": {
            "template": "customers/{customerId}/orders",
            "description": "Optional hint for agents; omit or replace with your own entries"
          }
        }
      },
      "timeouts": {
        "callMs": 15000
      }
    }
  }
}
```

To configure multiple projects, add additional keys under `projects`:

```json
{
  "projects": {
    "prod": { "firebase": { ... }, "firestore": { ... } },
    "staging": { "firebase": { ... }, "firestore": { ... } }
  }
}
```

**2. Add your service account key**

Place your Firebase service account JSON at any path you prefer — you'll reference it in `firebase-mcp.json` above. Paths are resolved relative to the working directory when the server starts, or you can use an absolute path.

**3. Wire it into your MCP host**

See the [Connecting to Cursor](#connecting-to-cursor) section below — no installation step required when using `npx`.

## Configuration

| Field                                            | Type       | Default | Description                                                |
| ------------------------------------------------ | ---------- | ------- | ---------------------------------------------------------- |
| `projects`                                       | `object`   | —       | Map of project keys to project configs                     |
| `projects.<key>.firebase.projectId`              | `string`   | —       | Firebase project ID                                        |
| `projects.<key>.firebase.serviceAccountPath`     | `string`   | —       | Path to service account JSON (relative to CWD or absolute) |
| `projects.<key>.firestore.rules.allow`           | `string[]` | —       | Glob patterns for allowed Firestore paths                  |
| `projects.<key>.firestore.rules.deny`            | `string[]` | —       | Glob patterns for denied Firestore paths (evaluated first) |
| `projects.<key>.firestore.maxCollectionReadSize` | `number`   | `100`   | Default document limit for collection reads                |
| `projects.<key>.firestore.maxBatchFetchSize`     | `number`   | `200`   | Maximum documents per batch fetch                          |
| `projects.<key>.firestore.paths`                | `object`   | `{}`    | Named path templates (`{ name: { template, description? } }`); `{param}` placeholders. Surfaces via `list_paths`. |
| `projects.<key>.timeouts.callMs`                 | `number`   | `15000` | Max duration of a single tool call in ms (integer, min `100`, max `120000`) |

A custom config path can be passed at startup:

```bash
node dist/cli/index.js --config /path/to/firebase-mcp.json
```

## Access Control

Firestore path access is governed by glob patterns evaluated with [micromatch](https://github.com/micromatch/micromatch). Deny rules take precedence over allow rules. Every tool call checks the target path before hitting Firestore.

```json
{
  "rules": {
    "allow": ["users/**", "products/**"],
    "deny": ["users/*/private/**"]
  }
}
```

## Connecting to Cursor

Add to your MCP config (e.g. `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "firebase": {
      "command": "npx",
      "args": ["-y", "firebase-mcp", "--config", "/path/to/firebase-mcp.json"]
    }
  }
}
```

`npx -y` will download and cache the package automatically on first run. No manual installation needed.

`firestore_read` and `auth_read` are safe to add to Cursor's tool allowlist for unattended use. `get_config`, `reload_config`, and `create_config` are also read-only and safe to allowlist.

## License

MIT
