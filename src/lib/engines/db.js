// ATMOS-VIGIL — IndexedDB offline expedition ledger + sync queue.
// All records persist locally so the app is 100% functional offline.
// A real cloud sync is optional and driven from the Vault module.

const DB_NAME = 'atmosvigil-expedition';
const DB_VERSION = 1;
const STORE = 'expedition_ledger';

function openDb() {
	return new Promise((resolve, reject) => {
		if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
		const req = window.indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE)) {
				const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
				store.createIndex('by_ts', 'ts');
				store.createIndex('by_type', 'type');
				store.createIndex('by_sync', 'syncStatus');
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function saveEntry(type, payload, opts = {}) {
	try {
		const db = await openDb();
		const entry = {
			id: crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			ts: Date.now(),
			type, // 'lightning' | 'barograph' | 'alert' | 'wind' | 'wbgt'
			payload,
			syncStatus: 'pending', // 'pending' | 'synced' | 'error'
			...opts
		};
		return await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			const store = tx.objectStore(STORE);
			const req = store.put(entry);
			req.onsuccess = () => resolve({ ...entry, id: req.result ?? entry.id });
			req.onerror = () => reject(req.error);
		});
	} catch (err) {
		console.warn('[db] saveEntry failed:', err);
		return null;
	}
}

export async function listEntries(limit = 200, type = null) {
	try {
		const db = await openDb();
		return await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, 'readonly');
			const store = tx.objectStore(STORE);
			const req = type ? store.index('by_type').getAll(type) : store.index('by_ts').getAll();
			req.onsuccess = () => {
				let rows = req.result ?? [];
				rows.sort((a, b) => b.ts - a.ts);
				resolve(rows.slice(0, limit));
			};
			req.onerror = () => reject(req.error);
		});
	} catch (err) {
		console.warn('[db] listEntries failed:', err);
		return [];
	}
}

export async function countEntries() {
	try {
		const db = await openDb();
		return await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, 'readonly');
			const store = tx.objectStore(STORE);
			const req = store.count();
			req.onsuccess = () => resolve(req.result ?? 0);
			req.onerror = () => reject(req.error);
		});
	} catch {
		return 0;
	}
}

export async function countPending() {
	try {
		const db = await openDb();
		return await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, 'readonly');
			const store = tx.objectStore(STORE);
			const req = store.index('by_sync').getAll('pending');
			req.onsuccess = () => resolve((req.result ?? []).length);
			req.onerror = () => reject(req.error);
		});
	} catch {
		return 0;
	}
}

export async function markSynced(ids) {
	try {
		const db = await openDb();
		return await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			const store = tx.objectStore(STORE);
			let done = 0;
			for (const id of ids) {
				const get = store.get(id);
				get.onsuccess = () => {
					const row = get.result;
					if (row) {
						row.syncStatus = 'synced';
						store.put(row);
					}
					if (++done === ids.length) resolve(true);
				};
			}
			if (ids.length === 0) resolve(true);
			tx.onerror = () => reject(tx.error);
		});
	} catch {
		return false;
	}
}

export async function clearAll() {
	try {
		const db = await openDb();
		return await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			const store = tx.objectStore(STORE);
			const req = store.clear();
			req.onsuccess = () => resolve(true);
			req.onerror = () => reject(req.error);
		});
	} catch {
		return false;
	}
}

// Supabase cloud sync — only when the admin configures URL + anon key.
export function readSyncConfig() {
	try {
		return {
			url: localStorage.getItem('atmosvigil.syncUrl') ?? '',
			key: localStorage.getItem('atmosvigil.syncKey') ?? ''
		};
	} catch {
		return { url: '', key: '' };
	}
}

export function writeSyncConfig(url, key) {
	try {
		localStorage.setItem('atmosvigil.syncUrl', url.trim());
		localStorage.setItem('atmosvigil.syncKey', key.trim());
	} catch { /* noop */ }
}

export function clearSyncConfig() {
	try {
		localStorage.removeItem('atmosvigil.syncUrl');
		localStorage.removeItem('atmosvigil.syncKey');
	} catch { /* noop */ }
}

export async function syncPending() {
	const cfg = readSyncConfig();
	if (!cfg.url || !cfg.key) {
		return { ok: false, reason: 'sync not configured — add Supabase URL + anon key in the Vault', pending: await countPending() };
	}
	const pending = await listEntries(500, null);
	const toSync = pending.filter((e) => e.syncStatus === 'pending');
	if (toSync.length === 0) return { ok: true, reason: 'in sync', pending: 0, synced: 0 };
	const base = cfg.url.replace(/\/$/, '');
	const rows = toSync.map((e) => ({
		id: e.id,
		ts: new Date(e.ts).toISOString(),
		type: e.type,
		payload: e.payload,
		sync_status: 'synced'
	}));
	try {
		const res = await fetch(`${base}/rest/v1/expedition_log`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'apikey': cfg.key,
				'Authorization': `Bearer ${cfg.key}`,
				'Prefer': 'return=minimal'
			},
			body: JSON.stringify(rows)
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		await markSynced(toSync.map((e) => e.id));
		return { ok: true, reason: 'synced', pending: 0, synced: toSync.length };
	} catch (err) {
		return { ok: false, reason: `sync failed: ${err.message}`, pending: toSync.length, synced: 0 };
	}
}

export function toCsv(entries) {
	const head = 'id,ts,type,payload\n';
	const rows = entries.map((e) => {
		const safe = JSON.stringify(e.payload ?? {}).replace(/"/g, '""');
		return `"${e.id}","${new Date(e.ts).toISOString()}","${e.type}","${safe}"`;
	});
	return head + rows.join('\n');
}

export function toJson(entries) {
	return JSON.stringify(entries, null, 2);
}

export function downloadFile(filename, content, mime) {
	const blob = new Blob([content], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 5000);
}
