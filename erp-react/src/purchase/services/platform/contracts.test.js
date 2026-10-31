/**
 * purchase/services/platform/contracts.test.js
 * ------------------------------------------------------------------
 * Platform contract tests:
 *
 *   • createPlatform validates every adapter against its contract
 *     (a missing method fails loudly — the backend-swap guarantee)
 *   • The local adapters implement every contract method
 *   • Persistence adapter round-trips through localStorage
 *   • Auth adapter reads the REAL stored session, never a stub
 *   • Transaction adapter runs the unit of work
 *   • Concurrency adapter guards the version field
 *   • Audit adapter writes through the shared audit service
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createContract, createPlatform, assertImplements,
  AuthenticationContract, AuthorizationContract, TransactionContract,
  ConcurrencyContract, PersistenceContract, FileStorageContract, AuditContract
} from './contracts';
import {
  authAdapter, authorizationAdapter, transactionAdapter,
  concurrencyAdapter, persistenceAdapter, fileStorageAdapter, auditAdapter
} from './local';
import { platform } from './index';
import { storageKeys } from '../base';

beforeEach(() => {
  localStorage.clear();
});

describe('contract registry', () => {
  it('createPlatform validates that every adapter implements its contract', () => {
    const complete = {
      auth: authAdapter,
      authorization: authorizationAdapter,
      transactions: transactionAdapter,
      concurrency: concurrencyAdapter,
      persistence: persistenceAdapter,
      fileStorage: fileStorageAdapter,
      audit: auditAdapter
    };
    expect(() => createPlatform(complete)).not.toThrow();
    expect(platform.auth.getCurrentUser).toBeTypeOf('function');
    expect(platform.persistence.createRepository).toBeTypeOf('function');
  });

  it('fails loudly when an adapter is missing a required method', () => {
    expect(() => createPlatform({ auth: {}, authorization: authorizationAdapter, transactions: transactionAdapter, concurrency: concurrencyAdapter, persistence: persistenceAdapter, fileStorage: fileStorageAdapter, audit: auditAdapter }))
      .toThrow(/missing method "getCurrentUser"/);
  });

  it('fails loudly when an adapter is missing entirely', () => {
    expect(() => createPlatform({ auth: authAdapter })).toThrow(/Missing "authorization" adapter/);
  });

  it('assertImplements passes a complete adapter', () => {
    expect(() => assertImplements(TransactionContract, { runInTransaction: async () => 1 })).not.toThrow();
  });

  it('createContract freezes the contract definition', () => {
    const c = createContract('Test', ['a', 'b']);
    expect(() => { c.methodNames.push('c'); }).toThrow();
  });
});

describe('local adapters', () => {
  it('auth adapter reads the real stored session', () => {
    expect(authAdapter.hasSession()).toBe(false);
    expect(authAdapter.getCurrentUser()).toBeNull();
    localStorage.setItem('authUser', JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }));
    localStorage.setItem('authToken', 'eyJ.eyJzdWIiOiIxIn0.sig');
    expect(authAdapter.hasSession()).toBe(true);
    expect(authAdapter.getCurrentUser().name).toBe('Test Buyer');
  });

  it('authorization adapter exposes the acting identity and role checks', () => {
    localStorage.setItem('authUser', JSON.stringify({ fullName: 'Buyer', email: 'b@test.com', role: 'Buyer,Admin' }));
    const actor = authorizationAdapter.getActor();
    expect(actor.name).toBe('Buyer');
    expect(authorizationAdapter.hasRole('Admin')).toBe(true);
    expect(authorizationAdapter.hasRole('Finance')).toBe(false);
  });

  it('transaction adapter runs the unit of work', async () => {
    const result = await transactionAdapter.runInTransaction(async () => 42);
    expect(result).toBe(42);
  });

  it('concurrency adapter guards the version field', async () => {
    await expect(
      concurrencyAdapter.withOptimisticLock({ version: 2 }, 1, async (r) => r)
    ).rejects.toThrow(/Concurrent modification/);

    const written = await concurrencyAdapter.withOptimisticLock({ version: 1 }, 1, async (r) => r);
    expect(written.version).toBe(2);
  });

  it('persistence adapter round-trips through localStorage', () => {
    persistenceAdapter.setItem('purchase-test-kv', { hello: 'world' });
    expect(persistenceAdapter.getItem('purchase-test-kv')).toEqual({ hello: 'world' });

    const repo = persistenceAdapter.createRepository(storageKeys.notifications, () => []);
    expect(repo.all).toEqual([]);
    repo.persist([{ id: 1 }]);
    expect(repo.all).toEqual([{ id: 1 }]);
  });

  it('file storage adapter saves inline attachments', async () => {
    const saved = await fileStorageAdapter.save({ name: 'quote.pdf', dataUrl: 'data:application/pdf;base64,AAA' });
    expect(saved.id).toBeTruthy();
    expect(saved.dataUrl).toContain('base64');
    expect(await fileStorageAdapter.getDataUrl(saved)).toBe('data:application/pdf;base64,AAA');
    expect(await fileStorageAdapter.remove(saved)).toBe(true);
  });

  it('audit adapter records and queries through the shared audit service', async () => {
    const record = await auditAdapter.record('Viewed', {
      doc: { docId: 'DOC-1', docNo: 'PR-2026-0001', name: 'Requisition' }
    });
    expect(record.action).toBe('Viewed');
    const trail = await auditAdapter.query('DOC-1');
    expect(trail.some((r) => r.document?.docId === 'DOC-1')).toBe(true);
  });

  it('platform registry exposes all seven contracts', () => {
    const expected = ['auth', 'authorization', 'transactions', 'concurrency', 'persistence', 'fileStorage', 'audit'];
    expected.forEach((key) => {
      expect(platform[key]).toBeDefined();
    });
    /* All contracts validated — list the method names for the record. */
    const names = [
      ...AuthenticationContract.methodNames,
      ...AuthorizationContract.methodNames,
      ...TransactionContract.methodNames,
      ...ConcurrencyContract.methodNames,
      ...PersistenceContract.methodNames,
      ...FileStorageContract.methodNames,
      ...AuditContract.methodNames
    ];
    expect(names).toContain('runInTransaction');
    expect(names).toContain('createRepository');
    expect(names).toContain('record');
  });
});