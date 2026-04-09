# firebase-mcp

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that exposes Firebase Firestore and Authentication to AI agents. Built with [Effect](https://effect.website) and the Firebase Admin SDK, it runs over stdio and is designed to be wired directly into any MCP-compatible host (Cursor, Claude Desktop, etc.).

## Features

- **11 Firestore read tools** covering collections, documents, queries, aggregations, and schema inference
- **2 Firebase Auth tools** — look up users by UID or email, list users with pagination
- **Glob-based access control** — allow/deny rules evaluated per Firestore path before any read is performed
- **Pagination** on `query_collection`, `read_collection`, and `list_users` via cursor-based tokens
- **Batch fetching** with configurable `maxBatchFetchSize`
- **Schema inference** via `get_collection_schema` — samples documents and infers field types without reading the full collection
- **Normalized output** — Firestore Timestamps, GeoPoints, and DocumentReferences are converted to JSON-serializable values on all tools
- Zero runtime state — each tool call hits Firebase directly through the Admin SDK

## Tools

### Firestore

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

### Auth

| Tool         | Description                                                              |
| ------------ | ------------------------------------------------------------------------ |
| `get_user`   | Fetch a Firebase Auth user by UID or email.                              |
| `list_users` | List Firebase Auth users with optional pagination via `nextPageToken`.   |

## Requirements

- Node.js 18+
- A Firebase project with Firestore enabled
- A service account JSON key with Firestore and Auth read permissions

## Setup

**1. Create `firebase-mcp.json`**

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

**2. Add your service account key**

Place your Firebase service account JSON at any path you prefer — you'll reference it in `firebase-mcp.json` above.

**3. Wire it into your MCP host**

See the [Connecting to Cursor](#connecting-to-cursor) section below — no installation step required when using `npx`.

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
      "command": "npx",
      "args": [
        "-y",
        "firebase-mcp",
        "--config",
        "/path/to/firebase-mcp.json"
      ]
    }
  }
}
```

`npx -y` will download and cache the package automatically on first run. No manual installation needed.

## License

MIT
