import { describe, expect, it } from 'vitest';

import { Exit, Task } from '../../../task';
import {
  FirestoreDistinctValuesError,
  distinctValues,
  makeCompositeKey,
  parseCompositeKey,
} from './distinct_values';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type MockDoc = {
  get: (field: string) => unknown;
  ref: { parent: { path: string } };
};

const makeDoc = (
  fields: Record<string, unknown>,
  parentPath = 'items',
): MockDoc => ({
  get: (f) => fields[f],
  ref: { parent: { path: parentPath } },
});

// Returns a mock db whose sequential .get() calls yield each batch in order.
// After all batches are exhausted, subsequent calls return an empty snapshot.
const makeDb = (batches: MockDoc[][]) => {
  let call = 0;
  const makeQuery = (): any => ({
    select: () => makeQuery(),
    where: () => makeQuery(),
    startAfter: () => makeQuery(),
    limit: () => ({
      get: () => Promise.resolve({ docs: batches[call++] ?? [] }),
    }),
  });
  return {
    collection: (_path: string) => makeQuery(),
    collectionGroup: (_id: string) => makeQuery(),
  };
};

const makeCtx = (
  db: ReturnType<typeof makeDb>,
  maxBatchFetchSize = 1000,
): any => ({
  config: {
    firestore: {
      maxBatchFetchSize,
      rules: { allow: ['**'], deny: [] },
    },
  },
  firestore: () => db,
  auth: () => {
    throw new Error('not used');
  },
  checkAccess: () => Task.succeed(undefined as void),
});

const run = async <A, E>(task: Task<A, E>) => task.fork().exit;

// ---------------------------------------------------------------------------
// makeCompositeKey
// ---------------------------------------------------------------------------

describe('makeCompositeKey', () => {
  it('single non-null value → plain string (not JSON-wrapped)', () => {
    expect(makeCompositeKey(['alice'])).toBe('alice');
  });

  it('single null value → __null__', () => {
    expect(makeCompositeKey([null])).toBe('__null__');
  });

  it('single __null__ string → also __null__ (ambiguous with null — by design)', () => {
    // A raw string '__null__' and an actual null both produce the same key.
    // When read back via parseCompositeKey, both are interpreted as null.
    expect(makeCompositeKey(['__null__'])).toBe('__null__');
    expect(makeCompositeKey(['__null__'])).toBe(makeCompositeKey([null]));
  });

  it('multi-field all non-null → JSON array key', () => {
    expect(makeCompositeKey(['a', 'b'])).toBe('["a","b"]');
  });

  it('multi-field one null → JSON array with __null__ entry', () => {
    expect(makeCompositeKey(['a', null])).toBe('["a","__null__"]');
  });
});

// ---------------------------------------------------------------------------
// parseCompositeKey
// ---------------------------------------------------------------------------

describe('parseCompositeKey', () => {
  it('round-trips single-field null → [null]', () => {
    expect(parseCompositeKey('__null__', 1)).toEqual([null]);
  });

  it('round-trips multi-field mixed → correct scalars', () => {
    const key = makeCompositeKey(['alice', null, 'bob']);
    expect(parseCompositeKey(key, 3)).toEqual(['alice', null, 'bob']);
  });
});

// ---------------------------------------------------------------------------
// Input validation (via distinctValues with a minimal mock ctx)
// ---------------------------------------------------------------------------

describe('distinctValues — input validation', () => {
  const ctx = makeCtx(makeDb([[]]));

  const expectDistinctValuesError = async (
    args: Parameters<typeof distinctValues>[1],
  ) => {
    const exit = await run(distinctValues(ctx, args));
    expect(Exit.isErr(exit)).toBe(true);
    if (Exit.isErr(exit))
      expect(exit.error).toBeInstanceOf(FirestoreDistinctValuesError);
  };

  it('neither field nor fields → FirestoreDistinctValuesError', () =>
    expectDistinctValuesError({ collection: 'items' }));

  it('fields: [] → FirestoreDistinctValuesError', () =>
    expectDistinctValuesError({ fields: [], collection: 'items' }));

  it('neither collection nor collectionId → FirestoreDistinctValuesError', () =>
    expectDistinctValuesError({ field: 'name' }));

  it('both collection and collectionId → FirestoreDistinctValuesError', () =>
    expectDistinctValuesError({
      field: 'name',
      collection: 'items',
      collectionId: 'items',
    }));

  it('groupByFields contains a field not in fields → FirestoreDistinctValuesError', () =>
    expectDistinctValuesError({
      fields: ['a', 'b'],
      groupByFields: ['x'],
      collection: 'items',
    }));

  it('invalid collection path (even segments = document path) → FirestoreDistinctValuesError', () =>
    expectDistinctValuesError({ field: 'name', collection: 'users/123' }));
});

// ---------------------------------------------------------------------------
// Accumulator / output shaping (mock Firestore snapshots)
// ---------------------------------------------------------------------------

