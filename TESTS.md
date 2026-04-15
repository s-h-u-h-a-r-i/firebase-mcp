# Test Checklist

Track all tests that need to be written. Check off items as they are implemented.

Existing coverage is marked **[done]**. Everything else is **[ ]** (pending).

---

## `src/task/index.test.ts` — Task monad **[done]**

All constructors, combinators, Exit guards, abort/fork behaviour covered.

---

## `src/config/index.test.ts` — Config loading **[done]**

`ProjectConfigSchema`, `ConfigError`, `loadConfig`, `getConfigPath` covered.

---

## `src/tools/firestore/utils/paths.test.ts` — Path utilities **[done]**

`segmentCount`, `collectionPathError`, `documentPathError` covered.

---

## `src/tools/normalize.test.ts` — `normalizeValue` **[done]**

The universal output normaliser. Pure function, no Firebase SDK needed (duck-type
checking only). Every tool response passes through this.

- [x] `null` and `undefined` pass through unchanged
- [x] Primitives (`string`, `number`, `boolean`) pass through unchanged
- [x] `Timestamp` instance → ISO string via `.toDate().toISOString()`
- [x] `GeoPoint` instance → `{ latitude, longitude }`
- [x] `DocumentReference` instance → `.path` string
- [x] Raw `{ _seconds, _nanoseconds }` POJO (exactly 2 keys, both number) → ISO string
- [x] Raw `{ _seconds, _nanoseconds }` with a third key → treated as a plain object (not converted)
- [x] Raw `{ _seconds: 'string', _nanoseconds: 0 }` → treated as a plain object (type guard)
- [x] Flat object → all values recursively normalised
- [x] Nested object → deep normalisation
- [x] Array of primitives → pass through
- [x] Array of mixed Firebase types → each element normalised
- [x] Deeply nested array + object combination
- [x] Empty array → `[]`
- [x] Empty object → `{}`

---

## `src/project/index.test.ts` — Access control **[done]**

`isAllowed` / `checkAccess` is the security boundary for all Firestore reads.

- [x] Path matching a glob in `allow` → allowed
- [x] Path matching a glob in `deny` → denied (even if also in `allow`)
- [x] Path matching nothing → denied
- [x] Empty `allow` list → everything denied
- [x] Empty `deny` list → allow list still works
- [x] `**` wildcard in `allow` matches any path
- [x] `**` wildcard in `deny` blocks any path regardless of allow
- [x] `checkAccess` returns `Task.succeed(undefined)` when allowed
- [x] `checkAccess` returns `Task.fail(AccessDeniedError)` when denied
- [x] `AccessDeniedError` has the correct `_tag`, `path`, and `message`

---

## `src/tools/firestore/operations/distinct_values.test.ts` — Pure business logic

`makeCompositeKey` / `parseCompositeKey` and the accumulator logic are pure
(in-memory). The Firestore fetch loop can be tested with a lightweight mock.

### Key encoding (`makeCompositeKey` / `parseCompositeKey`)

- [ ] Single field, non-null value → plain string key (not JSON-wrapped)
- [ ] Single field, `null` value → `'__null__'` key
- [ ] Single field, `'__null__'` string value → stored as `'__null__'` (ambiguous — document this behaviour)
- [ ] Multi-field, all non-null → JSON array key
- [ ] Multi-field, one null → JSON array with `'__null__'` entry
- [ ] `parseCompositeKey` round-trips single-field null → `[null]`
- [ ] `parseCompositeKey` round-trips multi-field mixed → correct scalars

### Input validation (exercised via `distinctValues` with a mock ctx)

- [ ] Neither `field` nor `fields` → `FirestoreDistinctValuesError`
- [ ] `fields` is empty array → `FirestoreDistinctValuesError`
- [ ] Neither `collection` nor `collectionId` → `FirestoreDistinctValuesError`
- [ ] Both `collection` and `collectionId` → `FirestoreDistinctValuesError`
- [ ] `groupByFields` contains a field not in `fields` → `FirestoreDistinctValuesError`
- [ ] Invalid collection path (even segments) → `FirestoreDistinctValuesError`

### Accumulator / output shaping (mock Firestore snapshot)

