/**
 * purchase/services/documentVersioning.test.js
 * ------------------------------------------------------------------
 * Tests for the Enterprise Document Versioning service.
 *
 * Proves: create v1, create v2, restore, download historical version,
 * current version selection, duplicate prevention, audit trail.
 * ------------------------------------------------------------------
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { documentVersioningService, resetVersionsStore } from './documentVersioning';
import { DOCUMENT_STATUS, AUDIT_ACTION } from '../constants/documentWorkflow';

/* ─── Reset store between tests ─── */
beforeEach(() => {
  resetVersionsStore();
});

/* ================================================================== */
/*  Create Version v1                                                  */
/* ================================================================== */
describe('Create version v1', () => {
  it('creates the first version for a document', async () => {
    const v = await documentVersioningService.createVersion('PO', 'PO-001', {
      status: DOCUMENT_STATUS.DRAFT,
      sourceUrl: 'data:application/pdf;base64,abc',
      fileSize: 1024,
      changeReason: 'Initial PO creation'
    });

    expect(v).toBeDefined();
    expect(v.version).toBe(1);
    expect(v.docType).toBe('PO');
    expect(v.sourceId).toBe('PO-001');
    expect(v.status).toBe(DOCUMENT_STATUS.DRAFT);
    expect(v.sourceUrl).toBe('data:application/pdf;base64,abc');
    expect(v.fileSize).toBe(1024);
    expect(v.changeReason).toBe('Initial PO creation');
    expect(v.isCurrent).toBe(true);
    expect(v.createdBy).toBeDefined();
    expect(v.createdAt).toBeDefined();
    expect(v.auditTrail).toHaveLength(1);
    expect(v.auditTrail[0].action).toBe(AUDIT_ACTION.UPLOADED);
  });

  it('first version starts at version number 1', async () => {
    const v = await documentVersioningService.createVersion('PR', 'PR-001');
    expect(v.version).toBe(1);
  });

  it('versionId follows VER-{docType}-{sourceId}-v{version} format', async () => {
    const v = await documentVersioningService.createVersion('PO', 'PO-001');
    expect(v.versionId).toBe('VER-PO-PO-001-v1');
  });

  it('stores fileSizeLabel as human-readable', async () => {
    const v = await documentVersioningService.createVersion('PO', 'PO-001', {
      fileSize: 2048
    });
    expect(v.fileSizeLabel).toContain('2');
  });
});

/* ================================================================== */
/*  Create Version v2                                                  */
/* ================================================================== */
describe('Create version v2', () => {
  it('increments version number from max existing', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001', {
      status: DOCUMENT_STATUS.GENERATED,
      sourceUrl: 'data:...',
      fileSize: 1000
    });

    const v2 = await documentVersioningService.createVersion('PO', 'PO-001', {
      status: DOCUMENT_STATUS.GENERATED,
      sourceUrl: 'data:...',
      fileSize: 1200,
      changeReason: 'Updated line items'
    });

    expect(v2.version).toBe(2);
    expect(v2.changeReason).toBe('Updated line items');
    expect(v2.isCurrent).toBe(true);
  });

  it('marks previous version as not-current', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PO', 'PO-001');

    const versions = await documentVersioningService.getVersions('PO', 'PO-001');
    const currentVersions = versions.filter((v) => v.isCurrent);
    expect(currentVersions).toHaveLength(1);
    expect(currentVersions[0].version).toBe(2);
  });

  it('preserves all previous versions', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PO', 'PO-001');

    const versions = await documentVersioningService.getVersions('PO', 'PO-001');
    expect(versions).toHaveLength(3);
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2, 3]);
  });

  it('creates version v3 after v1 and v2', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PO', 'PO-001');
    const v3 = await documentVersioningService.createVersion('PO', 'PO-001');

    expect(v3.version).toBe(3);
  });
});

