# Firebase MCP Tools

## Firestore

### Implemented

- [x] `list_collections` — list root collections or subcollections of a document
  - [x] `includeCounts` flag — adds document count to each collection
- [x] `list_documents` — list all document IDs including phantom documents
- [x] `read_collection` — read documents from a collection
  - [x] `includePhantoms` flag — surfaces phantom docs when collection returns empty
- [x] `get_document` — fetch a single document by path
- [x] `get_many_documents` — batch fetch via `paths[]` or `collection` + `ids[]`; `select` support
- [x] `query_collection` — query with filters, ordering, limit, and `startAfter` pagination cursor
- [x] `query_collection_group` — query across all subcollections with the same name
- [x] `count_documents` — server-side count with optional filters
- [x] `aggregate_collection` — server-side `sum()`, `avg()`, `count()` without fetching docs
- [x] `get_collection_schema` — sample-based field type inference; marks optional fields
- [x] `list_indexes` — list composite indexes, filter by collection group
- [x] `distinct_values` — count occurrences of unique field values across a collection or collection group

### Planned

- [ ] `startAt` cursor — inclusive pagination alongside the existing exclusive `startAfter`
- [ ] `get_collection_schema` for collection groups — sample across all matching subcollections via a bare `collectionId`
- [ ] `explain_query` — query plan + execution stats via `query.explain()` to surface index requirements

---

## Auth

### Implemented

- [x] `get_user` — fetch a user by `uid`, `email`, or `phoneNumber`
- [x] `list_users` — paginated user list

### Planned

- [x] `get_user` by phone number — extend identifier support to `phoneNumber`
- [ ] `get_many_users` — batch fetch by `uid[]`, `email[]`, or `phoneNumber[]` (Admin SDK `getUsers()`)

---

## Write Tools

- [ ] `firestore_write` — `set_document`, `update_document`, `create_document`, `delete_document`, `batch_write`
- [ ] `auth_write` — `create_user`, `update_user`, `delete_user`, `set_custom_claims`, `revoke_refresh_tokens`
