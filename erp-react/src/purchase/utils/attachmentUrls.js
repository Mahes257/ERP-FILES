/**
 * purchase/utils/attachmentUrls.js
 * ------------------------------------------------------------------
 * Shared attachment URL helpers for the Purchase services.
 *
 * Uploaded attachments carry their own data URLs from the API.
 * This module provides the withAttachmentUrls helper that was
 * previously used to seed demo attachments with mock file paths.
 * With demo data removed, this is a pass-through — no mock URLs
 * are injected.
 * ------------------------------------------------------------------
 */

/** Pass-through: attachments from the API already carry their URLs. */
export function withAttachmentUrls(list) {
  return list.map((record) => ({
    ...record,
    attachments: record.attachments || []
  }));
}