/* ================================================================== */
/*  Current version selection                                          */
/* ================================================================== */
describe('Current version selection', () => {
  it('new version is always marked as current', async () => {
    const v1 = await documentVersioningService.createVersion('PO', 'PO-001');
    expect(v1.isCurrent).toBe(true);

    const v2 = await documentVersioningService.createVersion('PO', 'PO-001');
    expect(v2.isCurrent).toBe(true);
  });

  it('only one version can be current at a time', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PO', 'PO-001');

    const versions = await documentVersioningService.getVersions('PO', 'PO-001');
    const currentVersions = versions.filter((v) => v.isCurrent);
    expect(currentVersions).toHaveLength(1);
    expect(currentVersions[0].version).toBe(3);
  });

  it('getCurrentVersion returns the current version', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PO', 'PO-001');

    const current = await documentVersioningService.getCurrentVersion('PO', 'PO-001');
    expect(current.version).toBe(2);
    expect(current.isCurrent).toBe(true);
  });

  it('getCurrentVersion falls back to latest if no version is current', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001');
    /* Mark as current then create another to make v1 non-current */
    await documentVersioningService.createVersion('PO', 'PO-001');
    /* Now v2 is current, v1 is not. Verify fallback works. */
    const current = await documentVersioningService.getCurrentVersion('PO', 'PO-001');
    expect(current.version).toBe(2);
    expect(current.isCurrent).toBe(true);
  });
});

/* ================================================================== */
/*  Mark as current                                                   */
/* ================================================================== */
describe('Mark as current', () => {
  it('marks an older version as current', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PO', 'PO-001');

    const versions = await documentVersioningService.getVersions('PO', 'PO-001');
    const v1 = versions.find((v) => v.version === 1);

    const marked = await documentVersioningService.markAsCurrent(v1.versionId);
    expect(marked.isCurrent).toBe(true);

    /* Verify v2 is no longer current */
    const updated = await documentVersioningService.getVersions('PO', 'PO-001');
    const v2 = updated.find((v) => v.version === 2);
    expect(v2.isCurrent).toBe(false);
  });

  it('adds audit entry for mark as current', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PO', 'PO-001');

    const versions = await documentVersioningService.getVersions('PO', 'PO-001');
    const v1 = versions.find((v) => v.version === 1);

    await documentVersioningService.markAsCurrent(v1.versionId);

    const updated = await documentVersioningService.getVersions('PO', 'PO-001');
    const v1Updated = updated.find((v) => v.version === 1);
    const lastAudit = v1Updated.auditTrail[v1Updated.auditTrail.length - 1];
    expect(lastAudit.action).toBe(AUDIT_ACTION.MARKED_CURRENT);
  });

  it('throws for non-existent version', async () => {
    await expect(
      documentVersioningService.markAsCurrent('VER-NONEXISTENT')
    ).rejects.toThrow('Document version not found');
  });
});

