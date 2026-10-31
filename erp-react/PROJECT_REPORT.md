# ERP React — Final Project Report

Upgrade of the enterprise CRM with a full **Leads module** (Spring Boot integration, server pagination / search / sort / filter, create / edit / lifecycle actions, exports) plus a project-wide **cleanup, performance and organization pass**. Existing UI, design language and pages (Dashboard, Contacts, Sign In) are preserved.

Verification: `npm run lint` (0 errors) and `npm run build` (successful) both pass.

---

## 1. Files Created

### Leads feature — data layer
| File | Purpose |
|---|---|
| `src/utils/leadConstants.js` | Stages, statuses, sources, column config (`LEAD_COLUMNS`), page-size options, storage keys |
| `src/utils/leadMockData.js` | Offline seed: 8 owners + 23 leads with embedded timeline / activities / notes / history |
| `src/utils/leadHelpers.js` | Canonical helpers: `formatINR`, `formatDate`, `formatDateTime`, `formatRelativeTime`, `getInitials`, `avatarColor`, `normalizeLead`, `serializeLead`, `getCellValue`, `buildLeadFormPrefill`, `buildExportFilename`, `downloadBlob`, `buildLeadSearchString` |
| `src/utils/exportUtils.js` | CSV / Excel / PDF Summary / PDF Detailed / Print generators (Excel + PDF libs lazy-imported) |
| `src/services/leadService.js` | API layer for every lead endpoint (created first, then refactored — see below) |
| `src/services/exportService.js` | Reusable `ExportService`: `EXPORT_FORMATS`, `exportLeads`, `exportFromBackend` |
| `src/hooks/useLeads.js` | Data orchestrator: server-first pagination/search/sort/filter with offline fallback to `MOCK_LEADS`; mutation wrappers returning `{ ok, data }` |
| `src/hooks/useAsyncData.js` | Generic fetch hook with `loading / error / isFallback / refresh` and fallback data |

### Reusable UI primitives (`src/components/Common`)
| File | Purpose |
|---|---|
| `Toast.jsx` + `ToastContext.js` | Toast provider / container (auto-dismiss) + `useToast` |
| `Modal.jsx` | Generic modal (ESC, backdrop close, footer slot, max-height scroll) |
| `ConfirmDialog.jsx` | Confirmation dialog with danger / warning / default variants + loading confirm |
| `Accordion.jsx` | Collapsible section (used by the form) |
| `FormControls.jsx` | `FormField`, `TextInput`, `SelectInput`, `TextArea` |
| `Tabs.jsx` | Config-driven tab bar |
| `ErrorBoundary.jsx` | Global error boundary with "Try Again" recovery |
| `PageLoader.jsx` | Suspense fallback spinner |
| `index.js` | Barrel export for the above |

### Lead feature components
| File | Purpose |
|---|---|
| `src/components/LeadTable/LeadTable.jsx` | Config-driven table: sticky columns, sorting, pagination, selection, bulk bar, row menus, skeleton / empty / error states |
| `src/components/LeadForm/LeadForm.jsx` | React Hook Form create/edit form (9 accordion sections) |
| `src/components/LeadModals/AssignOwnerModal.jsx` | Assign owner modal (`PATCH /leads/{id}/owner`) |
| `src/components/LeadModals/ChangeStageModal.jsx` | Change stage modal (`PATCH /leads/{id}/stage`) |
| `src/components/Export/ExportDropdown.jsx` | Reusable export dropdown (light toolbar + dark bulk-bar variants) |
| `src/components/LeadDetail/LeadViewModal.jsx` | "View Lead" modal with 5 tabs |
| `src/components/LeadDetail/Timeline.jsx` | `GET /leads/{id}/timeline` — vertical timeline |
| `src/components/LeadDetail/Activities.jsx` | `GET /leads/{id}/activities` — typed activity list |
| `src/components/LeadDetail/Notes.jsx` | `GET/POST /leads/{id}/notes` — list + add |
| `src/components/LeadDetail/Attachments.jsx` | `GET/POST /leads/{id}/attachments` — list + upload |
| `src/components/LeadDetail/History.jsx` | `GET /leads/{id}/history` — change history |
| `src/components/LeadDetail/DetailSection.jsx` | Shared loading / error / empty / fallback wrapper |
| `src/components/*/index.js` | Barrel exports (LeadTable, LeadForm, LeadModals, LeadDetail, Export) |

