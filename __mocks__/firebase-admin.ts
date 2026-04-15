import { GeoPoint, Timestamp } from 'firebase-admin/firestore';

export class DocumentReference {
  constructor(public readonly path: string) {}
}

export { GeoPoint, Timestamp };

export default {
  firestore: { Timestamp, GeoPoint, DocumentReference },
};