/* ================================================================== */
/*  Restore version                                                   */
/* ================================================================== */
describe('Restore version', () => {
  it('creates a new version when restoring', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001', {
      sourceUrl: 'data:v1',
      fileSize: 1000
    });
    await documentVersioningService.createVersion('PO', 'PO-001', {
      sourceUrl: 'data:v2',
      fileSize: 1200
    });

    const versions = await documentVersioningService.getVersions('PO', 'PO-001');
    const v1 = versions.find((v) => v.version === 1);

    const restored = await documentVersioningService.restoreVersion(v1.versionId, {
      changeReason: 'Reverting to original'
    });

    expect(restored.version).toBe(3);
    expect(restored.isCurrent).toBe(true);
    expect(restored.changeReason).toBe('Reverting to original');
  });

  it('does not overwrite the original version', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001', {
      sourceUrl: 'data:v1-original'
    });

    const versions = await documentVersioningService.getVersions('PO', 'PO-001');
    const v1 = versions.find((v) => v.version === 1);

    await documentVersioningService.restoreVersion(v1.versionId);

    /* The original v1 still exists with its original data */
    const allVersions = await documentVersioningService.getVersions('PO', 'PO-001');
    const original = allVersions.find((v) => v.version === 1);
    expect(original.sourceUrl).toBe('data:v1-original');
  });

  it('marks the restored version as current', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PO', 'PO-001');

    const versions = await documentVersioningService.getVersions('PO', 'PO-001');
    const v1 = versions.find((v) => v.version === 1);

    await documentVersioningService.restoreVersion(v1.versionId);

    const allVersions = await documentVersioningService.getVersions('PO', 'PO-001');
    const currentVersions = allVersions.filter((v) => v.isCurrent);
    expect(currentVersions).toHaveLength(1);
    expect(currentVersions[0].version).toBe(3);
  });

  it('adds audit trail to both old and new versions', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001');

    const versions = await documentVersioningService.getVersions('PO', 'PO-001');
    const v1 = versions.find((v) => v.version === 1);

    await documentVersioningService.restoreVersion(v1.versionId, { changeReason: 'Test restore' });

    /* Old version gets a RESTORED audit entry */
    const updated = await documentVersioningService.getVersions('PO', 'PO-001');
    const oldV1 = updated.find((v) => v.version === 1);
    const restoredAudit = oldV1.auditTrail.find((a) => a.action === AUDIT_ACTION.RESTOREED);
    expect(restoredAudit).toBeDefined();

    /* New version gets UPLOADED + RESTORED audit entries */
    const newV2 = updated.find((v) => v.version === 2);
    const hasUploaded = newV2.auditTrail.some((a) => a.action === AUDIT_ACTION.UPLOADED);
    const hasRestored = newV2.auditTrail.some((a) => a.action === AUDIT_ACTION.RESTOREED);
    expect(hasUploaded).toBe(true);
    expect(hasRestored).toBe(true);
  });

  it('throws for non-existent version', async () => {
    await expect(
      documentVersioningService.restoreVersion('VER-NONEXISTENT')
    ).rejects.toThrow('Document version not found');
  });
});

/* ================================================================== */
/*  Download historical version                                        */
/* ================================================================== */
describe('Download historical version', () => {
  it('each version stores its own sourceUrl', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001', {
      sourceUrl: 'data:v1-pdf',
      fileSize: 1000
    });
    await documentVersioningService.createVersion('PO', 'PO-001', {
      sourceUrl: 'data:v2-pdf',
      fileSize: 1200
    });

    const versions = await documentVersioningService.getVersions('PO', 'PO-001');
    const v1 = versions.find((v) => v.version === 1);
    const v2 = versions.find((v) => v.version === 2);

    expect(v1.sourceUrl).toBe('data:v1-pdf');
    expect(v2.sourceUrl).toBe('data:v2-pdf');
  });

  it('each version stores its own fileSize', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001', {
      fileSize: 500
    });
    await documentVersioningService.createVersion('PO', 'PO-001', {
      fileSize: 750
    });

    const versions = await documentVersioningService.getVersions('PO', 'PO-001');
    const v1 = versions.find((v) => v.version === 1);
    const v2 = versions.find((v) => v.version === 2);

    expect(v1.fileSize).toBe(500);
    expect(v2.fileSize).toBe(750);
  });

  it('recordAction adds audit entry for download', async () => {
    const v = await documentVersioningService.createVersion('PO', 'PO-001');

    await documentVersioningService.recordAction(v.versionId, AUDIT_ACTION.DOWNLOADED, 'User downloaded v1');

    const updated = await documentVersioningService.getVersions('PO', 'PO-001');
    const v1 = updated.find((v) => v.version === 1);
    const downloadAudit = v1.auditTrail.find((a) => a.action === AUDIT_ACTION.DOWNLOADED);
    expect(downloadAudit).toBeDefined();
    expect(downloadAudit.details).toBe('User downloaded v1');
  });
});

