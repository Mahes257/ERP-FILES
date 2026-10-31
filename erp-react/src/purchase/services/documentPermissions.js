/**
 * purchase/services/documentPermissions.js
 * ------------------------------------------------------------------
 * Document access control and permission service.
 *
 * Uses the existing auth architecture (getCurrentActor from api-client,
 * getStoredUser from authService). Maps roles (ADMIN / MANAGER / USER)
 * to document permissions. Supports a future fine-grained permission
 * array if added to the user payload.
 *
 * Permissions:
 *   VIEW, UPLOAD, DOWNLOAD, PRINT, EDIT_METADATA, CREATE_VERSION,
 *   ARCHIVE, DELETE, RESTORE, MANAGE_CONFIDENTIAL
 *
 * Confidential documents:
 *   - Require MANAGE_CONFIDENTIAL or explicit document owner access
 *   - Restrict download, print, and metadata editing for non-owners
 *
 * Never exposes internal file paths to the UI.
 * Never logs passwords, tokens, or sensitive credentials.
 * ------------------------------------------------------------------
 */
import { getCurrentActor } from './api-client';
import { getStoredUser } from '../../services/authService';

/* ═══════════════════════════════════════════════════════════════════
   Permission Constants
   ═══════════════════════════════════════════════════════════════════ */

export const DOCUMENT_PERMISSIONS = {
  VIEW: 'DOCUMENT_VIEW',
  UPLOAD: 'DOCUMENT_UPLOAD',
  DOWNLOAD: 'DOCUMENT_DOWNLOAD',
  PRINT: 'DOCUMENT_PRINT',
  EDIT_METADATA: 'DOCUMENT_EDIT_METADATA',
  CREATE_VERSION: 'DOCUMENT_CREATE_VERSION',
  ARCHIVE: 'DOCUMENT_ARCHIVE',
  DELETE: 'DOCUMENT_DELETE',
  RESTORE: 'DOCUMENT_RESTORE',
  MANAGE_CONFIDENTIAL: 'DOCUMENT_MANAGE_CONFIDENTIAL'
};

/* ═══════════════════════════════════════════════════════════════════
   Role → Permission Mapping
   ═══════════════════════════════════════════════════════════════════ */

const ROLE_PERMISSIONS = {
  ADMIN: [
    DOCUMENT_PERMISSIONS.VIEW,
    DOCUMENT_PERMISSIONS.UPLOAD,
    DOCUMENT_PERMISSIONS.DOWNLOAD,
    DOCUMENT_PERMISSIONS.PRINT,
    DOCUMENT_PERMISSIONS.EDIT_METADATA,
    DOCUMENT_PERMISSIONS.CREATE_VERSION,
    DOCUMENT_PERMISSIONS.ARCHIVE,
    DOCUMENT_PERMISSIONS.DELETE,
    DOCUMENT_PERMISSIONS.RESTORE,
    DOCUMENT_PERMISSIONS.MANAGE_CONFIDENTIAL
  ],
  MANAGER: [
    DOCUMENT_PERMISSIONS.VIEW,
    DOCUMENT_PERMISSIONS.UPLOAD,
    DOCUMENT_PERMISSIONS.DOWNLOAD,
    DOCUMENT_PERMISSIONS.PRINT,
    DOCUMENT_PERMISSIONS.EDIT_METADATA,
    DOCUMENT_PERMISSIONS.CREATE_VERSION,
    DOCUMENT_PERMISSIONS.ARCHIVE,
    DOCUMENT_PERMISSIONS.DELETE,
    DOCUMENT_PERMISSIONS.RESTORE,
    DOCUMENT_PERMISSIONS.MANAGE_CONFIDENTIAL
  ],
  USER: [
    DOCUMENT_PERMISSIONS.VIEW,
    DOCUMENT_PERMISSIONS.UPLOAD,
    DOCUMENT_PERMISSIONS.DOWNLOAD,
    DOCUMENT_PERMISSIONS.PRINT,
    DOCUMENT_PERMISSIONS.EDIT_METADATA
    /* No CREATE_VERSION, ARCHIVE, DELETE, RESTORE, MANAGE_CONFIDENTIAL */
  ],
  VIEWER: [
    DOCUMENT_PERMISSIONS.VIEW,
    DOCUMENT_PERMISSIONS.DOWNLOAD,
    DOCUMENT_PERMISSIONS.PRINT
    /* View-only: no upload, edit, version, archive, delete */
  ]
};

