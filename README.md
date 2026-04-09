# firebase-mcp

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that exposes Firebase Firestore to AI agents. Built with [Effect](https://effect.website) and the Firebase Admin SDK, it runs over stdio and is designed to be wired directly into any MCP-compatible host (Cursor, Claude Desktop, etc.).

## Features

- **11 Firestore read tools** covering collections, documents, queries, aggregations, and schema inference
- **Glob-based access control** — allow/deny rules evaluated per Firestore path before any read is performed
- **Pagination** on `query_collection` and `read_collection` via cursor-based `startAfter` / `nextPageCursor`
- **Batch fetching** with configurable `maxBatchFetchSize`
- **Schema inference** via `get_collection_schema` — samples documents and infers field types without reading the full collection
- Zero runtime state — each tool call hits Firestore directly through the Admin SDK

## Tools

| Tool                     | Description                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `list_collections`       | List root collections or subcollections of a document. Optionally include document counts.                  |
| `list_documents`         | List all document IDs in a collection, including phantom documents. Optionally include subcollection names. |
| `read_collection`        | Read documents from a collection with optional phantom-doc surfacing.                                       |
| `get_document`           | Fetch a single document by path.                                                                            |
| `get_many_documents`     | Batch-fetch documents by a list of paths or a collection + ID list.                                         |
| `query_collection`       | Query with filters, ordering, limit, and pagination.                                                        |
| `query_collection_group` | Query across all collections sharing the same name, regardless of parent path.                              |
| `count_documents`        | Server-side document count with optional filters.                                                           |
| `aggregate_collection`   | Native `sum()` and `avg()` aggregations without fetching documents.                                         |
| `get_collection_schema`  | Sample a collection from both ends and infer field types.                                                   |
| `list_indexes`           | List Firestore indexes for the project.                                                                     |

## Requirements

- Node.js 18+
- pnpm
- A Firebase project with Firestore enabled
- A service account JSON key with Firestore read permissions

## Setup

**1. Install dependencies**

```bash
pnpm install
```

**2. Add your service account key**

Place your Firebase service account JSON at `secrets/serviceAccount.json` (or any path you prefer — you'll point to it in the config).

**3. Create `firebase-mcp.json`**

```json
{
  "firebase": {
    "projectId": "your-project-id",
    "serviceAccountPath": "secrets/serviceAccount.json"
  },
  "firestore": {
    "rules": {
      "allow": ["**"],
      "deny": []
    },
    "maxCollectionReadSize": 10,
    "maxBatchFetchSize": 200
  }
}
```

**4. Build**

```bash
pnpm build
```

**5. Run**

```bash
pnpm start
# or, during development:
pnpm dev
```

## Configuration

| Field                             | Type       | Default | Description                                                |
| --------------------------------- | ---------- | ------- | ---------------------------------------------------------- |
| `firebase.projectId`              | `string`   | —       | Firebase project ID                                        |
| `firebase.serviceAccountPath`     | `string`   | —       | Path to service account JSON (relative to CWD or absolute) |
| `firestore.rules.allow`           | `string[]` | —       | Glob patterns for allowed Firestore paths                  |
| `firestore.rules.deny`            | `string[]` | —       | Glob patterns for denied Firestore paths (evaluated first) |
| `firestore.maxCollectionReadSize` | `number`   | `10`    | Default document limit for collection reads                |
| `firestore.maxBatchFetchSize`     | `number`   | `200`   | Maximum documents per batch fetch                          |

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
      "command": "node",
      "args": [
        "/path/to/firebase-mcp/dist/cli/index.js",
        "--config",
        "/path/to/firebase-mcp.json"
      ]
    }
  }
}
```

## License

MIT
