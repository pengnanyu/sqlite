const DB_STORE = 'sqlite_online_dbs';

function getStore() {
  const raw = localStorage.getItem(DB_STORE);
  return raw ? JSON.parse(raw) : {};
}

function setStore(store) {
  localStorage.setItem(DB_STORE, JSON.stringify(store));
}

const KV = {
  get(key) {
    const store = getStore();
    return store[key] || null;
  },
  put(key, value) {
    const store = getStore();
    store[key] = value;
    setStore(store);
  },
  delete(key) {
    const store = getStore();
    delete store[key];
    setStore(store);
  },
  list(prefix = '') {
    const store = getStore();
    return Object.keys(store).filter(k => prefix === '' || k.startsWith(prefix));
  }
};

const IDB = {
  db: null,
  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('sqlite_online_kv', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv', { keyPath: 'key' });
        }
      };
      req.onsuccess = (e) => { IDB.db = e.target.result; resolve(); };
      req.onerror = (e) => reject(e);
    });
  },
  async get(key) {
    return new Promise((resolve, reject) => {
      const tx = IDB.db.transaction('kv', 'readonly');
      const store = tx.objectStore('kv');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result?.value || null);
      req.onerror = () => reject(req.error);
    });
  },
  async put(key, value) {
    return new Promise((resolve, reject) => {
      const tx = IDB.db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      store.put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async delete(key) {
    return new Promise((resolve, reject) => {
      const tx = IDB.db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async list(prefix = '') {
    return new Promise((resolve, reject) => {
      const tx = IDB.db.transaction('kv', 'readonly');
      const store = tx.objectStore('kv');
      const req = store.getAllKeys();
      req.onsuccess = () => {
        const keys = req.result.filter(k => prefix === '' || k.startsWith(prefix));
        resolve(keys);
      };
      req.onerror = () => reject(req.error);
    });
  }
};