# Firestore MCP Tools

## Implemented

### Core Read Tools
- [x] `list_collections` — list root collections or subcollections of a document
  - [x] `includeCounts` flag — adds document count to each collection
- [x] `list_documents` — list all document IDs including phantom documents
  - [x] `includeCollections` flag — adds subcollection names to each document
- [x] `read_collection` — read documents from a collection
  - [x] `includePhantoms` flag — surfaces phantom docs when collection returns empty
- [x] `get_document` — fetch a single document by path
- [x] `query_collection` — query with filters, ordering, and limit
- [x] `count_documents` — server-side count with optional filters

---

## Planned

### High Priority
- [ ] **Pagination on `query_collection`** — `startAfter` cursor support to page through large collections (e.g. 11k+ stock items)
- [ ] **`get_many_documents`** — batch fetch multiple documents by path list in a single RPC (`getAll()`)
- [ ] **`query_collection_group`** — query across all collections with the same name regardless of parent path (e.g. all `purchase_orders` across all stores)

### Medium Priority
- [ ] **`aggregate_collection`** — native `sum()` and `avg()` aggregations without fetching documents
- [ ] **`get_collection_schema`** — sample documents and infer field names + types (especially useful for numerically-keyed fields)

### Future / Auth & Other Services
- [ ] **`get_user`** — fetch a Firebase Auth user by UID or email
- [ ] **`list_users`** — paginated user list
- [ ] **Write tools** — `set_document`, `update_document`, `create_document`, `delete_document`, `batch_write`
