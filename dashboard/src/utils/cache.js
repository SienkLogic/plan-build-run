/**
 * Simple TTL (Time-To-Live) cache backed by a Map.
 *
 * Each entry stores { value, expiry } where expiry is a Unix-ms timestamp.
 */
export class TTLCache {
  /**
   * @param {number} [defaultTTL=60000] - Default time-to-live in milliseconds
   */
  constructor(defaultTTL = 60_000) {
    this._store = new Map();
    this._defaultTTL = defaultTTL;
  }

  /**
   * Retrieve a cached value. Returns undefined if missing or expired.
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this._store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * Store a value with an optional per-key TTL.
   * @param {string} key
   * @param {*} value
   * @param {number} [ttlMs] - Override default TTL for this entry
   */
  set(key, value, ttlMs) {
    const ttl = ttlMs ?? this._defaultTTL;
    this._store.set(key, { value, expiry: Date.now() + ttl });
  }

  /**
   * Remove a single key from the cache.
   * @param {string} key
   */
  invalidate(key) {
    this._store.delete(key);
  }

  /**
   * Clear the entire cache.
   */
  invalidateAll() {
    this._store.clear();
  }
}