- [ ] Single field, single doc → `values[0].value` is a plain scalar
- [ ] Single field, multiple docs with repeated values → correct counts, sorted desc
- [ ] Multi-field (no `groupByFields`) → `value` is an object keyed by all fields
- [ ] `groupByFields` subset + label fields → label arrays collected per group
- [ ] Label field value `null` → not added to the label `Set` (no `null` in labels)
- [ ] `collectionId` mode → `byCollection` map present; `collection` mode → absent
- [ ] `groupByPathSegment` extracts the correct path segment as the bucket key
- [ ] `minCollections: 2` filters out values present in fewer than 2 buckets
- [ ] `minCollections: 'all'` → resolves to the total number of distinct buckets found
- [ ] `minCollections: 'all'` with a single bucket → all values pass through
- [ ] Pagination: mock that returns `fetchLimit` docs on first call, remainder on second → totals correct
- [ ] Empty collection → `values: []`, `totalDocsFetched: 0`

---

## `src/tools/firestore/operations/get_collection_schema.test.ts` — `inferType`

`inferType` is a pure function (except for `instanceof` checks on Firebase types
which can be duck-typed or mocked).

- [ ] `null` / `undefined` → `'null'`
- [ ] `true` / `false` → `'boolean'`
- [ ] `'hello'` → `'string'`
- [ ] `42` → `'integer'`
- [ ] `3.14` → `'float'`
- [ ] `Timestamp` instance → `'timestamp'`
- [ ] `GeoPoint` instance → `'geopoint'`
- [ ] `DocumentReference` instance → `'reference'`
- [ ] `[]` (empty array) → `'array<unknown>'`
- [ ] `['a', 'b']` → `'array<string>'`
- [ ] `[1, 'a']` → `'array<integer | string>'` (order may vary — test set membership)
- [ ] Nested array → inner type inferred recursively
- [ ] Plain object → `'map'`
- [ ] `Symbol` or other exotic → `'unknown'`

### Schema inference (sampling deduplication — mock Firestore)

- [ ] Docs present in both `fromStart` and `fromEnd` snapshots are deduplicated by ID
- [ ] `fromEnd` returning `null` (index unavailable) → graceful fallback to start-only
- [ ] Field present in all sampled docs → coverage `n/n sampled`
- [ ] Field present in some docs → correct partial coverage string
- [ ] Field with mixed types across docs → `types` array contains all observed types

---

## `src/tools/index.test.ts` — `dispatchTool` routing + `catchAll`

Mock `ProjectContext` and operation functions to verify routing and error mapping
without hitting Firebase.

### Routing

- [ ] Unknown tool name → `UNKNOWN_TOOL` error response
- [ ] `firestore_read` with unknown operation → `UNKNOWN_TOOL` error response
- [ ] `auth_read` with unknown operation → `UNKNOWN_TOOL` error response
- [ ] `firestore_read` with valid operation → delegates to the correct handler and returns `{ success: true, data }`
- [ ] `auth_read` with valid operation → delegates to the correct handler and returns `{ success: true, data }`

### `catchAll` error mapping

- [ ] `AccessDeniedError` → `{ success: false, error: { code: 'ACCESS_DENIED' } }` + `isError: true`
- [ ] `DocumentNotFoundError` → `{ code: 'NOT_FOUND' }` with `path` in details
- [ ] `AuthUserNotFoundError` → `{ code: 'NOT_FOUND' }` with `identifier` in details
- [ ] Any `Firestore*Error` → `{ code: 'FIRESTORE_ERROR' }` with `cause` in details
- [ ] Any `Auth*Error` → `{ code: 'AUTH_ERROR' }` with `cause` in details
- [ ] `UnknownFirestoreOperationError` → `{ code: 'UNKNOWN_TOOL' }`
- [ ] `UnknownAuthOperationError` → `{ code: 'UNKNOWN_TOOL' }`

---

## `src/tools/firestore/operations/get_many_documents.test.ts` — Batch path logic

The mode selection, path validation, and `maxBatchSize` enforcement are pure.

- [ ] `paths[]` mode resolves correctly (no `collection` or `ids`)
- [ ] `collection + ids[]` mode resolves correctly
- [ ] Providing both `paths` and `collection` → error
- [ ] Invalid document path in `paths[]` → error per path
- [ ] Exceeding `maxBatchSize` → error
- [ ] `checkAccess` is called with each unique parent collection path in `paths[]` mode
- [ ] `checkAccess` is called with `collection` in collection+ids mode

---

## Notes

- All tests live in `src/**/*.test.ts` (matched by `vitest.config.ts`)
- Run with `pnpm test` (single run) or `pnpm test:watch` (interactive)
- Coverage: `pnpm test:coverage`
- Firebase SDK types (`Timestamp`, `GeoPoint`, `DocumentReference`) should be
  duck-typed or imported from `firebase-admin/firestore` — do not call
  `initializeApp` in unit tests
- Use `vi.fn()` / `vi.mock()` for `ProjectContext` — avoid real Firebase connections
