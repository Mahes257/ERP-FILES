/**
 * purchase/services/platform/contracts.js
 * ------------------------------------------------------------------
 * Platform interface contracts for the Purchase module.
 *
 * PURPOSE
 * ------------------------------------------------------------------
 * The Purchase module today runs entirely on localStorage-backed mock
 * services (services/base.js). This file defines the INTERFACE each
 * cross-cutting concern must expose so a real backend (Spring Boot /
 * Postgres / object storage / real file store) can later be plugged in
 * WITHOUT changing any business service or UI component.
 *
 * LAYERING
 * ------------------------------------------------------------------
 *   UI (pages/components)
 *     → Business Services (purchase/services/*.js — the domain logic)
 *     → API / Repository (purchase/services/api/*.js REST modules;
 *                         purchase/services/platform/*.js contracts)
 *     → Persistence (localStorage today; real DB behind the
 *                    PersistenceContract later)
 *
 * Every business operation must go through a service facade. The
 * facades delegate through `withFallback(apiCall, mockCall)`
 * (services/api-client.js): in "local" mode the mock implementation
 * runs; in "api" mode the real REST endpoint is called first and the
 * mock is used only as a network-error fallback. Local and API modes
 * therefore always follow the same business contracts.
 *
 * SWAPPING THE BACKEND
 * ------------------------------------------------------------------
 * A real backend provides one adapter per contract (the methods below)
 * and registers it:
 *
 *   import { createPlatform } from './contracts';
 *   import { authAdapter, authorizationAdapter, ... } from './backendAdapters';
 *   export const platform = createPlatform({
 *     auth, authorization, transactions, concurrency,
 *     persistence, fileStorage, audit
 *   });
 *
 * `createPlatform` validates at startup that every adapter implements
 * every required method, so a partially-migrated backend fails loudly
 * instead of silently degrading. The local adapters (platform/local.js)
 * implement the same contracts and are the reference implementation.
 * ------------------------------------------------------------------
 */

/**
 * Defines a named contract from its required method names.
 * Adapters must implement ALL of them.
 */
export function createContract(name, methodNames) {
  return Object.freeze({
    name,
    methodNames: Object.freeze([...methodNames])
  });
}

/** Asserts an adapter implements every method of a contract. */
export function assertImplements(contract, adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new Error(`Adapter for "${contract.name}" must be an object`);
  }
  for (const method of contract.methodNames) {
    if (typeof adapter[method] !== 'function') {
      throw new Error(
        `Adapter for "${contract.name}" is missing method "${method}" — ` +
        'implement it (or provide a real backend adapter) before registering.'
      );
    }
  }
  return adapter;
}

/* ------------------------------------------------------------------ */
/*  Contracts                                                         */
/* ------------------------------------------------------------------ */

/**
 * Authentication — who is logged in and whether a session exists.
 * Local adapter: services/authService + api-client session helpers.
 * Real adapter: token exchange / SSO session lookup.
 */
export const AuthenticationContract = createContract('Authentication', [
  'getCurrentUser', // () => { id, name, email, role } | null
  'hasSession'     // () => boolean
]);

/**
 * Authorization — the acting identity and coarse role checks.
 * Business rules (who may approve what) stay in the business services;
 * this contract only supplies identity context so those rules can be
 * evaluated consistently in both modes.
 */
export const AuthorizationContract = createContract('Authorization', [
  'getActor', // () => { id, name, email, role }
  'hasRole'   // (role: string) => boolean
]);

/**
 * Transactions — atomic units of work across multiple writes.
 * Local adapter: best-effort (localStorage has no atomic multi-write,
 * so each persist flushes as it happens).
 * Real adapter: a DB transaction around the unit of work.
 */
export const TransactionContract = createContract('Transaction', [
  'runInTransaction' // <T>(unitOfWork: () => Promise<T> | T) => Promise<T>
]);

/**
 * Concurrency — optimistic locking for shared records.
 * Local adapter: single-client localStorage never races, so the local
 * implementation is a version-field check only.
 * Real adapter: compare-and-set against the database row version.
 */
export const ConcurrencyContract = createContract('Concurrency', [
  'withOptimisticLock' // <T>(record, expectedVersion, write: (record) => T) => Promise<T>
]);

/**
 * Database persistence — the repository boundary.
 * Local adapter: lazy localStorage collections (services/base.js).
 * Real adapter: Postgres / JPA repository behind the same interface.
 */
export const PersistenceContract = createContract('Persistence', [
  'createRepository', // (key: string, seed: () => T[]) => { all, persist, reset }
  'getItem',          // (key: string) => unknown
  'setItem'           // (key: string, value: unknown) => void
]);

/**
 * File storage — attachment persistence.
 * Local adapter: attachments stored inline as data URLs on records.
 * Real adapter: object storage (S3 / MinIO / filesystem) returning
 * signed URLs.
 */
export const FileStorageContract = createContract('FileStorage', [
  'save',       // async (attachment) => { id, dataUrl, name }
  'getDataUrl', // async (attachment) => string
  'remove'      // async (attachment) => boolean
]);

/**
 * Audit logging — structured, actor-bound audit entries.
 * Local adapter: purchase/services/documentAudit.js.
 * Real adapter: server-side audit table / log stream.
 */
export const AuditContract = createContract('Audit', [
  'record', // async (action: string, options) => auditRecord
  'query'   // async (docId: string, options) => auditRecord[]
]);

/** Canonical contract registry keys → contracts. */
export const PLATFORM_CONTRACTS = Object.freeze({
  auth: AuthenticationContract,
  authorization: AuthorizationContract,
  transactions: TransactionContract,
  concurrency: ConcurrencyContract,
  persistence: PersistenceContract,
  fileStorage: FileStorageContract,
  audit: AuditContract
});

/**
 * Builds the immutable platform registry from one adapter per
 * contract. Validates every adapter at startup.
 */
export function createPlatform(adapters = {}) {
  const registry = {};
  for (const [key, contract] of Object.entries(PLATFORM_CONTRACTS)) {
    const adapter = adapters[key];
    if (!adapter) {
      throw new Error(
        `Missing "${key}" adapter — register one (see platform/local.js for the local reference implementation).`
      );
    }
    registry[key] = assertImplements(contract, adapter);
  }
  return Object.freeze(registry);
}