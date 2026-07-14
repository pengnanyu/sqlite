const KV_NAMESPACE = process.env.KV_NAMESPACE || 'sqlite-db';

class KVStore {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    const val = this.store.get(key);
    if (val === undefined) return null;
    return val;
  }

  async getBuffer(key) {
    const val = this.store.get(key);
    if (val === undefined) return null;
    if (Buffer.isBuffer(val)) return val;
    return Buffer.from(val);
  }

  async put(key, value) {
    if (typeof value === 'string') {
      this.store.set(key, value);
    } else if (Buffer.isBuffer(value)) {
      this.store.set(key, value);
    } else {
      this.store.set(key, JSON.stringify(value));
    }
    return true;
  }

  async delete(key) {
    return this.store.delete(key);
  }

  async list(prefix = '') {
    const keys = [];
    for (const key of this.store.keys()) {
      if (prefix === '' || key.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }
}

let kvInstance = null;

function getKV() {
  if (!kvInstance) {
    kvInstance = new KVStore();
  }
  return kvInstance;
}

module.exports = { getKV, KV_NAMESPACE };