import admin from 'firebase-admin';
import {
  FieldPath,
  OrderByDirection,
  WhereFilterOp,
} from 'firebase-admin/firestore';

import { normalizeValue } from '../normalize';

export const VALID_OPERATORS: WhereFilterOp[] = [
  '<',
  '<=',
  '==',
  '!=',
  '>=',
  '>',
  'array-contains',
  'array-contains-any',
  'in',
  'not-in',
];

export const FILTER_SCHEMA_ITEM = {
  type: 'object',
  properties: {
    field: { type: 'string', description: 'Field name to filter on' },
    operator: {
      type: 'string',
      enum: VALID_OPERATORS,
      description: 'Comparison operator',
    },
    value: {
      description:
        'Value to compare against (string, number, boolean, null, or array for in/array-contains-any/not-in)',
    },
  },
  required: ['field', 'operator', 'value'],
} as const;

export const ORDER_BY_SCHEMA_ITEM = {
  type: 'object',
  properties: {
    field: { type: 'string', description: 'Field to order by' },
    direction: {
      type: 'string',
      enum: ['asc', 'desc'],
      description: "Sort direction (default: 'asc')",
    },
  },
  required: ['field'],
} as const;

export interface QueryFilter {
  field: string | FieldPath;
  operator: WhereFilterOp;
  value: unknown;
}

export interface QueryOrderBy {
  field: string;
  direction?: OrderByDirection;
}

export const normalizeDocument = (
  doc: admin.firestore.QueryDocumentSnapshot | admin.firestore.DocumentSnapshot,
) => ({
  id: doc.id,
  path: doc.ref.path,
  data: normalizeValue(doc.data()),
});
