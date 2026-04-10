export function segmentCount(path: string): number {
  return path.split('/').filter(Boolean).length;
}

/**
 * Returns an error message if `path` is not a valid collection path
 * (collection paths have an odd number of segments: "users", "users/123/posts").
 * Returns null if the path is valid.
 */
export function collectionPathError(path: string): string | null {
  const n = segmentCount(path);
  if (n % 2 === 0) {
    return (
      `"${path}" has ${n} path segments, which makes it a document path. ` +
      `A collection path must have an odd number of segments ` +
      `(e.g. "users" or "users/123/posts"). ` +
      `Did you mean to use get_document or list_collections instead?`
    );
  }
  return null;
}

/**
 * Returns an error message if `path` is not a valid document path
 * (document paths have an even number of segments: "users/123", "stores/ABC/orders/456").
 * Returns null if the path is valid.
 */
export function documentPathError(path: string): string | null {
  const n = segmentCount(path);
  if (n % 2 !== 0) {
    return (
      `"${path}" has ${n} path segments, which makes it a collection path. ` +
      `A document path must have an even number of segments ` +
      `(e.g. "users/123" or "stores/ABC/orders/456"). ` +
      `Did you mean to use list_documents or read_collection instead?`
    );
  }
  return null;
}
