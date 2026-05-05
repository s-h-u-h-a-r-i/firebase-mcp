import { QueryFilter, QueryOrderBy } from './types';

export const buildIndexErrorHint = (cause: unknown): string => {
  const raw = cause instanceof Error ? cause.message : String(cause);
  if (!raw.includes('FAILED_PRECONDITION')) return '';
  const consoleUrl = raw.match(/https:\/\/console\.firebase\.google\.com\S+/)?.[0];
  return [
    ' The query requires a composite index that does not exist.',
    consoleUrl ? ` Create it here: ${consoleUrl}` : '',
    ' Alternatively, call list_indexes to see existing indexes and adjust filters/orderBy to match one.',
  ].join('');
};

export const applyQueryConstraints = (
  query: FirebaseFirestore.Query,
  input: {
    select?: string[];
    filters?: QueryFilter[];
    orderBy?: QueryOrderBy[];
    cursorSnap?: FirebaseFirestore.DocumentSnapshot | null;
    limit: number;
  },
): FirebaseFirestore.Query => {
  if (input.select?.length) {
    query = query.select(...input.select);
  }
  for (const filter of input.filters ?? []) {
    query = query.where(filter.field, filter.operator, filter.value);
  }
  for (const order of input.orderBy ?? []) {
    query = query.orderBy(order.field, order.direction ?? 'asc');
  }
  if (input.cursorSnap) {
    query = query.startAfter(input.cursorSnap);
  }
  return query.limit(input.limit);
};
