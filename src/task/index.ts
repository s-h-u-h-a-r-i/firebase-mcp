type Ok<A> = { _tag: 'ok'; value: A };
type Err<E> = { _tag: 'err'; error: E };
type Die = { _tag: 'die'; cause?: unknown };

export type Exit<A, E> = Ok<A> | Err<E> | Die;

export const Exit = {
  ok: <A>(value: A): Exit<A, never> => ({ _tag: 'ok', value }),
  err: <E>(error: E): Exit<never, E> => ({ _tag: 'err', error }),
  die: (cause?: unknown): Exit<never, never> => ({ _tag: 'die', cause }),

  isOk: <A, E>(e: Exit<A, E>): e is Ok<A> => e._tag === 'ok',
  isErr: <A, E>(e: Exit<A, E>): e is Err<E> => e._tag === 'err',
  isDie: <A, E>(e: Exit<A, E>): e is Die => e._tag === 'die',
};

const abortIfNeeded = (signal: AbortSignal): Exit<never, never> | null =>
  signal.aborted ? Exit.die(signal.reason) : null;

const tryCatch = async <A, E>(
  f: () => PromiseLike<Exit<A, E>> | Exit<A, E>,
): Promise<Exit<A, E>> => {
  try {
    return await f();
  } catch (cause) {
    return Exit.die(cause);
  }
};

export class Task<A, E> {
  private constructor(
    private readonly effect: (signal: AbortSignal) => Promise<Exit<A, E>>,
  ) {}

  run(signal: AbortSignal) {
    const aborted = abortIfNeeded(signal);
    if (aborted) return Promise.resolve(aborted);
    return tryCatch(() => this.effect(signal));
  }

  fork() {
    const controller = new AbortController();
    return {
      exit: this.run(controller.signal),
      abort: () => controller.abort(),
    };
  }

  unsafeRun(): Promise<Exit<A, E>> {
    return this.run(new AbortController().signal);
  }

  map<B>(f: (a: A) => B) {
    return new Task(async (signal) => {
      const exit = await this.run(signal);
      if (!Exit.isOk(exit)) return exit;
      return tryCatch(() => Exit.ok(f(exit.value)));
    });
  }

  flatMap<B, E2>(f: (a: A) => Task<B, E2>) {
    return new Task(async (signal): Promise<Exit<B, E | E2>> => {
      const exit = await this.run(signal);
      if (!Exit.isOk(exit)) return exit;
      return f(exit.value).run(signal);
    });
  }

  tap(f: (a: A) => void | PromiseLike<void>) {
    return new Task(async (signal): Promise<Exit<A, E>> => {
      const exit = await this.run(signal);
      if (!Exit.isOk(exit)) return exit;
      return tryCatch(async () => {
        await f(exit.value);
        return exit;
      });
    });
  }

  mapError<E2>(f: (e: E) => E2) {
    return new Task(async (signal): Promise<Exit<A, E2>> => {
      const exit = await this.run(signal);
      if (!Exit.isErr(exit)) return exit;
      return tryCatch(() => Exit.err(f(exit.error)));
    });
  }

  catchAll<B, E2>(f: (e: E) => Task<B, E2>) {
    return new Task(async (signal): Promise<Exit<A | B, E2>> => {
      const exit = await this.run(signal);
      if (!Exit.isErr(exit)) return exit;
      return f(exit.error).run(signal);
    });
  }

  catchWhen<K extends keyof E, V extends E[K], B, E2>(
    key: K,
    value: V,
    handler: (e: Extract<E, Record<K, V>>) => Task<B, E2>,
  ) {
    return new Task(
      async (signal): Promise<Exit<A | B, Exclude<E, Record<K, V>> | E2>> => {
        const exit = await this.run(signal);
        if (!Exit.isErr(exit)) return exit;

        if (exit.error?.[key] === value) {
          return handler(exit.error as any).run(signal);
        }

        return exit as any;
      },
    );
  }

  filter<B extends A, E2>(
    predicate: (a: A) => a is B,
    onFalse: (a: A) => E2,
  ): Task<B, E | E2>;
  filter<E2>(
    predicate: (a: A) => boolean,
    onFalse: (a: A) => E2,
  ): Task<A, E | E2>;
  filter<B extends A, E2>(
    predicate: ((a: A) => a is B) | ((a: A) => boolean),
    onFalse: (a: A) => E2,
  ) {
    return new Task(async (signal): Promise<Exit<B | A, E | E2>> => {
      const exit = await this.run(signal);
      if (!Exit.isOk(exit)) return exit;
      return tryCatch(() => {
        if (predicate(exit.value)) return Exit.ok(exit.value as B);
        return Exit.err(onFalse(exit.value));
      });
    });
  }

  tapError(f: (e: E) => void | PromiseLike<void>) {
    return new Task(async (signal): Promise<Exit<A, E>> => {
      const exit = await this.run(signal);
      if (!Exit.isErr(exit)) return exit;
      return tryCatch(async () => {
        await f(exit.error);
        return exit;
      });
    });
  }

  withTimeout(ms: number): Task<A, E | { _tag: 'TimeoutError'; ms: number }> {
    return new Task(
      async (
        signal,
      ): Promise<Exit<A, E | { _tag: 'TimeoutError'; ms: number }>> => {
        const controller = new AbortController();
        const combinedSignal = AbortSignal.any([signal, controller.signal]);

        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, ms);

        try {
          const exit = await this.run(combinedSignal);
          if (timedOut && exit._tag === 'die') {
            return Exit.err({ _tag: 'TimeoutError' as const, ms });
          }
          return exit as Exit<A, E | { _tag: 'TimeoutError'; ms: number }>;
        } finally {
          clearTimeout(timer);
        }
      },
    );
  }

  static succeed<A>(value: A) {
    return new Task(async () => Exit.ok(value));
  }

  static fail<E>(error: E) {
    return new Task(async () => Exit.err(error));
  }

  static die(cause?: unknown) {
    return new Task(async () => Exit.die(cause));
  }

  static never() {
    return new Task<never, never>(
      (signal) =>
        new Promise((resolve) => {
          const interval = setInterval(() => {}, 2 ** 31 - 1);
          signal.addEventListener('abort', () => {
            clearInterval(interval);
            resolve(Exit.die(signal.reason));
          });
        }),
    );
  }

  static sync<A>(thunk: () => A) {
    return new Task<A, never>(() => tryCatch(() => Exit.ok(thunk())));
  }

  static lazy<A, E>(thunk: () => Task<A, E>) {
    return new Task((signal) => tryCatch(() => thunk().run(signal)));
  }

  static attempt<A, E>(options: {
    try: () => A | PromiseLike<A>;
    catch: (error: unknown) => E;
  }) {
    return new Task<A, E>(async () => {
      try {
        return Exit.ok(await options.try());
      } catch (error) {
        return Exit.err(options.catch(error));
      }
    });
  }

  static gen<Eff extends Task<any, any>, T>(f: () => Generator<Eff, T, any>) {
    return new Task(
      async (
        signal,
      ): Promise<Exit<T, Eff extends Task<any, infer E> ? E : never>> => {
        const iterator = f();

        let state = iterator.next();

        while (!state.done) {
          const aborted = abortIfNeeded(signal);
          if (aborted) return aborted;

          const exit = await state.value.run(signal);

          if (Exit.isOk(exit)) {
            state = iterator.next(exit.value);
          } else {
            return exit;
          }
        }

        return Exit.ok(state.value);
      },
    );
  }

  [Symbol.iterator](): Generator<Task<A, E>, A, any> {
    const self = this;
    return (function* () {
      return (yield self) as A;
    })();
  }
}