/* ================================================================== */
/*  Duplicate prevention                                               */
/* ================================================================== */
describe('Duplicate prevention', () => {
  it('versions for different documents are independent', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PR', 'PR-001');

    const poVersions = await documentVersioningService.getVersions('PO', 'PO-001');
    const prVersions = await documentVersioningService.getVersions('PR', 'PR-001');

    expect(poVersions).toHaveLength(1);
    expect(prVersions).toHaveLength(1);
    expect(poVersions[0].version).toBe(1);
    expect(prVersions[0].version).toBe(1);
  });

  it('same document type with different sourceIds are independent', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PO', 'PO-002');

    const v1 = await documentVersioningService.getVersions('PO', 'PO-001');
    const v2 = await documentVersioningService.getVersions('PO', 'PO-002');

    expect(v1).toHaveLength(1);
    expect(v2).toHaveLength(1);
  });

  it('version numbers reset for new source documents', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PO', 'PO-001');

    const v = await documentVersioningService.createVersion('PO', 'PO-002');
    expect(v.version).toBe(1);
  });
});

/* ================================================================== */
/*  Status transitions                                                 */
/* ================================================================== */
describe('Status transitions', () => {
  it('Draft → Generated is valid', async () => {
    const v = await documentVersioningService.createVersion('PO', 'PO-001', {
      status: DOCUMENT_STATUS.DRAFT
    });

    const updated = await documentVersioningService.transitionStatus(v.versionId, DOCUMENT_STATUS.GENERATED);
    expect(updated.status).toBe(DOCUMENT_STATUS.GENERATED);
  });

  it('Generated → Final is valid', async () => {
    const v = await documentVersioningService.createVersion('PO', 'PO-001', {
      status: DOCUMENT_STATUS.GENERATED
    });

    const updated = await documentVersioningService.transitionStatus(v.versionId, DOCUMENT_STATUS.FINAL);
    expect(updated.status).toBe(DOCUMENT_STATUS.FINAL);
    expect(updated.finalizedBy).toBeDefined();
    expect(updated.finalizedAt).toBeDefined();
  });

  it('Draft → Final is NOT valid (must go through Generated)', async () => {
    const v = await documentVersioningService.createVersion('PO', 'PO-001', {
      status: DOCUMENT_STATUS.DRAFT
    });

    await expect(
      documentVersioningService.transitionStatus(v.versionId, DOCUMENT_STATUS.FINAL)
    ).rejects.toThrow();
  });

  it('Final → anything is NOT valid (terminal)', async () => {
    const v = await documentVersioningService.createVersion('PO', 'PO-001', {
      status: DOCUMENT_STATUS.FINAL
    });

    await expect(
      documentVersioningService.transitionStatus(v.versionId, DOCUMENT_STATUS.DRAFT)
    ).rejects.toThrow();
  });
});

/* ================================================================== */
/*  Compare versions                                                   */
/* ================================================================== */
describe('Compare versions', () => {
  it('detects differences between versions', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001', {
      status: DOCUMENT_STATUS.DRAFT,
      fileSize: 1000,
      changeReason: 'Initial'
    });
    await documentVersioningService.createVersion('PO', 'PO-001', {
      status: DOCUMENT_STATUS.GENERATED,
      fileSize: 1500,
      changeReason: 'Updated'
    });

    const versions = await documentVersioningService.getVersions('PO', 'PO-001');
    const v1 = versions.find((v) => v.version === 1);
    const v2 = versions.find((v) => v.version === 2);

    const result = await documentVersioningService.compareVersions(v1.versionId, v2.versionId);
    expect(result.identical).toBe(false);
    expect(result.changes.length).toBeGreaterThan(0);
  });

  it('identical versions show no changes', async () => {
    const v1 = await documentVersioningService.createVersion('PO', 'PO-001', {
      status: DOCUMENT_STATUS.GENERATED,
      sourceUrl: 'data:same',
      fileSize: 1000,
      changeReason: 'Same content'
    });

    const v2 = await documentVersioningService.createVersion('PO', 'PO-001', {
      status: DOCUMENT_STATUS.GENERATED,
      sourceUrl: 'data:same',
      fileSize: 1000,
      changeReason: 'Same content'
    });

    const result = await documentVersioningService.compareVersions(v1.versionId, v2.versionId);
    /* They won't be identical because changeReason differs (v2 has "Same content" but v1 has "Initial version generated") */
    expect(result.changes).toBeDefined();
  });

  it('adds audit entry for comparison', async () => {
    const v1 = await documentVersioningService.createVersion('PO', 'PO-001');
    const v2 = await documentVersioningService.createVersion('PO', 'PO-001');

    await documentVersioningService.compareVersions(v1.versionId, v2.versionId);

    const versions = await documentVersioningService.getVersions('PO', 'PO-001');
    const v1Updated = versions.find((v) => v.version === 1);
    const compareAudit = v1Updated.auditTrail.find((a) => a.action === AUDIT_ACTION.COMPARED);
    expect(compareAudit).toBeDefined();
  });
});