/* Default permissions when role is unrecognized */
const DEFAULT_PERMISSIONS = [
  DOCUMENT_PERMISSIONS.VIEW,
  DOCUMENT_PERMISSIONS.DOWNLOAD
];

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Resolve the user's effective permissions.
 * Checks: explicit permission array on user payload → role mapping → default.
 */
function resolvePermissions(user) {
  if (!user) return [...DEFAULT_PERMISSIONS];

  /* If the user payload carries an explicit permissions array, use it */
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return [...user.permissions];
  }

  /* Fall back to role-based mapping */
  const role = String(user.role || '').trim().toUpperCase();
  return ROLE_PERMISSIONS[role] || [...DEFAULT_PERMISSIONS];
}

/**
 * Get the current user's role (normalized, uppercase).
 */
function getCurrentRole() {
  const user = getStoredUser() || {};
  return String(user.role || '').trim().toUpperCase();
}

/**
 * Check if the user is the owner/uploader of a document.
 */
function isDocumentOwner(doc, actor) {
  if (!doc || !actor) return false;
  const ownerName = doc.uploadedBy || '';
  const actorName = actor.name || '';
  const actorEmail = actor.email || '';
  return (
    ownerName === actorName ||
    ownerName === actorEmail ||
    doc.uploadedBy === actor.id
  );
}

/**
 * Sanitize a document record for UI exposure.
 * Strips internal file paths (storagePath, internalUrl) and sensitive data.
 */
function sanitizeForUI(doc) {
  if (!doc) return null;
  const safe = { ...doc };
  delete safe.storagePath;
  delete safe.internalUrl;
  delete safe._internalRef;

  /* Replace sourceUrl with a sanitized version — only expose data: URLs,
     never raw filesystem or storage paths */
  if (safe.sourceUrl && !safe.sourceUrl.startsWith('data:') && !safe.sourceUrl.startsWith('blob:')) {
    safe.sourceUrl = ''; /* Hide non-data URLs from the UI */
  }

  return safe;
}

/* ═══════════════════════════════════════════════════════════════════
   Public Service
   ═══════════════════════════════════════════════════════════════════ */

