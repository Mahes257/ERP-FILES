/**
 * purchase/services/platform/local.js
 * ------------------------------------------------------------------
 * Local adapters — the reference implementation of every platform
 * contract. They wrap the existing localStorage-backed machinery so
 * business services and UI code depend only on the CONTRACT, never on
 * localStorage directly. A real backend later provides its own
 * adapters (services/platform/backend.js) with identical signatures.
 * ------------------------------------------------------------------
 */
import { getCurrentActor, hasSession } from '../api-client';
import { getStoredUser } from '../../../services/authService';
import { createCollection, readStorage, writeStorage } from '../base';
import { AUDIT_ACTIONS } from '../documentAudit';

/* ------------------------------------------------------------------ */
/*  Authentication                                                    */
/* ------------------------------------------------------------------ */

export const authAdapter = {
  /** The logged-in user profile (JWT-derived), or null when signed out. */
  getCurrentUser() {
    const user = getStoredUser();
    if (!user) return null;
    const actor = getCurrentActor();
    return {
      id: actor.id,
      name: user.fullName || user.name || actor.name,
      email: user.email || actor.email,
      role: actor.role
    };
  },

  /** True when a JWT session exists. */
  hasSession() {
    return hasSession();
  }
};

/* ------------------------------------------------------------------ */
/*  Authorization                                                     */
/* ------------------------------------------------------------------ */

export const authorizationAdapter = {
  /** The acting identity used by every business rule. */
  getActor() {
    return getCurrentActor();
  },

  /** Coarse role check against the actor's comma-separated roles. */
  hasRole(role) {
    const actor = getCurrentActor();
    return String(actor.role || '')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean)
      .includes(role);
  }
};

/* ------------------------------------------------------------------ */
/*  Transactions                                                      */
/* ------------------------------------------------------------------ */

export const transactionAdapter = {
  /**
   * Runs a unit of work. localStorage has no atomic multi-write, so
   * the local adapter executes the unit directly and lets each
   * repository persist as it writes. A real backend adapter wraps the
   * same unit in a database transaction (commit / rollback).
   */
  async runInTransaction(unitOfWork) {
    return unitOfWork();
  }
};

/* ------------------------------------------------------------------ */
/*  Concurrency                                                       */
/* ------------------------------------------------------------------ */

export const concurrencyAdapter = {
  /**
   * Optimistic-lock write. The local adapter only guards the version
   * field (single-client localStorage cannot truly race). A real
   * backend adapter issues a compare-and-set against the stored row.
   */
  async withOptimisticLock(record, expectedVersion, write) {
    const current = Number(record?.version ?? 0);
    if (expectedVersion !== undefined && current !== Number(expectedVersion)) {
      throw new Error('Concurrent modification — the record changed since it was read');
    }
    const next = { ...(record || {}), version: current + 1 };
    return write(next);
  }
};

/* ------------------------------------------------------------------ */
/*  Database persistence                                              */
/* ------------------------------------------------------------------ */

export const persistenceAdapter = {
  /**
   * Repository factory — the ONLY persistence primitive business
   * services use. Local: lazy localStorage collection. Real backend:
   * repository backed by Postgres / the REST API.
   */
  createRepository(key, seedBuilder) {
    return createCollection(key, seedBuilder);
  },

  getItem(key) {
    return readStorage(key);
  },

  setItem(key, value) {
    writeStorage(key, value);
  }
};

/* ------------------------------------------------------------------ */
/*  File storage                                                      */
/* ------------------------------------------------------------------ */

export const fileStorageAdapter = {
  /**
   * Saves an attachment. Local mode stores the file inline as a data
   * URL (the record keeps a copy). A real adapter uploads the file and
   * returns a storage reference instead of the bytes.
   */
  async save(attachment) {
    const id =
      attachment?.id ||
      `ATT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      id,
      name: attachment?.name || '',
      dataUrl: attachment?.dataUrl || ''
    };
  },

  async getDataUrl(attachment) {
    return attachment?.dataUrl || '';
  },

  async remove() {
    /* Local attachments live on the record itself — nothing to purge. */
    return true;
  }
};

/* ------------------------------------------------------------------ */
/*  Audit logging                                                     */
/* ------------------------------------------------------------------ */

export const auditAdapter = {
  /**
   * Records a structured audit entry through the shared document audit
   * service (actor-bound, sanitized, localStorage-backed).
   */
  async record(action, options = {}) {
    const { documentAuditService } = await import('../documentAudit');
    return documentAuditService.record(action, {
      source: options.source || 'api',
      ...options
    });
  },

  /** Audit trail for one document id. */
  async query(docId, options = {}) {
    const { documentAuditService } = await import('../documentAudit');
    return documentAuditService.getAuditTrail(docId, options);
  }
};

/** Canonical audit action labels (re-exported for adapters). */
export const AUDIT_ACTIONS_LOCAL = AUDIT_ACTIONS;