### Pages
| File | Purpose |
|---|---|
| `src/pages/Leads.jsx` | Main upgraded Leads page (tabs, filters, search, table, bulk + row actions, modals, export) |
| `src/pages/AddLead.jsx` | Add New Lead page |
| `src/pages/EditLead.jsx` | Edit Lead page (fetch + prefill + skeleton) |
| `src/App.jsx` | Routes + `ToastProvider` + `ErrorBoundary` + lazy-loaded `Suspense` pages |

---

## 2. Files Modified

| File | Change |
|---|---|
| `src/pages/Leads.jsx` | Full upgrade + `useCallback` wrappers for memoized table rows |
| `src/pages/AddLead.jsx`, `EditLead.jsx` | Imports updated to barrel exports |
| `src/App.jsx` | React.lazy code-splitting, `Suspense` + `PageLoader`, `ErrorBoundary` wrap |
| `src/pages/Dashboard.jsx`, `Contacts.jsx`, `SignIn.jsx` | Removed unused imports (no behavior change) |
| `src/hooks/useLocalStorage.js` | Dropped unused catch bindings |
| `src/components/LeadTable/LeadTable.jsx` | Perf: memoized `TableRow`, per-row menus, memoized layout, stable toggle callback |
| `src/services/leadService.js` | Refactored ~20 duplicated try/catch blocks into a single `request()` helper |
| `src/services/exportService.js` | `exportLeads` made async (awaits lazy-loaded generators) |
| `src/utils/exportUtils.js` | `xlsx` / `jspdf` / `jspdf-autotable` moved to dynamic `import()` (lazy chunks) |
| `src/utils/leadHelpers.js` | Added `formatRelativeTime` |
| `src/components/Export/ExportDropdown.jsx` | Async export handling; barrel import |
| `src/components/LeadModals/*`, `LeadDetail/*`, `LeadForm/LeadForm.jsx` | Barrel imports for consistency |

---

## 3. Files Deleted (duplicate / orphaned template code)

| File | Reason |
|---|---|
| `src/services/mockStore.js` | Unused offline store; duplicated service fallback (replaced by `MOCK_LEADS` in `useLeads`) |
| `src/services/mockLeads.js` | Only imported by the deleted `mockStore` |
| `src/utils/mockLeads.js` | Unused 700-line mock generator |
| `src/utils/helpers.js` | Duplicated `normalizeLead`, `downloadBlob`, `getErrorMessage` (canonical versions live in `leadHelpers.js` / `leadService.js`) |
| `src/utils/formatters.js` | Duplicated formatting helpers |
| `src/utils/constants.js` | Duplicated constants (canonical in `leadConstants.js`) |
| `src/utils/format.js` | Only used by the deleted `helpers.js` / `mockStore.js` |
| `src/utils/validation.js` | Unused |
| `src/utils/fileParser.js` | Unused |

---

## 4. Improvements Summary

**Performance**
- Route-level code splitting via `React.lazy` + `Suspense`; initial bundle now loads only the shared `index` chunk.
- `xlsx`, `jspdf`, `jspdf-autotable` dynamically imported — the Leads page chunk dropped from **771 kB → 60 kB**; export libraries load on demand.
- Memoized table rows (`React.memo`) with stable `useCallback` callbacks + memoized column layout; per-row menus remove table-wide re-renders on menu open.

**Duplicate code removed**
- Deleted 9 orphaned template files duplicating `leadHelpers` / `leadConstants`.
- `leadService` de-duplicated via a single `request()` error-normalizing helper.

**Folder organization / component reuse**
- Barrels (`index.js`) for `Common`, `LeadTable`, `LeadForm`, `LeadModals`, `LeadDetail`, `Export` — pages import from folder root.
- Shared `DetailSection`, `Tabs`, `Modal`, `ConfirmDialog`, `Toast`, `FormControls` reused across the Leads module; `useAsyncData` shared by all five detail tabs.

**API handling / loading / errors**
- All API calls funnel through `axiosInstance` (JWT) → `leadService` → `useLeads` / `useAsyncData`, with consistent `normalizeApiError` messages.
- Graceful degradation everywhere: server failure falls back to cached data with a visible banner + Retry; per-section skeletons; retry buttons; global `ErrorBoundary`.

**Responsiveness**
- Table scrolls horizontally with sticky header/first column; toolbar stacks on mobile; modals cap at `85vh` with internal scroll; tabs scroll horizontally; existing responsive classes preserved.

**Compilation**
- `npm run lint` — 0 errors. `npm run build` — successful, no chunk-size warnings.