export const documentPermissionsService = {
  /**
   * Get all permissions for the current user.
   * @returns {string[]} Array of permission strings
   */
  getCurrentPermissions() {
    const user = getStoredUser() || {};
    return resolvePermissions(user);
  },

  /**
   * Check if the current user has a specific permission.
   * @param {string} permission - Permission constant
   * @returns {boolean}
   */
  hasPermission(permission) {
    return this.getCurrentPermissions().includes(permission);
  },

  /**
   * Check if the current user has ALL of the specified permissions.
   * @param {string[]} permissions
   * @returns {boolean}
   */
  hasAllPermissions(permissions) {
    const current = this.getCurrentPermissions();
    return permissions.every((p) => current.includes(p));
  },

  /**
   * Check if the current user has ANY of the specified permissions.
   * @param {string[]} permissions
   * @returns {boolean}
   */
  hasAnyPermission(permissions) {
    const current = this.getCurrentPermissions();
    return permissions.some((p) => current.includes(p));
  },

  /**
   * Get the effective permissions for a specific document.
   * Takes into account: user role, document confidentiality, document ownership.
   *
   * @param {Object} doc - Document record
   * @returns {Object} Permission map: { view, upload, download, print, editMetadata, ... }
   */
  getDocumentPermissions(doc) {
    const actor = getCurrentActor();
    const basePermissions = this.getCurrentPermissions();
    const isConfidential = doc?.confidential === true;
    const isOwner = isDocumentOwner(doc, actor);
    const canManageConfidential = basePermissions.includes(DOCUMENT_PERMISSIONS.MANAGE_CONFIDENTIAL);

    /* For confidential documents, restrict to owner or MANAGE_CONFIDENTIAL holders */
    if (isConfidential && !isOwner && !canManageConfidential) {
      return {
        view: basePermissions.includes(DOCUMENT_PERMISSIONS.VIEW),
        upload: false,
        download: false,
        print: false,
        editMetadata: false,
        createVersion: false,
        archive: false,
        delete: false,
        restore: false,
        manageConfidential: false
      };
    }

    return {
      view: basePermissions.includes(DOCUMENT_PERMISSIONS.VIEW),
      upload: basePermissions.includes(DOCUMENT_PERMISSIONS.UPLOAD),
      download: basePermissions.includes(DOCUMENT_PERMISSIONS.DOWNLOAD),
      print: basePermissions.includes(DOCUMENT_PERMISSIONS.PRINT),
      editMetadata: basePermissions.includes(DOCUMENT_PERMISSIONS.EDIT_METADATA),
      createVersion: basePermissions.includes(DOCUMENT_PERMISSIONS.CREATE_VERSION),
      archive: basePermissions.includes(DOCUMENT_PERMISSIONS.ARCHIVE),
      delete: basePermissions.includes(DOCUMENT_PERMISSIONS.DELETE),
      restore: basePermissions.includes(DOCUMENT_PERMISSIONS.RESTORE),
      manageConfidential: canManageConfidential
    };
  },

  /**
   * Check if the current user can download a specific document.
   * Handles confidential document restrictions.
   *
   * @param {Object} doc - Document record
   * @returns {{ allowed: boolean, reason?: string }}
   */
  canDownload(doc) {
    if (!doc) return { allowed: false, reason: 'No document specified' };
    if (!doc.sourceUrl) return { allowed: false, reason: 'No file content available' };

    const perms = this.getDocumentPermissions(doc);
    if (!perms.download) {
      if (doc.confidential && !isDocumentOwner(doc, getCurrentActor())) {
        return { allowed: false, reason: 'Access restricted — confidential document' };
      }
      return { allowed: false, reason: 'Insufficient permissions' };
    }

    return { allowed: true };
  },

  /**
   * Check if the current user can print a specific document.
   * @param {Object} doc
   * @returns {{ allowed: boolean, reason?: string }}
   */
  canPrint(doc) {
    if (!doc) return { allowed: false, reason: 'No document specified' };
    const perms = this.getDocumentPermissions(doc);
    if (!perms.print) return { allowed: false, reason: 'Insufficient permissions' };
    return { allowed: true };
  },

  /**
   * Check if the current user can edit a document's metadata.
   * @param {Object} doc
   * @returns {{ allowed: boolean, reason?: string }}
   */
  canEditMetadata(doc) {
    if (!doc) return { allowed: false, reason: 'No document specified' };
    const perms = this.getDocumentPermissions(doc);
    if (!perms.editMetadata) return { allowed: false, reason: 'Insufficient permissions' };
    return { allowed: true };
  },

  /**
   * Check if the current user can delete a document.
   * @param {Object} doc
   * @returns {{ allowed: boolean, reason?: string }}
   */
  canDelete(doc) {
    if (!doc) return { allowed: false, reason: 'No document specified' };
    const perms = this.getDocumentPermissions(doc);
    if (!perms.delete) return { allowed: false, reason: 'Insufficient permissions' };
    return { allowed: true };
  },

  /**
   * Check if the current user can archive a document.
   * @param {Object} doc
   * @returns {{ allowed: boolean, reason?: string }}
   */
  canArchive(doc) {
    if (!doc) return { allowed: false, reason: 'No document specified' };
    const perms = this.getDocumentPermissions(doc);
    if (!perms.archive) return { allowed: false, reason: 'Insufficient permissions' };
    return { allowed: true };
  },

  /**
   * Sanitize a document record for UI exposure.
   * Strips internal file paths and sensitive data.
   */
  sanitizeForUI,

  /**
   * Get the current actor (convenience wrapper).
   */
  getCurrentActor,

  /**
   * Get current role string.
   */
  getCurrentRole,

  /**
   * Check if a document is confidential.
   */
  isConfidential(doc) {
    return doc?.confidential === true;
  },

  /**
   * Check if the current user is the document owner.
   */
  isOwner(doc) {
    return isDocumentOwner(doc, getCurrentActor());
  }
};
