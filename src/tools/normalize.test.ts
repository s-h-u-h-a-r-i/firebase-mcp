import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin');

import {
  DocumentReference,
  GeoPoint,
  Timestamp,
} from '../../__mocks__/firebase-admin';
import { normalizeValue } from './normalize';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const TS_SECONDS = 1_700_000_000;
const TS_ISO = new Date(TS_SECONDS * 1000).toISOString();

// ---------------------------------------------------------------------------
// null / undefined
// ---------------------------------------------------------------------------

describe('normalizeValue — null and undefined', () => {
  it('passes null through unchanged', () => {
    expect(normalizeValue(null)).toBeNull();
  });

  it('passes undefined through unchanged', () => {
    expect(normalizeValue(undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

describe('normalizeValue — primitives', () => {
  it('passes a string through unchanged', () => {
    expect(normalizeValue('hello')).toBe('hello');
  });

  it('passes a number through unchanged', () => {
    expect(normalizeValue(42)).toBe(42);
  });

  it('passes a boolean through unchanged', () => {
    expect(normalizeValue(true)).toBe(true);
    expect(normalizeValue(false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Timestamp
// ---------------------------------------------------------------------------

describe('normalizeValue — Timestamp instance', () => {
  it('converts a Timestamp to an ISO string via toDate().toISOString()', () => {
    const nanoseconds = 500_000_000; // 0.5 s
    const ts = new Timestamp(TS_SECONDS, nanoseconds);
    const expected = new Date(
      TS_SECONDS * 1000 + nanoseconds / 1e6,
    ).toISOString();
    expect(normalizeValue(ts)).toBe(expected);
  });

  it('converts a zero-epoch Timestamp to the Unix epoch ISO string', () => {
    const ts = new Timestamp(0, 0);
    expect(normalizeValue(ts)).toBe(new Date(0).toISOString());
  });
});

// ---------------------------------------------------------------------------
// GeoPoint
// ---------------------------------------------------------------------------

describe('normalizeValue — GeoPoint instance', () => {
  it('converts a GeoPoint to { latitude, longitude }', () => {
    const gp = new GeoPoint(37.7749, -122.4194);
    expect(normalizeValue(gp)).toEqual({
      latitude: 37.7749,
      longitude: -122.4194,
    });
  });
});

// ---------------------------------------------------------------------------
// DocumentReference
// ---------------------------------------------------------------------------

describe('normalizeValue — DocumentReference instance', () => {
  it('converts a DocumentReference to its path string', () => {
    const ref = new DocumentReference('users/abc123');
    expect(normalizeValue(ref)).toBe('users/abc123');
  });
});

// ---------------------------------------------------------------------------
// Raw Timestamp POJO { _seconds, _nanoseconds }
// ---------------------------------------------------------------------------

describe('normalizeValue — raw Timestamp POJO', () => {
  it('converts an exact { _seconds, _nanoseconds } POJO (2 keys, both number) to an ISO string', () => {
    const pojo = { _seconds: TS_SECONDS, _nanoseconds: 0 };
    expect(normalizeValue(pojo)).toBe(TS_ISO);
  });

  it('treats a POJO with a third key as a plain object (not converted to ISO string)', () => {
    const pojo = { _seconds: TS_SECONDS, _nanoseconds: 0, extra: 'field' };
    const result = normalizeValue(pojo) as Record<string, unknown>;
    expect(typeof result).toBe('object');
    expect(result['_seconds']).toBe(TS_SECONDS);
    expect(result['extra']).toBe('field');
  });

  it('treats a POJO where _seconds is a string as a plain object (type guard)', () => {
    const pojo = { _seconds: 'not-a-number', _nanoseconds: 0 };
    const result = normalizeValue(pojo) as Record<string, unknown>;
    expect(typeof result).toBe('object');
    expect(result['_seconds']).toBe('not-a-number');
  });

  it('treats a POJO where _nanoseconds is a string as a plain object (type guard)', () => {
    const pojo = { _seconds: TS_SECONDS, _nanoseconds: 'not-a-number' };
    const result = normalizeValue(pojo) as Record<string, unknown>;
    expect(typeof result).toBe('object');
    expect(result['_nanoseconds']).toBe('not-a-number');
  });
});

// ---------------------------------------------------------------------------
// Plain objects
// ---------------------------------------------------------------------------

describe('normalizeValue — plain objects', () => {
  it('recursively normalises values in a flat object', () => {
    const ts = new Timestamp(TS_SECONDS, 0);
    const obj = { name: 'Alice', createdAt: ts, age: 30 };
    const result = normalizeValue(obj) as Record<string, unknown>;
    expect(result['name']).toBe('Alice');
    expect(result['age']).toBe(30);
    expect(result['createdAt']).toBe(TS_ISO);
  });

  it('recursively normalises values in a nested object', () => {
    const gp = new GeoPoint(1, 2);
    const obj = { level1: { level2: { location: gp } } };
    const result = normalizeValue(obj) as Record<string, unknown>;
    expect((result['level1'] as Record<string, unknown>)['level2']).toEqual({
      location: { latitude: 1, longitude: 2 },
    });
  });

  it('returns an empty object unchanged', () => {
    expect(normalizeValue({})).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Arrays
// ---------------------------------------------------------------------------

describe('normalizeValue — arrays', () => {
  it('passes an array of primitives through unchanged', () => {
    expect(normalizeValue([1, 'two', true])).toEqual([1, 'two', true]);
  });

  it('normalises each element in an array of mixed Firebase types', () => {
    const ts = new Timestamp(TS_SECONDS, 0);
    const gp = new GeoPoint(10, 20);
    const ref = new DocumentReference('col/doc');
    const result = normalizeValue([ts, gp, ref]) as unknown[];
    expect(result[0]).toBe(TS_ISO);
    expect(result[1]).toEqual({ latitude: 10, longitude: 20 });
    expect(result[2]).toBe('col/doc');
  });

  it('returns an empty array unchanged', () => {
    expect(normalizeValue([])).toEqual([]);
  });

  it('handles deeply nested arrays and objects', () => {
    const ref = new DocumentReference('a/b');
    const input = { items: [{ ref }, [ref, { ref }]] };
    const result = normalizeValue(input) as Record<string, unknown>;
    const items = result['items'] as unknown[];
    expect((items[0] as Record<string, unknown>)['ref']).toBe('a/b');
    const nested = items[1] as unknown[];
    expect(nested[0]).toBe('a/b');
    expect((nested[1] as Record<string, unknown>)['ref']).toBe('a/b');
  });
});
