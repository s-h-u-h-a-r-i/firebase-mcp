import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Data, Effect } from 'effect';
import admin from 'firebase-admin';

import { AccessService } from '../../access';
import { FirebaseService } from '../../firebase';

export class FirestoreSchemaError extends Data.TaggedError(
  'FirestoreSchemaError',
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const GET_COLLECTION_SCHEMA = 'get_collection_schema' as const;

export interface GetCollectionSchemaArgs {
  collection: string;
  sampleSize?: number;
}

interface FieldSchema {
  types: string[];
  optional: boolean;
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
    'Infer the schema of a Firestore collection by sampling documents from both ends of the collection. Returns field names, types (integer, float, string, boolean, timestamp, etc.), and whether each field is optional.',
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
    },
    required: ['collection'],
  },
};

export const getCollectionSchema = (input: GetCollectionSchemaArgs) =>
  Effect.gen(function* () {
    const access = yield* AccessService;
    yield* access.check(input.collection);

    const { firestore } = yield* FirebaseService;

    const total = input.sampleSize ?? 20;
    const half = Math.ceil(total / 2);

    const [fromStart, fromEnd] = yield* Effect.tryPromise({
      try: () =>
        Promise.all([
          firestore()
            .collection(input.collection)
            .orderBy(admin.firestore.FieldPath.documentId(), 'asc')
            .limit(half)
            .get(),
          firestore()
            .collection(input.collection)
            .orderBy(admin.firestore.FieldPath.documentId(), 'desc')
            .limit(half)
            .get(),
        ]),
      catch: (cause) =>
        new FirestoreSchemaError({
          message: `Failed to sample collection: ${input.collection}`,
          cause,
        }),
    });

    // Deduplicate by document ID
    const seen = new Set<string>();
    const docs: Record<string, unknown>[] = [];

    for (const snap of [fromStart, fromEnd]) {
      for (const doc of snap.docs) {
        if (!seen.has(doc.id)) {
          seen.add(doc.id);
          const data = doc.data();
          if (data) docs.push(data);
        }
      }
    }

    const totalSampled = docs.length;

    // Build schema: track types seen and presence count per field
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
      fields[field] = {
        types: [...types],
        optional: (fieldCount.get(field) ?? 0) < totalSampled,
      };
    }

    return {
      collection: input.collection,
      totalSampled,
      sampleStrategy: `${half} from start + ${total - half} from end (deduplicated)`,
      fields,
    };
  });
