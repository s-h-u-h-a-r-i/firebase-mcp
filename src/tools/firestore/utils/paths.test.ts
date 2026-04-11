import { describe, expect, it } from 'vitest';

import { collectionPathError, documentPathError, segmentCount } from './paths';

describe('segmentCount', () => {
  it('counts single-segment paths', () => {
    expect(segmentCount('users')).toBe(1);
  });

  it('counts multi-segment paths', () => {
    expect(segmentCount('users/123/posts')).toBe(3);
    expect(segmentCount('users/123')).toBe(2);
  });

  it('ignores leading and trailing slashes', () => {
    expect(segmentCount('/users/')).toBe(1);
    expect(segmentCount('/users/123/')).toBe(2);
  });

  it('returns 0 for an empty string', () => {
    expect(segmentCount('')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// collectionPathError
// ---------------------------------------------------------------------------

describe('collectionPathError', () => {
  it('returns null for a valid single-segment collection path', () => {
    expect(collectionPathError('users')).toBeNull();
  });

  it('returns null for a valid three-segment collection path', () => {
    expect(collectionPathError('users/123/posts')).toBeNull();
  });

  it('returns null for a valid five-segment collection path', () => {
    expect(collectionPathError('a/b/c/d/e')).toBeNull();
  });

  it('returns an error message for a two-segment (document) path', () => {
    const msg = collectionPathError('users/123');
    expect(msg).toBeTypeOf('string');
    expect(msg).toContain('2');
    expect(msg).toContain('document path');
  });

  it('returns an error message for a four-segment path', () => {
    const msg = collectionPathError('stores/ABC/orders/456');
    expect(msg).toBeTypeOf('string');
    expect(msg).toContain('4');
  });
});

// ---------------------------------------------------------------------------
// documentPathError
// ---------------------------------------------------------------------------

describe('documentPathError', () => {
  it('returns null for a valid two-segment document path', () => {
    expect(documentPathError('users/123')).toBeNull();
  });

  it('returns null for a valid four-segment document path', () => {
    expect(documentPathError('stores/ABC/orders/456')).toBeNull();
  });

  it('returns an error message for a single-segment (collection) path', () => {
    const msg = documentPathError('users');
    expect(msg).toBeTypeOf('string');
    expect(msg).toContain('1');
    expect(msg).toContain('collection path');
  });

  it('returns an error message for a three-segment path', () => {
    const msg = documentPathError('users/123/posts');
    expect(msg).toBeTypeOf('string');
    expect(msg).toContain('3');
  });
});
