/**
 * production/pages/ProductionDocuments.jsx
 * ------------------------------------------------------------------
 * Production → Documents (`/production/documents`).
 *
 * This screen is the EXISTING Sales Documents explorer (pages/Documents.jsx)
 * mounted with the Production profile — the same component, not a copy of it.
 * So the page the Production sidebar opens has the identical layout, content
 * width, spacing, header and breadcrumb, Back button, Refresh and Upload
 * Document actions, folder cards (Inside ERP · Local Doc, with counts), folder
 * icons and dimensions, hover states, search + filter toolbar, document table
 * with its existing actions, pagination, loading / empty / error states and
 * responsive rules — because they are one and the same implementation.
 *
 * What the profile changes (see ../data/documents.js):
 *   · the folder hierarchy — Production's own sections under Inside ERP
 *   · the repository read — the Production `module` spellings, read through the
 *     existing document listing (`GET /documents`)
 *   · the folder that keeps an unmapped row
 *
 * The Sales Documents module at /documents is untouched: it mounts the same
 * component with its own (default) profile.
 * ------------------------------------------------------------------
 */
import Documents from '../../pages/Documents';
import { PRODUCTION_EXPLORER } from '../data/documents';

export default function ProductionDocuments() {
  return <Documents explorer={PRODUCTION_EXPLORER} />;
}
