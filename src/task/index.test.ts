import { describe, expect, it, vi } from 'vitest';

import { Exit, Task } from './index';

// ---------------------------------------------------------------------------
// Exit constructors & guards
// ---------------------------------------------------------------------------

describe('Exit', () => {
  describe('constructors', () => {
    it('ok wraps a value', () => {
      const e = Exit.ok(42);
      expect(e._tag).toBe('ok');
      expect((e as any).value).toBe(42);
    });

    it('err wraps an error', () => {
      const e = Exit.err('boom');
      expect(e._tag).toBe('err');
      expect((e as any).error).toBe('boom');
    });

    it('die wraps an optional cause', () => {
      expect(Exit.die()._tag).toBe('die');
      const e = Exit.die(new Error('oops'));
      expect(e._tag).toBe('die');
      expect((e as any).cause).toBeInstanceOf(Error);
    });
  });

  describe('guards', () => {
    it('isOk returns true only for ok exits', () => {
      expect(Exit.isOk(Exit.ok(1))).toBe(true);
      expect(Exit.isOk(Exit.err('e'))).toBe(false);
      expect(Exit.isOk(Exit.die())).toBe(false);
    });

    it('isErr returns true only for err exits', () => {
      expect(Exit.isErr(Exit.err('e'))).toBe(true);
      expect(Exit.isErr(Exit.ok(1))).toBe(false);
      expect(Exit.isErr(Exit.die())).toBe(false);
    });

    it('isDie returns true only for die exits', () => {
      expect(Exit.isDie(Exit.die())).toBe(true);
      expect(Exit.isDie(Exit.ok(1))).toBe(false);
      expect(Exit.isDie(Exit.err('e'))).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function run<A, E>(task: Task<A, E>) {
  return task.unsafeRun();
}

// ---------------------------------------------------------------------------
// Task static constructors
// ---------------------------------------------------------------------------

describe('Task.succeed', () => {
  it('resolves to ok', async () => {
    const exit = await run(Task.succeed(99));
    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) expect(exit.value).toBe(99);
  });
});

describe('Task.fail', () => {
  it('resolves to err', async () => {
    const exit = await run(Task.fail('reason'));
    expect(Exit.isErr(exit)).toBe(true);
    if (Exit.isErr(exit)) expect(exit.error).toBe('reason');
  });
});

describe('Task.die', () => {
  it('resolves to die', async () => {
    const exit = await run(Task.die('cause'));
    expect(Exit.isDie(exit)).toBe(true);
    if (Exit.isDie(exit)) expect(exit.cause).toBe('cause');
  });
});

describe('Task.sync', () => {
  it('wraps a synchronous value', async () => {
    const exit = await run(Task.sync(() => 'hello'));
    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) expect(exit.value).toBe('hello');
  });

  it('converts a thrown error to die', async () => {
    const exit = await run(
      Task.sync(() => {
        throw new Error('sync boom');
      }),
    );
    expect(Exit.isDie(exit)).toBe(true);
  });
});

describe('Task.lazy', () => {
  it('defers construction until run', async () => {
    let constructed = false;
    const task = Task.lazy(() => {
      constructed = true;
      return Task.succeed(1);
    });
    expect(constructed).toBe(false);
    await run(task);
    expect(constructed).toBe(true);
  });
});

describe('Task.attempt', () => {
  it('resolves to ok when the factory succeeds', async () => {
    const exit = await run(
      Task.attempt({
        try: () => Promise.resolve('done'),
        catch: (e) => e,
      }),
    );
    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) expect(exit.value).toBe('done');
  });

  it('resolves to err when the factory throws', async () => {
    const exit = await run(
      Task.attempt({
        try: () => {
          throw new Error('fail');
        },
        catch: (e) => ({ mapped: true, cause: e }),
      }),
    );
    expect(Exit.isErr(exit)).toBe(true);
    if (Exit.isErr(exit)) expect((exit.error as any).mapped).toBe(true);
  });

  it('resolves to err when the promise rejects', async () => {
    const exit = await run(
      Task.attempt({
        try: () => Promise.reject(new Error('async fail')),
        catch: (e) => String(e),
      }),
    );
    expect(Exit.isErr(exit)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Task instance combinators
// ---------------------------------------------------------------------------

describe('Task#map', () => {
  it('transforms the ok value', async () => {
    const exit = await run(Task.succeed(3).map((n) => n * 2));
    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) expect(exit.value).toBe(6);
  });

  it('passes err through unchanged', async () => {
    const exit = await run(Task.fail<string>('e').map((n: number) => n * 2));
    expect(Exit.isErr(exit)).toBe(true);
    if (Exit.isErr(exit)) expect(exit.error).toBe('e');
  });

  it('converts a mapper throw to die', async () => {
    const exit = await run(
      Task.succeed(1).map(() => {
        throw new Error('map boom');
      }),
    );
    expect(Exit.isDie(exit)).toBe(true);
  });
});

describe('Task#flatMap', () => {
  it('chains a successful continuation', async () => {
    const exit = await run(Task.succeed(5).flatMap((n) => Task.succeed(n + 1)));
    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) expect(exit.value).toBe(6);
  });

  it('short-circuits on err', async () => {
    let ran = false;
    const exit = await run(
      Task.fail('original').flatMap(() => {
        ran = true;
        return Task.succeed(42);
      }),
    );
    expect(ran).toBe(false);
    expect(Exit.isErr(exit)).toBe(true);
  });

  it('can chain to a failing task', async () => {
    const exit = await run(
      Task.succeed(1).flatMap(() => Task.fail('chained error')),
    );
    expect(Exit.isErr(exit)).toBe(true);
    if (Exit.isErr(exit)) expect(exit.error).toBe('chained error');
  });
});

describe('Task#tap', () => {
  it('runs a side effect and preserves the value', async () => {
    let seen: number | undefined;
    const exit = await run(
      Task.succeed(7).tap((n) => {
        seen = n;
      }),
    );
    expect(seen).toBe(7);
    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) expect(exit.value).toBe(7);
  });

  it('skips the side effect on err', async () => {
    let ran = false;
    await run(
      Task.fail('e').tap(() => {
        ran = true;
      }),
    );
    expect(ran).toBe(false);
  });
});

describe('Task#mapError', () => {
  it('transforms the error', async () => {
    const exit = await run(Task.fail(1).mapError((n) => n * 10));
    expect(Exit.isErr(exit)).toBe(true);
    if (Exit.isErr(exit)) expect(exit.error).toBe(10);
  });

  it('passes ok through', async () => {
    const exit = await run(Task.succeed('v').mapError(() => 'new error'));
    expect(Exit.isOk(exit)).toBe(true);
  });
});

describe('Task#catchAll', () => {
  it('recovers from an err', async () => {
    const exit = await run(
      Task.fail('oops').catchAll(() => Task.succeed('recovered')),
    );
    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) expect(exit.value).toBe('recovered');
  });

  it('does not run the handler on ok', async () => {
    let ran = false;
    const exit = await run(
      Task.succeed(1).catchAll(() => {
        ran = true;
        return Task.succeed(2);
      }),
    );
    expect(ran).toBe(false);
    if (Exit.isOk(exit)) expect(exit.value).toBe(1);
  });

  it('passes die through unchanged', async () => {
    const exit = await run(
      Task.die('fatal').catchAll(() => Task.succeed('recovered')),
    );
    expect(Exit.isDie(exit)).toBe(true);
  });
});

describe('Task#catchWhen', () => {
  it('handles only the matching error tag', async () => {
    type E = { _tag: 'A' } | { _tag: 'B' };
    const errA = Task.fail<E>({ _tag: 'A' });
    const errB = Task.fail<E>({ _tag: 'B' });

    const exitA = await run(
      errA.catchWhen('_tag', 'A', () => Task.succeed('caught A')),
    );
    expect(Exit.isOk(exitA)).toBe(true);
    if (Exit.isOk(exitA)) expect(exitA.value).toBe('caught A');

    const exitB = await run(
      errB.catchWhen('_tag', 'A', () => Task.succeed('caught A')),
    );
    expect(Exit.isErr(exitB)).toBe(true);
    if (Exit.isErr(exitB)) expect(exitB.error).toEqual({ _tag: 'B' });
  });

  it('passes ok through without running the handler', async () => {
    let ran = false;
    const exit = await run(
      Task.succeed(1).catchWhen('_tag', 'A' as never, () => {
        ran = true;
        return Task.succeed(2);
      }),
    );
    expect(ran).toBe(false);
    expect(Exit.isOk(exit)).toBe(true);
  });

  it('passes die through without running the handler', async () => {
    let ran = false;
    const exit = await run(
      Task.die('fatal').catchWhen('_tag', 'A' as never, () => {
        ran = true;
        return Task.succeed('recovered');
      }),
    );
    expect(ran).toBe(false);
    expect(Exit.isDie(exit)).toBe(true);
  });
});

describe('Task#filter', () => {
  it('passes when the predicate holds', async () => {
    const exit = await run(
      Task.succeed(10).filter(
        (n) => n > 5,
        () => 'too small',
      ),
    );
    expect(Exit.isOk(exit)).toBe(true);
  });

  it('fails when the predicate does not hold', async () => {
    const exit = await run(
      Task.succeed(3).filter(
        (n) => n > 5,
        (n) => `${n} is too small`,
      ),
    );
    expect(Exit.isErr(exit)).toBe(true);
    if (Exit.isErr(exit)) expect(exit.error).toBe('3 is too small');
  });

  it('passes err through without evaluating the predicate', async () => {
    let ran = false;
    const exit = await run(
      Task.fail('original').filter(
        () => {
          ran = true;
          return true;
        },
        () => 'filtered',
      ),
    );
    expect(ran).toBe(false);
    expect(Exit.isErr(exit)).toBe(true);
    if (Exit.isErr(exit)) expect(exit.error).toBe('original');
  });

  it('passes die through without evaluating the predicate', async () => {
    let ran = false;
    const exit = await run(
      Task.die('fatal').filter(
        () => {
          ran = true;
          return true;
        },
        () => 'filtered',
      ),
    );
    expect(ran).toBe(false);
    expect(Exit.isDie(exit)).toBe(true);
  });
});

describe('Task#tapError', () => {
  it('runs a side effect on err without changing it', async () => {
    let seen: unknown;
    const exit = await run(
      Task.fail('e').tapError((e) => {
        seen = e;
      }),
    );
    expect(seen).toBe('e');
    expect(Exit.isErr(exit)).toBe(true);
    if (Exit.isErr(exit)) expect(exit.error).toBe('e');
  });

  it('skips the side effect on ok', async () => {
    let ran = false;
    await run(
      Task.succeed(1).tapError(() => {
        ran = true;
      }),
    );
    expect(ran).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Task#withTimeout
// ---------------------------------------------------------------------------

describe('Task#withTimeout', () => {
  it('returns ok for tasks that complete before timeout', async () => {
    const exit = await run(Task.succeed('done').withTimeout(1000));
    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) expect(exit.value).toBe('done');
  });

  it('returns TimeoutError for tasks that exceed timeout', async () => {
    const exit = await run(Task.never().withTimeout(10));
    expect(Exit.isErr(exit)).toBe(true);
    if (Exit.isErr(exit)) {
      expect(exit.error).toEqual({ _tag: 'TimeoutError', ms: 10 });
    }
  });

  it('preserves non-timeout errors', async () => {
    const exit = await run(Task.fail('original').withTimeout(1000));
    expect(Exit.isErr(exit)).toBe(true);
    if (Exit.isErr(exit)) expect(exit.error).toBe('original');
  });

  it('preserves non-timeout die (e.g., exceptions)', async () => {
    const exit = await run(Task.die('fatal').withTimeout(1000));
    expect(Exit.isDie(exit)).toBe(true);
    if (Exit.isDie(exit)) expect(exit.cause).toBe('fatal');
  });

  it('completes successfully if task finishes before timeout', async () => {
    const exit = await run(
      Task.attempt({
        try: () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 50)),
        catch: () => 'error',
      }).withTimeout(100),
    );
    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) expect(exit.value).toBe('late');
  });
});

// ---------------------------------------------------------------------------
// Task.gen
// ---------------------------------------------------------------------------

describe('Task.gen', () => {
  it('sequences successful tasks', async () => {
    const exit = await run(
      Task.gen(function* () {
        const a = yield* Task.succeed(1);
        const b = yield* Task.succeed(2);
        return a + b;
      }),
    );
    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) expect(exit.value).toBe(3);
  });

  it('short-circuits on the first err', async () => {
    let reached = false;
    const exit = await run(
      Task.gen(function* () {
        yield* Task.fail('first error');
        reached = true;
        yield* Task.succeed(1);
        return 'done';
      }),
    );
    expect(reached).toBe(false);
    expect(Exit.isErr(exit)).toBe(true);
    if (Exit.isErr(exit)) expect(exit.error).toBe('first error');
  });

  it('returns the final value', async () => {
    const exit = await run(
      Task.gen(function* () {
        const x = yield* Task.succeed(10);
        return x * 3;
      }),
    );
    expect(Exit.isOk(exit)).toBe(true);
    if (Exit.isOk(exit)) expect(exit.value).toBe(30);
  });

  it('returns die when signal is aborted between gen steps', async () => {
    const controller = new AbortController();
    let reachedSecond = false;

    const exit = await Task.gen(function* () {
      yield* Task.succeed(1);
      controller.abort('mid-gen');
      yield* Task.succeed(2);
      reachedSecond = true;
      return 'done';
    }).run(controller.signal);

    expect(reachedSecond).toBe(false);
    expect(Exit.isDie(exit)).toBe(true);
    if (Exit.isDie(exit)) expect(exit.cause).toBe('mid-gen');
  });
});

// ---------------------------------------------------------------------------
// Abort / fork
// ---------------------------------------------------------------------------

describe('Task#fork / abort', () => {
  it('abort resolves to die', async () => {
    const { exit, abort } = Task.never().fork();
    abort();
    const result = await exit;
    expect(Exit.isDie(result)).toBe(true);
  });

  it('aborting an already-resolved task is a no-op', async () => {
    const { exit, abort } = Task.succeed(1).fork();
    const result = await exit;
    abort();
    expect(Exit.isOk(result)).toBe(true);
  });

  it('run with a pre-aborted signal resolves to die immediately', async () => {
    const controller = new AbortController();
    controller.abort('pre-aborted');
    const exit = await Task.succeed(1).run(controller.signal);
    expect(Exit.isDie(exit)).toBe(true);
    if (Exit.isDie(exit)) expect(exit.cause).toBe('pre-aborted');
  });
});

describe('Task.never', () => {
  it('setInterval keepalive callback fires but is a no-op', async () => {
    vi.useFakeTimers();
    try {
      const { exit, abort } = Task.never().fork();
      vi.advanceTimersByTime(2 ** 31 - 1);
      abort();
      const result = await exit;
      expect(Exit.isDie(result)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
