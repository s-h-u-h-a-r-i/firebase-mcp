import { Tool } from '@modelcontextprotocol/sdk/types.js';
import admin from 'firebase-admin';

import type { ProjectContext } from '../../../project';
import { Task } from '../../../task';
import { collectionPathError } from '../utils/paths';

export class FirestoreSchemaError extends Error {
  readonly _tag = 'FirestoreSchemaError' as const;
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FirestoreSchemaError';
  }
}

export const GET_COLLECTION_SCHEMA = 'get_collection_schema' as const;

export interface GetCollectionSchemaArgs {
  collection: string;
  sampleSize?: number;
}

export interface FieldSchema {
  types: string[];
  coverage: string;
}

const inferType = (value: unknown): string => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'float';
  }
  if (value instanceof admin.firestore.Timestamp) return 'timestamp';
  if (value instanceof admin.firestore.GeoPoint) return 'geopoint';
  if (value instanceof admin.firestore.DocumentReference) return 'reference';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'array<unknown>';
    const itemTypes = [...new Set(value.map(inferType))];
    return `array<${itemTypes.join(' | ')}>`;
  }
  if (typeof value === 'object') return 'map';
  return 'unknown';
};

export const getCollectionSchemaDefinition: Tool = {
  name: GET_COLLECTION_SCHEMA,
  description:
    'Infer the schema of a Firestore collection by sampling documents. Returns field names, inferred types (integer, float, string, boolean, timestamp, geopoint, reference, array, map), and coverage (how many sampled docs contained each field). Coverage of 10/10 does not guarantee a field is always present — documents may have different fields depending on their state or lifecycle stage.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description:
          "Collection path, e.g. 'users' or 'shared/stores_data/ABC/data/stock'",
      },
      sampleSize: {
        type: 'number',
        description:
          'Total number of documents to sample (default: 20). Split evenly between the start and end of the collection for varied coverage.',
      },
      projectId: {
        type: 'string',
        description: 'Project key as defined in firebase-mcp.json',
      },
    },
    required: ['collection', 'projectId'],
  },
};

export const getCollectionSchema = (
  ctx: ProjectContext,
  input: GetCollectionSchemaArgs,
) =>
  Task.gen(function* () {
    const err = collectionPathError(input.collection);
    if (err) {
      return yield* Task.fail(new FirestoreSchemaError(err));
    }
    yield* ctx.checkAccess(input.collection);

    const db = ctx.firestore();
    const total = input.sampleSize ?? 20;
    const half = Math.ceil(total / 2);

    const fromStart = yield* Task.attempt({
      try: () => db.collection(input.collection).limit(half).get(),
      catch: (cause) =>
        new FirestoreSchemaError(
          `Failed to sample collection: ${input.collection}`,
          cause,
        ),
    });

    // Attempt to sample from the end for better coverage.
    // Falls back gracefully if a composite index is not available.
    const fromEnd = yield* Task.attempt({
      try: () =>
        db
          .collection(input.collection)
          .orderBy(admin.firestore.FieldPath.documentId(), 'desc')
          .limit(total - half)
          .get()
          .catch(() => null),
      catch: (cause) =>
        new FirestoreSchemaError(
          `Failed to sample collection from end: ${input.collection}`,
          cause,
        ),
    });

    // Deduplicate by document ID
    const seen = new Set<string>();
    const docs: Record<string, unknown>[] = [];
    const snaps = fromEnd ? [fromStart, fromEnd] : [fromStart];

    for (const snap of snaps) {
      for (const doc of snap.docs) {
        if (!seen.has(doc.id)) {
          seen.add(doc.id);
          const data = doc.data();
          if (data) docs.push(data);
        }
      }
    }

    const sampleStrategy = fromEnd
      ? `${half} from start + ${total - half} from end (deduplicated)`
      : `${half} from start only (descending index unavailable)`;

    const totalSampled = docs.length;

    const fieldTypes = new Map<string, Set<string>>();
    const fieldCount = new Map<string, number>();

    for (const doc of docs) {
      for (const [key, value] of Object.entries(doc)) {
        const type = inferType(value);
        if (!fieldTypes.has(key)) fieldTypes.set(key, new Set());
        fieldTypes.get(key)!.add(type);
        fieldCount.set(key, (fieldCount.get(key) ?? 0) + 1);
      }
    }

    const fields: Record<string, FieldSchema> = {};
    for (const [field, types] of fieldTypes.entries()) {
      const count = fieldCount.get(field) ?? 0;
      fields[field] = {
        types: [...types],
        coverage: `${count}/${totalSampled} sampled`,
      };
    }

    return {
      collection: input.collection,
      totalSampled,
      sampleStrategy,
      fields,
    };
  });