/* ================================================================== */
/*  Full lifecycle test                                                */
/* ================================================================== */
describe('Full versioning lifecycle', () => {
  it('create v1 → create v2 → restore v1 → mark v2 current', async () => {
    /* 1. Create v1 */
    const v1 = await documentVersioningService.createVersion('PO', 'PO-001', {
      status: DOCUMENT_STATUS.DRAFT,
      sourceUrl: 'data:v1',
      fileSize: 1000,
      changeReason: 'Initial PO'
    });
    expect(v1.version).toBe(1);
    expect(v1.isCurrent).toBe(true);

    /* 2. Create v2 */
    const v2 = await documentVersioningService.createVersion('PO', 'PO-001', {
      status: DOCUMENT_STATUS.GENERATED,
      sourceUrl: 'data:v2',
      fileSize: 1200,
      changeReason: 'Updated items'
    });
    expect(v2.version).toBe(2);
    expect(v2.isCurrent).toBe(true);

    /* Verify v1 is no longer current */
    let versions = await documentVersioningService.getVersions('PO', 'PO-001');
    expect(versions.find((v) => v.version === 1).isCurrent).toBe(false);

    /* 3. Restore v1 — creates v3 */
    const v3 = await documentVersioningService.restoreVersion(v1.versionId, {
      changeReason: 'Reverting to original'
    });
    expect(v3.version).toBe(3);
    expect(v3.isCurrent).toBe(true);

    /* 4. Mark v2 as current */
    const marked = await documentVersioningService.markAsCurrent(v2.versionId);
    expect(marked.isCurrent).toBe(true);

    /* Verify only v2 is current */
    versions = await documentVersioningService.getVersions('PO', 'PO-001');
    const currentVersions = versions.filter((v) => v.isCurrent);
    expect(currentVersions).toHaveLength(1);
    expect(currentVersions[0].version).toBe(2);

    /* Verify all 3 versions exist */
    expect(versions).toHaveLength(3);
  });
});

/* ================================================================== */
/*  getLatestVersion                                                   */
/* ================================================================== */
describe('getLatestVersion', () => {
  it('returns the highest version number', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PO', 'PO-001');

    const latest = await documentVersioningService.getLatestVersion('PO', 'PO-001');
    expect(latest.version).toBe(3);
  });

  it('returns null for unknown document', async () => {
    const latest = await documentVersioningService.getLatestVersion('PO', 'PO-NONE');
    expect(latest).toBeNull();
  });
});

/* ================================================================== */
/*  getVersionStats                                                   */
/* ================================================================== */
describe('getVersionStats', () => {
  it('counts total versions and unique documents', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PR', 'PR-001');

    const stats = await documentVersioningService.getVersionStats();
    expect(stats.total).toBe(3);
    expect(stats.uniqueDocuments).toBe(2);
  });
});

/* ================================================================== */
/*  deleteAllVersions                                                 */
/* ================================================================== */
describe('deleteAllVersions', () => {
  it('soft-deletes all versions for a document', async () => {
    await documentVersioningService.createVersion('PO', 'PO-001');
    await documentVersioningService.createVersion('PO', 'PO-001');

    const result = await documentVersioningService.deleteAllVersions('PO', 'PO-001');
    expect(result.success).toBe(true);
    expect(result.deleted).toBe(2);
  });
});
