import { Data, Effect } from 'effect';
import micromatch from 'micromatch';
import { ConfigService } from '../config';

export class AccessDeniedError extends Data.TaggedError('AccessDeniedError')<{
  readonly path: string;
}> {}

export const isAllowed = (
  path: string,
  rules: { allow: readonly string[]; deny: readonly string[] },
): boolean => {
  if (micromatch.isMatch(path, [...rules.deny])) return false;
  if (micromatch.isMatch(path, [...rules.allow])) return true;
  return false;
};

export class AccessService extends Effect.Service<AccessService>()(
  'AccessService',
  {
    accessors: true,
    effect: Effect.gen(function* () {
      const { config } = yield* ConfigService;
      const rules = config.firestore.rules;

      return {
        check: (path: string) =>
          isAllowed(path, rules)
            ? Effect.void
            : Effect.fail(new AccessDeniedError({ path })),
      };
    }),
  },
) {}
