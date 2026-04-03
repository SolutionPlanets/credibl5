const DB_VERSION = 1;
const STORE_NAME = "reviews";

export interface StoredReview {
  gmb_review_id: string;
  location_id: string;
  reviewer_name: string | null;
  reviewer_profile_photo_url: string | null;
  star_rating: number | null;
  review_text: string | null;
  review_date: string | null;
  sentiment: string | null;
  review_reply: string | null;
  is_read: boolean;
  synced_at: string | null;
}

function dbName(userId: string): string {
  return `crd5_reviews_${userId}`;
}

function openDB(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName(userId), DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "gmb_review_id" });
        store.createIndex("by_location", "location_id", { unique: false });
        store.createIndex("by_date", "review_date", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Upsert a batch of reviews into IndexedDB.
 * Existing reviews with the same gmb_review_id are overwritten.
 */
export async function storeReviews(userId: string, reviews: StoredReview[]): Promise<void> {
  if (reviews.length === 0) return;
  const db = await openDB(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    for (const review of reviews) {
      store.put(review);
    }
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Read all reviews for the given locationIds, sorted by review_date descending.
 */
export async function getReviewsByLocations(
  userId: string,
  locationIds: string[]
): Promise<StoredReview[]> {
  if (locationIds.length === 0) return [];
  const db = await openDB(userId);
  const idSet = new Set(locationIds);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const results: StoredReview[] = [];
    const request = store.openCursor();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        const review = cursor.value as StoredReview;
        if (idSet.has(review.location_id)) {
          results.push(review);
        }
        cursor.continue();
      } else {
        db.close();
        results.sort((a, b) => {
          const da = a.review_date ? new Date(a.review_date).getTime() : 0;
          const db_ = b.review_date ? new Date(b.review_date).getTime() : 0;
          return db_ - da;
        });
        resolve(results);
      }
    };

    request.onerror = () => { db.close(); reject(request.error); };
  });
}

/**
 * Update the reply text and mark is_read=true for a single review.
 */
export async function updateReviewReply(
  userId: string,
  gmbReviewId: string,
  reply: string
): Promise<void> {
  const db = await openDB(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(gmbReviewId);

    getReq.onsuccess = () => {
      const review = getReq.result as StoredReview | undefined;
      if (review) {
        review.review_reply = reply;
        review.is_read = true;
        store.put(review);
      }
    };

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Batch-update reply text and mark is_read=true for multiple reviews in a single transaction.
 */
export async function updateReviewRepliesBatch(
  userId: string,
  updates: Array<{ gmbReviewId: string; reply: string }>
): Promise<void> {
  if (updates.length === 0) return;
  const db = await openDB(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    for (const { gmbReviewId, reply } of updates) {
      const getReq = store.get(gmbReviewId);
      getReq.onsuccess = () => {
        const review = getReq.result as StoredReview | undefined;
        if (review) {
          review.review_reply = reply;
          review.is_read = true;
          store.put(review);
        }
      };
    }

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Delete all reviews for a specific location, then store fresh ones in a single transaction.
 * This ensures deleted reviews on Google don't persist locally.
 */
export async function replaceReviewsForLocation(
  userId: string,
  locationId: string,
  freshReviews: StoredReview[]
): Promise<void> {
  const db = await openDB(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("by_location");
    const range = IDBKeyRange.only(locationId);
    const cursorReq = index.openCursor(range);

    cursorReq.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        // All old reviews deleted — now insert fresh ones
        for (const review of freshReviews) {
          store.put(review);
        }
      }
    };

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Delete all reviews for a user (e.g., after sign-out or explicit reset).
 */
export async function clearUserReviews(userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const deleteReq = indexedDB.deleteDatabase(dbName(userId));
    deleteReq.onsuccess = () => resolve();
    deleteReq.onerror = () => reject(deleteReq.error);
  });
}
