import admin from 'firebase-admin';
import {
  FieldPath,
  OrderByDirection,
  WhereFilterOp,
} from 'firebase-admin/firestore';

import { normalizeValue } from '../../normalize';

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
