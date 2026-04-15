import { describe, expect, it } from 'vitest';

import { Exit, Task } from '../task';
import { AccessDeniedError, isAllowed, makeCheckAccess } from './index';

const run = async <A, E>(task: Task<A, E>) => task.fork().exit;

// ---------------------------------------------------------------------------
// isAllowed — glob matching rules
// ---------------------------------------------------------------------------

describe('isAllowed', () => {
  it('allows a path that matches a glob in allow', () => {
    expect(isAllowed('users/123', { allow: ['users/**'], deny: [] })).toBe(
      true,
    );
  });

  it('denies a path that matches a glob in deny, even if it also matches allow', () => {
    expect(
      isAllowed('users/123', { allow: ['users/**'], deny: ['users/**'] }),
    ).toBe(false);
  });

  it('denies a path that matches nothing', () => {
    expect(isAllowed('orders/456', { allow: ['users/**'], deny: [] })).toBe(
      false,
    );
  });

  it('denies everything when allow list is empty', () => {
    expect(isAllowed('users/123', { allow: [], deny: [] })).toBe(false);
  });

  it('allow list still works when deny list is empty', () => {
    expect(isAllowed('users/123', { allow: ['users/**'], deny: [] })).toBe(
      true,
    );
  });

  it('** wildcard in allow matches any path', () => {
    expect(isAllowed('a/b/c/d', { allow: ['**'], deny: [] })).toBe(true);
  });

  it('** wildcard in deny blocks any path regardless of allow', () => {
    expect(isAllowed('users/123', { allow: ['**'], deny: ['**'] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkAccess — Task return values
// ---------------------------------------------------------------------------

describe('checkAccess', () => {
  it('returns Task.succeed(undefined) when the path is allowed', async () => {
    const checkAccess = makeCheckAccess({ allow: ['users/**'], deny: [] });
    const exit = await run(checkAccess('users/123'));
    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) expect(exit.value).toBeUndefined();
  });

  it('returns Task.fail(AccessDeniedError) when the path is denied', async () => {
    const checkAccess = makeCheckAccess({ allow: [], deny: [] });
    const exit = await run(checkAccess('users/123'));
    expect(Exit.isErr(exit)).toBe(true);
    if (Exit.isErr(exit)) expect(exit.error).toBeInstanceOf(AccessDeniedError);
  });
});

// ---------------------------------------------------------------------------
// AccessDeniedError shape
// ---------------------------------------------------------------------------

describe('AccessDeniedError', () => {
  it('has _tag AccessDeniedError', () => {
    const err = new AccessDeniedError('users/123');
    expect(err._tag).toBe('AccessDeniedError');
  });

  it('exposes the denied path', () => {
    const err = new AccessDeniedError('users/123');
    expect(err.path).toBe('users/123');
  });

  it('has a message that includes the path', () => {
    const err = new AccessDeniedError('users/123');
    expect(err.message).toContain('users/123');
  });
});
