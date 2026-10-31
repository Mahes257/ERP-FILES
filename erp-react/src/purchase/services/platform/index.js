/**
 * purchase/services/platform/index.js
 * ------------------------------------------------------------------
 * Platform registry — the single seam where the Purchase module's
 * cross-cutting infrastructure is resolved.
 *
 *   platform.auth             → Authentication contract
 *   platform.authorization    → Authorization contract
 *   platform.transactions     → Transaction contract
 *   platform.concurrency      → Concurrency contract
 *   platform.persistence      → Database persistence contract
 *   platform.fileStorage      → File storage contract
 *   platform.audit            → Audit logging contract
 *
 * Today every adapter is the LOCAL reference implementation
 * (platform/local.js). To move to a real backend, provide one adapter
 * per contract and swap this file — no business service or UI code
 * changes, because they already depend only on the contracts.
 * ------------------------------------------------------------------
 */
import { createPlatform } from './contracts';
import * as localAdapters from './local';

/** Map the local adapter export names onto the contract registry keys. */
export const platform = createPlatform({
  auth: localAdapters.authAdapter,
  authorization: localAdapters.authorizationAdapter,
  transactions: localAdapters.transactionAdapter,
  concurrency: localAdapters.concurrencyAdapter,
  persistence: localAdapters.persistenceAdapter,
  fileStorage: localAdapters.fileStorageAdapter,
  audit: localAdapters.auditAdapter
});

export {
  createContract,
  createPlatform,
  assertImplements,
  AuthenticationContract,
  AuthorizationContract,
  TransactionContract,
  ConcurrencyContract,
  PersistenceContract,
  FileStorageContract,
  AuditContract,
  PLATFORM_CONTRACTS
} from './contracts';

export { localAdapters };
export default platform;