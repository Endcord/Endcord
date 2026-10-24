/*
 * Endcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Local message index in the browser's IndexedDB. Nothing here ever leaves the device.

export interface IndexedMessage {
    id: string;
    /** channel id */
    ch: string;
    /** guild id, null for direct messages */
    g: string | null;
    /** author id */
    a: string;
    /** author display name at the time */
    an: string;
    /** content, trimmed */
    c: string;
    /** timestamp, ms */
    ts: number;
    /** id of the message this one replies to */
    r: string | null;
    /** number of attachments */
    at: number;
}

export interface SavedMessage extends IndexedMessage {
    collection: string;
    tags: string[];
    savedAt: number;
}

export interface SearchQuery {
    text?: string;
    /** user id, or part of a display name */
    author?: string;
    channelId?: string;
    guildId?: string | null;
    dmsOnly?: boolean;
    replyTo?: string;
    from?: number;
    to?: number;
    limit?: number;
}

const DB_NAME = "EndcordMessageVault";
const MESSAGES = "messages";
const SAVED = "saved";
const MAX_SCAN = 400_000;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
    return dbPromise ??= new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            const messages = db.createObjectStore(MESSAGES, { keyPath: "id" });
            messages.createIndex("ts", "ts");
            messages.createIndex("channel", ["ch", "ts"]);
            messages.createIndex("author", ["a", "ts"]);
            messages.createIndex("reply", "r");
            db.createObjectStore(SAVED, { keyPath: "id" }).createIndex("savedAt", "savedAt");
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { dbPromise = null; reject(req.error); };
    });
}

const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
});

const request = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
});

export async function putMessages(messages: IndexedMessage[]) {
    if (!messages.length) return;
    const db = await open();
    const tx = db.transaction(MESSAGES, "readwrite");
    const store = tx.objectStore(MESSAGES);
    for (const m of messages) store.put(m);
    await done(tx);
}

export async function updateContent(id: string, content: string) {
    const db = await open();
    const tx = db.transaction(MESSAGES, "readwrite");
    const store = tx.objectStore(MESSAGES);
    const existing = await request(store.get(id)) as IndexedMessage | undefined;
    if (existing) store.put({ ...existing, c: content });
    await done(tx);
}

export async function deleteMessages(ids: string[]) {
    if (!ids.length) return;
    const db = await open();
    const tx = db.transaction(MESSAGES, "readwrite");
    const store = tx.objectStore(MESSAGES);
    for (const id of ids) store.delete(id);
    await done(tx);
}

export async function countMessages() {
    const db = await open();
    return request(db.transaction(MESSAGES).objectStore(MESSAGES).count());
}

/** Keeps the newest `max` messages */
export async function prune(max: number) {
    const db = await open();
    const total = await countMessages();
    let excess = total - max;
    if (excess <= 0) return 0;
    const removed = excess;
    const tx = db.transaction(MESSAGES, "readwrite");
    const cursorReq = tx.objectStore(MESSAGES).index("ts").openCursor();
    cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || excess-- <= 0) return;
        cursor.delete();
        cursor.continue();
    };
    await done(tx);
    return removed;
}

export async function clearMessages() {
    const db = await open();
    const tx = db.transaction(MESSAGES, "readwrite");
    tx.objectStore(MESSAGES).clear();
    await done(tx);
}

const isId = (s: string) => /^\d{17,20}$/.test(s);

/** Newest first. Uses the narrowest index the query allows, then filters the rest in memory. */
export async function search(q: SearchQuery): Promise<{ results: IndexedMessage[]; scanned: number; }> {
    const db = await open();
    const store = db.transaction(MESSAGES).objectStore(MESSAGES);
    const from = q.from ?? 0, to = q.to ?? Number.MAX_SAFE_INTEGER;
    const limit = q.limit ?? 300;
    const author = q.author?.trim().replace(/^<@!?(\d+)>$/, "$1").toLowerCase();
    const authorId = author && isId(author) ? author : null;
    const terms = (q.text ?? "").toLowerCase().split(/\s+/).filter(Boolean);

    let source: IDBRequest<IDBCursorWithValue | null>;
    if (q.replyTo) source = store.index("reply").openCursor(IDBKeyRange.only(q.replyTo));
    else if (q.channelId) source = store.index("channel").openCursor(IDBKeyRange.bound([q.channelId, from], [q.channelId, to]), "prev");
    else if (authorId) source = store.index("author").openCursor(IDBKeyRange.bound([authorId, from], [authorId, to]), "prev");
    else source = store.index("ts").openCursor(IDBKeyRange.bound(from, to), "prev");

    const matches = (m: IndexedMessage) => {
        if (m.ts < from || m.ts > to) return false;
        if (q.dmsOnly && m.g) return false;
        if (q.guildId !== undefined && !q.dmsOnly && m.g !== q.guildId) return false;
        if (author && !authorId && !m.an.toLowerCase().includes(author)) return false;
        if (terms.length) {
            const text = m.c.toLowerCase();
            for (const term of terms) if (!text.includes(term)) return false;
        }
        return true;
    };

    const results: IndexedMessage[] = [];
    let scanned = 0;
    await new Promise<void>((resolve, reject) => {
        source.onerror = () => reject(source.error);
        source.onsuccess = () => {
            const cursor = source.result;
            if (!cursor || results.length >= limit || scanned >= MAX_SCAN) return resolve();
            scanned++;
            if (matches(cursor.value)) results.push(cursor.value);
            cursor.continue();
        };
    });
    // The reply index is unordered
    if (q.replyTo) results.sort((a, b) => a.ts - b.ts);
    return { results, scanned };
}

export async function countReplies(ids: string[]) {
    const db = await open();
    const index = db.transaction(MESSAGES).objectStore(MESSAGES).index("reply");
    const counts = await Promise.all(ids.map(id => request(index.count(IDBKeyRange.only(id)))));
    return new Map(ids.map((id, i) => [id, counts[i]]));
}

// ---- saved messages ----

export async function saveMessage(m: SavedMessage) {
    const db = await open();
    const tx = db.transaction(SAVED, "readwrite");
    tx.objectStore(SAVED).put(m);
    await done(tx);
}

export async function removeSaved(id: string) {
    const db = await open();
    const tx = db.transaction(SAVED, "readwrite");
    tx.objectStore(SAVED).delete(id);
    await done(tx);
}

export async function getSaved(): Promise<SavedMessage[]> {
    const db = await open();
    const all = await request(db.transaction(SAVED).objectStore(SAVED).getAll()) as SavedMessage[];
    return all.sort((a, b) => b.savedAt - a.savedAt);
}
