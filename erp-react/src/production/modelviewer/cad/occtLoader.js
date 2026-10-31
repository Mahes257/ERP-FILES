/**
 * occtLoader.js — main-thread client for the OCCT CAD worker (ported from the
 * Designing module).
 *
 * Owns a single CAD Worker instance per browser tab (created on demand, kept
 * warm across models, terminated on crash/timeout/unload) and matches
 * asynchronous responses to pending requests:
 *
 *   const { meshes, root } = await parseCadFile(uint8Array, 'step', {
 *     onProgress: (progress) => setParseProgress(progress),
 *   });
 *
 * Dedupe: identical payloads (same format + same bytes) fired concurrently
 * share one worker request (StrictMode / double-click safe).
 *
 * Timeout semantics (message-based): the timer is re-armed on EVERY worker
 * message. Stage-aware windows: 'wasm' 60 s, 'parse' 10 min (single
 * synchronous OCCT ReadFile — no mid-parse messages possible), 'build' 60 s.
 * On timeout the worker is TERMINATED so the next request gets a fresh one.
 */

import CadWorker from './occt.worker.js?worker';

const DEFAULT_WINDOW_MS = 60000;
const PARSE_WINDOW_MS = 900000;

let worker = null;
let nextRequestId = 1;
const pending = new Map();
const inFlight = new Map();

function payloadKey(format, uint8) {
  let hash = 0x811c9dc5;
  const step = Math.max(1, Math.floor(uint8.length / 4096));
  for (let i = 0; i < uint8.length; i += step) {
    hash ^= uint8[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${format}:${uint8.length}:${hash.toString(16)}`;
}

function terminateWorker() {
  if (!worker) return;
  try { worker.terminate(); } catch { /* already dead */ }
  worker = null;
}

function failAllPending(message) {
  pending.forEach((entry) => entry.reject(new Error(message)));
  pending.clear();
}

function ensureWorker() {
  if (worker) return worker;
  worker = new CadWorker();
  worker.onmessage = (event) => {
    const data = event.data || {};
    const entry = pending.get(data.requestId);
    if (!entry) return;

    if (data.type === 'stage' || data.type === 'build') {
      const progress = data.type === 'stage'
        ? { stage: data.stage, loaded: 0, total: 0 }
        : { stage: 'build', loaded: data.done, total: data.total };
      entry.armTimer(data.type === 'stage' ? data.stage : 'build');
      entry.subscribers.forEach((subscriber) => subscriber(progress));
      return;
    }

    entry.settle(true, data.result);
  };
  worker.onerror = (event) => {
    const message = event?.message || 'CAD worker crashed.';
    terminateWorker();
    failAllPending(message);
    inFlight.clear();
  };
  return worker;
}

function windowForStage(stage) {
  return stage === 'parse' ? PARSE_WINDOW_MS : DEFAULT_WINDOW_MS;
}

/**
 * Parse a STEP/IGES/BREP byte payload in the CAD worker.
 *
 * @param {Uint8Array} uint8 raw file bytes (transferred zero-copy)
 * @param {'step'|'iges'|'brep'} format OCCT importer format id
 * @param {{ inactivityTimeoutMs?: number, signal?: AbortSignal,
 *           onProgress?: (progress: { stage: string, loaded: number, total: number }) => void }} [options]
 * @returns {Promise<{ meshes: Array<object>, root: object }>}
 */
export function parseCadFile(uint8, format, options = {}) {
  const { inactivityTimeoutMs = DEFAULT_WINDOW_MS, signal, onProgress } = options;
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }

  const key = payloadKey(format, uint8);
  const existing = inFlight.get(key);
  if (existing) {
    if (onProgress) existing.subscribers.add(onProgress);
    signal?.addEventListener('abort', () => {
      if (onProgress) existing.subscribers.delete(onProgress);
    }, { once: true });
    return existing.promise;
  }

  const target = ensureWorker();
  const requestId = nextRequestId;
  nextRequestId += 1;

  let resolveShared;
  let rejectShared;
  let timer;
  let stage = 'wasm';
  const subscribers = new Set();
  if (onProgress) subscribers.add(onProgress);

  const promise = new Promise((res, rej) => { resolveShared = res; rejectShared = rej; });
  const shared = { promise, subscribers };
  inFlight.set(key, shared);

  const finish = () => { inFlight.delete(key); };
  promise.then(finish, finish);

  const armTimer = (stageName) => {
    if (stageName) stage = stageName;
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending.delete(requestId);
      terminateWorker();
      failAllPending('CAD parsing stalled — the worker stopped responding. Please retry.');
      inFlight.clear();
    }, inactivityTimeoutMs === DEFAULT_WINDOW_MS ? windowForStage(stage) : inactivityTimeoutMs);
  };

  const settle = (ok, value) => {
    clearTimeout(timer);
    pending.delete(requestId);
    if (ok) resolveShared(value);
    else rejectShared(value instanceof Error ? value : new Error(value || 'CAD parsing failed.'));
  };

  pending.set(requestId, {
    settle,
    armTimer,
    subscribers,
    reject: (error) => settle(false, error),
  });
  signal?.addEventListener('abort', () => {
    subscribers.delete(onProgress);
  }, { once: true });

  armTimer('wasm');

  // Transfer the file bytes zero-copy (copy first for subarray views).
  let payload = uint8;
  let transfer = [uint8.buffer];
  if (uint8.byteOffset !== 0 || uint8.byteLength !== uint8.buffer.byteLength) {
    payload = uint8.slice();
    transfer = [payload.buffer];
  }
  target.postMessage({ requestId, format, buffer: payload }, transfer);
  return promise;
}

/** Terminate the CAD worker (page unload / hard reset). */
export function disposeCadWorker() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  holders = 0;
  terminateWorker();
  failAllPending('CAD worker disposed.');
  inFlight.clear();
}

// ---- Worker lifetime management -------------------------------------------
// React StrictMode mounts → unmounts → remounts effects once; terminating the
// worker in effect cleanup would kill a parse the remount is about to reuse.
// The viewer RETAINS the worker while a load is active and RELEASES it on
// cleanup; termination happens only after an idle grace period.

let holders = 0;
let idleTimer = null;
const IDLE_TERMINATION_MS = 30000;

/** Keep the (possibly warm) worker alive while the viewer can still use it. */
export function retainCadWorker() {
  holders += 1;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

/** Release one holder; schedule termination after the idle grace period. */
export function releaseCadWorker() {
  holders = Math.max(0, holders - 1);
  if (holders > 0 || idleTimer) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (holders === 0 && pending.size === 0) {
      terminateWorker();
    }
  }, IDLE_TERMINATION_MS);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', disposeCadWorker);
}