describe('distinctValues — accumulator / output shaping', () => {
  it('single field, single doc → value is a plain scalar', async () => {
    const ctx = makeCtx(makeDb([[makeDoc({ name: 'alice' })]]));
    const exit = await run(
      distinctValues(ctx, { field: 'name', collection: 'items' }),
    );

    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) {
      expect(exit.value.values[0]).toMatchObject({ value: 'alice', count: 1 });
    }
  });

  it('single field, repeated values → correct counts, sorted desc', async () => {
    const docs = [
      makeDoc({ role: 'admin' }),
      makeDoc({ role: 'user' }),
      makeDoc({ role: 'user' }),
      makeDoc({ role: 'admin' }),
      makeDoc({ role: 'user' }),
    ];
    const ctx = makeCtx(makeDb([docs]));
    const exit = await run(
      distinctValues(ctx, { field: 'role', collection: 'items' }),
    );

    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) {
      const { values } = exit.value;
      expect(values[0]).toMatchObject({ value: 'user', count: 3 });
      expect(values[1]).toMatchObject({ value: 'admin', count: 2 });
    }
  });

  it('multi-field (no groupByFields) → value is an object keyed by all fields', async () => {
    const ctx = makeCtx(
      makeDb([[makeDoc({ status: 'active', role: 'admin' })]]),
    );
    const exit = await run(
      distinctValues(ctx, { fields: ['status', 'role'], collection: 'items' }),
    );

    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) {
      expect(exit.value.values[0].value).toEqual({
        status: 'active',
        role: 'admin',
      });
    }
  });

  it('groupByFields subset → label arrays collected per group', async () => {
    const docs = [
      makeDoc({ id: 'A', label: 'Alpha' }),
      makeDoc({ id: 'A', label: 'ALPHA' }),
      makeDoc({ id: 'B', label: 'Beta' }),
    ];
    const ctx = makeCtx(makeDb([docs]));
    const exit = await run(
      distinctValues(ctx, {
        fields: ['id', 'label'],
        groupByFields: ['id'],
        collection: 'items',
      }),
    );

    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) {
      const { values } = exit.value;
      const a = values.find((v: any) => v.value.id === 'A') as any;
      expect(a?.count).toBe(2);
      expect(a?.value.label).toHaveLength(2);
      expect(a?.value.label).toEqual(
        expect.arrayContaining(['Alpha', 'ALPHA']),
      );

      const b = values.find((v: any) => v.value.id === 'B') as any;
      expect(b?.value.label).toEqual(['Beta']);
    }
  });

  it('label field null value → not added to the label Set', async () => {
    const docs = [
      makeDoc({ id: 'A', label: null }),
      makeDoc({ id: 'A', label: 'Alpha' }),
    ];
    const ctx = makeCtx(makeDb([docs]));
    const exit = await run(
      distinctValues(ctx, {
        fields: ['id', 'label'],
        groupByFields: ['id'],
        collection: 'items',
      }),
    );

    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) {
      expect((exit.value.values[0].value as any).label).toEqual(['Alpha']);
    }
  });

  it('collection mode → byCollection absent; collectionId mode → byCollection present', async () => {
    const collCtx = makeCtx(makeDb([[makeDoc({ x: 'a' })]]));
    const groupCtx = makeCtx(makeDb([[makeDoc({ x: 'a' }, 'things/1/items')]]));

    const collExit = await run(
      distinctValues(collCtx, { field: 'x', collection: 'items' }),
    );
    const groupExit = await run(
      distinctValues(groupCtx, { field: 'x', collectionId: 'items' }),
    );

    expect(Exit.isOk(collExit)).toBe(true);
    if (Exit.isOk(collExit))
      expect((collExit.value as any).byCollection).toBeUndefined();

    expect(Exit.isOk(groupExit)).toBe(true);
    if (Exit.isOk(groupExit))
      expect((groupExit.value as any).byCollection).toBeDefined();
  });

  it('groupByPathSegment extracts the correct path segment as the bucket key', async () => {
    const docs = [
      makeDoc({ x: 'a' }, 'shared/stores/ABC/data'),
      makeDoc({ x: 'b' }, 'shared/stores/XYZ/data'),
    ];
    const ctx = makeCtx(makeDb([docs]));
    const exit = await run(
      distinctValues(ctx, {
        field: 'x',
        collectionId: 'data',
        groupByPathSegment: 2,
      }),
    );

    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) {
      const keys = Object.keys(
        (exit.value as any).byCollection as Record<string, unknown>,
      );
      expect(keys).toContain('ABC');
      expect(keys).toContain('XYZ');
    }
  });

  it('minCollections: 2 filters out values present in fewer than 2 buckets', async () => {
    const docs = [
      makeDoc({ x: 'common' }, 'col/A/items'),
      makeDoc({ x: 'common' }, 'col/B/items'),
      makeDoc({ x: 'rare' }, 'col/A/items'),
    ];
    const ctx = makeCtx(makeDb([docs]));
    const exit = await run(
      distinctValues(ctx, {
        field: 'x',
        collectionId: 'items',
        minCollections: 2,
      }),
    );

    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) {
      const { values } = exit.value;
      expect(values).toHaveLength(1);
      expect(values[0].value).toBe('common');
    }
  });

  it('minCollections: all → resolves to total distinct bucket count', async () => {
    const docs = [
      makeDoc({ x: 'everywhere' }, 'col/A'),
      makeDoc({ x: 'everywhere' }, 'col/B'),
      makeDoc({ x: 'everywhere' }, 'col/C'),
      makeDoc({ x: 'partial' }, 'col/A'),
      makeDoc({ x: 'partial' }, 'col/B'),
    ];
    const ctx = makeCtx(makeDb([docs]));
    const exit = await run(
      distinctValues(ctx, {
        field: 'x',
        collectionId: 'col',
        minCollections: 'all',
      }),
    );

    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) {
      const { values } = exit.value;
      expect(values).toHaveLength(1);
      expect(values[0].value).toBe('everywhere');
    }
  });

  it('minCollections: all with a single bucket → all values pass through', async () => {
    const docs = [makeDoc({ x: 'a' }, 'items'), makeDoc({ x: 'b' }, 'items')];
    const ctx = makeCtx(makeDb([docs]));
    const exit = await run(
      distinctValues(ctx, {
        field: 'x',
        collectionId: 'items',
        minCollections: 'all',
      }),
    );

    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) {
      expect(exit.value.values).toHaveLength(2);
    }
  });

  it('pagination: totals and counts are correct across multiple fetches', async () => {
    // fetchLimit = 2; first batch fills it → triggers a second fetch
    const batch1 = [makeDoc({ x: 'a' }), makeDoc({ x: 'b' })];
    const batch2 = [makeDoc({ x: 'a' })];
    const ctx = makeCtx(makeDb([batch1, batch2]), 2);
    const exit = await run(
      distinctValues(ctx, { field: 'x', collection: 'items' }),
    );

    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) {
      expect(exit.value.totalDocsFetched).toBe(3);
      const { values } = exit.value;
      expect(values.find((v: any) => v.value === 'a')?.count).toBe(2);
      expect(values.find((v: any) => v.value === 'b')?.count).toBe(1);
    }
  });

  it('empty collection → values: [], totalDocsFetched: 0', async () => {
    const ctx = makeCtx(makeDb([[]]));
    const exit = await run(
      distinctValues(ctx, { field: 'x', collection: 'items' }),
    );

    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) {
      expect(exit.value.values).toEqual([]);
      expect(exit.value.totalDocsFetched).toBe(0);
    }
  });

  it('filters are forwarded to the query (where branch exercised)', async () => {
    const ctx = makeCtx(makeDb([[makeDoc({ status: 'active' })]]));
    const exit = await run(
      distinctValues(ctx, {
        field: 'status',
        collection: 'items',
        filters: [{ field: 'status', operator: '==', value: 'active' }],
      }),
    );

    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) {
      expect(exit.value.values[0].value).toBe('active');
    }
  });

  it('Firestore .get() failure → FirestoreDistinctValuesError with cause', async () => {
    const boom = new Error('network error');
    const failDb = {
      collection: () => ({
        select: () => ({
          where: () => ({ limit: () => ({ get: () => Promise.reject(boom) }) }),
          limit: () => ({ get: () => Promise.reject(boom) }),
        }),
      }),
      collectionGroup: () => ({
        select: () => ({
          limit: () => ({ get: () => Promise.reject(boom) }),
        }),
      }),
    };
    const ctx = makeCtx(failDb as any);
    const exit = await run(distinctValues(ctx, { field: 'x', collection: 'items' }));

    expect(Exit.isErr(exit)).toBe(true);
    if (Exit.isErr(exit)) {
      expect(exit.error).toBeInstanceOf(FirestoreDistinctValuesError);
      expect((exit.error as FirestoreDistinctValuesError).cause).toBe(boom);
    }
  });

  it('collectionId + multi-field → byCollection entries use object values', async () => {
    const docs = [
      makeDoc({ a: 'x', b: '1' }, 'col/A'),
      makeDoc({ a: 'x', b: '1' }, 'col/B'),
    ];
    const ctx = makeCtx(makeDb([docs]));
    const exit = await run(
      distinctValues(ctx, { fields: ['a', 'b'], collectionId: 'col' }),
    );

    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) {
      const byCollection = (exit.value as any).byCollection as Record<string, any[]>;
      expect(byCollection['col/A'][0].value).toEqual({ a: 'x', b: '1' });
      expect(byCollection['col/B'][0].value).toEqual({ a: 'x', b: '1' });
    }
  });
});
