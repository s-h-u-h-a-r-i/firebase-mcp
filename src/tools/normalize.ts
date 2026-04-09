import admin from 'firebase-admin';

export const normalizeValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof admin.firestore.GeoPoint) {
    return { latitude: value.latitude, longitude: value.longitude };
  }
  if (value instanceof admin.firestore.DocumentReference) return value.path;
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (
      typeof obj['_seconds'] === 'number' &&
      typeof obj['_nanoseconds'] === 'number' &&
      Object.keys(obj).length === 2
    ) {
      return new Date(
        obj['_seconds'] * 1000 + obj['_nanoseconds'] / 1e6,
      ).toISOString();
    }
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]): [string, unknown] => [
        k,
        normalizeValue(v),
      ]),
    );
  }
  return value;
};
