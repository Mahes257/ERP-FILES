/**
 * purchase/pages/vendors/VendorDocuments.jsx
 * ------------------------------------------------------------------
 * Vendor Sourcing — the central register of vendor documents
 * (registrations, certifications, tax records, bank details,
 * agreements) under Vendor Management, on the master PR list layout
 * (shared PurchaseListPage): KPI cards, an "All Documents" primary tab
 * with the Active / Archived / Deleted segmented control, search,
 * status / category / vendor filters, export, columns, pagination and
 * row / bulk actions.
 *
 * Every row is one document attached to a vendor, with its file
 * (name / type / size / dataUrl), verification status (Pending →
 * Verified, or Expired) and the standard record lifecycle. Uploads go
 * through the Upload modal (vendor + category + file → dataUrl, new
 * uploads start Pending); previews render through the shared
 * AttachmentPreview viewer (PDF / image / text / video / audio inline,
 * everything else a download panel). Downloads use the shared
 * fetch-verified download helper.
 *
 * Route: /purchase/vendors/documents
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Archive, ArrowLeft, CheckCircle2, Clock3, Download,
  Eye, Filter, FolderOpen, RefreshCw, Search, Trash2, Undo2, Upload, X
} from 'lucide-react';
import { ConfirmDialog, FormField, Modal, SelectInput, TextArea, useToast } from '../../components/ui';
import AttachmentPreview from '../../components/AttachmentPreview';
import { TYPE_TONES, detectType, downloadAttachment, fileTypeLabel, formatSize } from '../../utils/attachmentFile';
import {
  PurchaseListPage,
  PurchaseSearch,
  PurchaseExportDropdown,
  PurchaseColumnsDropdown,
  PurchaseStatusCell
} from '../../components/list';
import {
  VENDOR_DOCUMENT_CATEGORIES,
  VENDOR_DOCUMENT_COLUMNS,
  VENDOR_DOCUMENT_STATUS,
  VENDOR_DOCUMENT_STATUSES
} from '../../constants';
import { formatDate } from '../../utils/helpers';
import { pendingWorkClass } from '../../utils/pendingHighlight';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import { vendorDocumentService } from '../../services/vendorDocuments';
import useDebounce from '../../hooks/useDebounce';
import usePurchaseList from '../../hooks/usePurchaseList';
import ModuleTabNav from '../../components/ModuleTabNav';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

/* ============================== CONSTANTS ============================== */

/** KPI cards rendered above the table. */
const KPI_DEFS = [
  { key: 'total', label: 'Total Documents', icon: FolderOpen, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'verified', label: 'Verified', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'pending', label: 'Pending Verification', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'expired', label: 'Expired', icon: AlertTriangle, color: '#dc2626', bg: 'rgba(220,38,38,0.10)' }
];

/** KPI key → document status filter. */
const STATUS_FILTER_MAP = {
  verified: VENDOR_DOCUMENT_STATUS.VERIFIED,
  pending: VENDOR_DOCUMENT_STATUS.PENDING,
  expired: VENDOR_DOCUMENT_STATUS.EXPIRED
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function VendorDocuments() {
  const toast = useToast();

  /* Lifecycle tab — declared BEFORE the fetchPage memo (TDZ-safe, the
     same pattern as the NFA / RFQ lists). */
  const [tab, setTab] = useState('active');
  const [columns, setColumns] = useState(() => VENDOR_DOCUMENT_COLUMNS.map((col) => ({ ...col })));
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [stats, setStats] = useState(null);
  const [statsVersion, setStatsVersion] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState({});
  const [activeKpi, setActiveKpi] = useState('total');

  /* Upload modal state. */
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadVendors, setUploadVendors] = useState([]);
  const [uploadForm, setUploadForm] = useState({ vendorId: '', category: '', notes: '' });
  const [fileMeta, setFileMeta] = useState(null);
  const [fileDataUrl, setFileDataUrl] = useState('');
  const fileInputRef = useRef(null);

  /* Preview modal state. */
  const [previewDoc, setPreviewDoc] = useState(null);

  /* Vendor options for the upload picker + vendor filter. */
  useEffect(() => {
    let cancelled = false;
    vendorDocumentService
      .getDocumentVendors()
      .then((vendors) => {
        if (!cancelled) setUploadVendors(vendors || []);
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err?.message || 'Failed to load vendors');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const fetchPage = useMemo(
    () => async ({ search, filters, page, pageSize, sortKey, sortDirection }) =>
      vendorDocumentService.getDocuments({
        search,
        status: filters.status && filters.status !== 'All' ? filters.status : 'All',
        category: filters.category && filters.category !== 'All' ? filters.category : 'All',
        vendor: filters.vendor && filters.vendor !== 'All' ? filters.vendor : 'All',
        recordState: tab,
        page,
        pageSize,
        sortKey,
        sortDirection
      }),
    [tab]
  );

  const {
    records,
    loading,
    actionLoading,
    error,
    pagination: { page, pageSize, totalCount },
    search,
    sortKey,
    sortDirection,
    filters,
    setSearch,
    setFilter,
    resetFilters,
    goToPage,
    changePageSize,
    toggleSort,
    refresh,
    runMutation
  } = usePurchaseList(fetchPage, { pageSize: 10, sortKey: 'uploadedAt', sortDir: 'desc' });

  const debouncedSearch = useDebounce(searchInput, 400);

  /* Debounced search → hook (declared AFTER the usePurchaseList
     destructure — setSearch must be initialized before the effect's
     dependency array is evaluated, or the page throws a TDZ
     "Cannot access 'setSearch' before initialization" error). */
  useEffect(() => {
    queueMicrotask(() => {
      setSearch(debouncedSearch);
      setSelectedIds([]);
    });
  }, [debouncedSearch, setSearch]);

  /* Stats (KPI cards + tab counts). */
  useEffect(() => {
    let cancelled = false;
    vendorDocumentService
      .getDocumentStats()
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [statsVersion, tab]);

  const visibleColumns = useMemo(() => columns.filter((col) => col.visible !== false), [columns]);

  const toggleColumn = (key) =>
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  const showAllColumns = () =>
    setColumns((prev) => prev.map((col) => (col.key === 'actions' ? col : { ...col, visible: true })));
  const hideAllColumns = () =>
    setColumns((prev) =>
      prev.map((col) => (col.key === 'docNo' || col.key === 'actions' ? col : { ...col, visible: false }))
    );

  const refreshPage = () => {
    refresh();
    setStatsVersion((v) => v + 1);
  };

  const selectKpi = (key) => {
    if (key === activeKpi) {
      setActiveKpi('total');
      setFilter('status', 'All');
    } else {
      setActiveKpi(key);
      setFilter('status', STATUS_FILTER_MAP[key] || 'All');
    }
    setSelectedIds([]);
  };

  /* Primary tab — the full Active list. */
  const primaryTab = { label: 'All Documents', count: stats?.total ?? 0 };

  const goActive = () => {
    setActiveKpi('total');
    setFilter('status', 'All');
    setTab('active');
    setSelectedIds([]);
    refresh();
  };

  const kpiCards = KPI_DEFS.map((card) => ({
    ...card,
    value: String(stats?.[card.key] ?? 0)
  }));

  const tabs = [
    { key: 'active', label: 'Active', count: stats?.active ?? 0 },
    { key: 'archived', label: 'Archived', count: stats?.archived ?? 0 },
    { key: 'deleted', label: 'Deleted', count: stats?.deleted ?? 0 }
  ];

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize) || 1);
  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}-${Math.min(page * pageSize, totalCount)} of ${totalCount}`;

  /* ---------- upload helpers ---------- */

  const resetUploadForm = () => {
    setUploadForm({ vendorId: '', category: '', notes: '' });
    setFileMeta(null);
    setFileDataUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileMeta({ name: file.name, size: file.size, type: file.type });
    const reader = new FileReader();
    reader.onload = () => setFileDataUrl(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const submitUpload = async () => {
    if (!uploadForm.vendorId) {
      toast.error('Select a vendor for the document');
      return;
    }
    if (!fileMeta) {
      toast.error('Choose a file to upload');
      return;
    }
    const vendor = uploadVendors.find((entry) => entry.id === uploadForm.vendorId);
    const result = await runMutation(() =>
      vendorDocumentService.createDocument({
        vendorId: uploadForm.vendorId,
        vendorName: vendor?.name || '',
        category: uploadForm.category || VENDOR_DOCUMENT_CATEGORIES[VENDOR_DOCUMENT_CATEGORIES.length - 1],
        name: fileMeta.name,
        type: detectType(fileMeta.name, fileMeta.type),
        size: fileMeta.size,
        dataUrl: fileDataUrl,
        notes: uploadForm.notes
      })
    );
    if (result.ok) {
      toast.success(`${result.data.docNo} uploaded — pending verification`);
      setUploadOpen(false);
      resetUploadForm();
      refreshPage();
    } else {
      toast.error(result.error?.message || 'Failed to upload document');
    }
  };

  /* ---------- row / bulk actions ---------- */

  const buildRowActions = (row) => {
    if (tab !== 'active') {
      return [
        { key: 'preview', label: 'Preview', icon: Eye },
        { key: 'restore', label: 'Restore', icon: Undo2, success: true },
        { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
      ];
    }
    const actions = [
      { key: 'preview', label: 'Preview', icon: Eye },
      { key: 'download', label: 'Download', icon: Download }
    ];
    if (row.status === VENDOR_DOCUMENT_STATUS.PENDING) {
      actions.push({ key: 'verify', label: 'Verify', icon: CheckCircle2 });
    }
    if (row.status !== VENDOR_DOCUMENT_STATUS.EXPIRED) {
      actions.push({ key: 'expire', label: 'Mark Expired', icon: AlertTriangle, danger: true });
    }
    actions.push({ divider: true });
    actions.push({ key: 'archive', label: 'Archive', icon: Archive });
    actions.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });
    return actions;
  };

  const handleRowAction = async (key, row) => {
    if (key === 'preview') {
      setPreviewDoc(row);
    } else if (key === 'download') {
      const ok = await downloadAttachment(row);
      if (!ok) toast.error('This file could not be downloaded — it may have been moved or deleted.');
      else toast.success(`Downloading ${row.name}`);
    } else if (key === 'verify') {
      const result = await runMutation(() => vendorDocumentService.verifyDocument(row.id));
      if (result.ok) {
        toast.success(`${row.docNo} verified`);
        setStatsVersion((v) => v + 1);
        setSelectedIds((prev) => prev.filter((id) => id !== row.id));
      } else toast.error(result.error?.message || 'Failed to verify document');
    } else if (key === 'expire') {
      const result = await runMutation(() => vendorDocumentService.markExpired(row.id));
      if (result.ok) {
        toast.success(`${row.docNo} marked expired`);
        setStatsVersion((v) => v + 1);
        setSelectedIds((prev) => prev.filter((id) => id !== row.id));
      } else toast.error(result.error?.message || 'Failed to mark document expired');
    } else if (key === 'archive') {
      const result = await runMutation(() => vendorDocumentService.archiveDocument(row.id));
      if (result.ok) toast.success(`${row.docNo} archived`);
      else toast.error(result.error?.message || 'Failed to archive document');
    } else if (key === 'restore') {
      const result = await runMutation(() => vendorDocumentService.restoreDocument(row.id));
      if (result.ok) toast.success(`${row.docNo} restored to active`);
      else toast.error(result.error?.message || 'Failed to restore document');
    } else if (key === 'delete') {
      setPendingDelete({ id: row.id, docNo: row.docNo });
      setDeleteOpen(true);
    }
  };

  const fetchAll = () =>
    vendorDocumentService
      .getDocuments({
        search,
        status: filters.status && filters.status !== 'All' ? filters.status : 'All',
        category: filters.category && filters.category !== 'All' ? filters.category : 'All',
        vendor: filters.vendor && filters.vendor !== 'All' ? filters.vendor : 'All',
        recordState: tab,
        page: 1,
        pageSize: 10000
      })
      .then((result) => result.data);

  const handleExport = async (type) => {
    try {
      const rows = await fetchAll();
      if (type === 'pdf') await exportPdf({ title: 'Vendor Sourcing Register', columns, records: rows, filename: 'vendor-documents' });
      else if (type === 'excel') await exportExcel(columns, rows, 'vendor-documents');
      else if (type === 'csv') exportCsv(columns, rows, 'vendor-documents');
      else if (type === 'print') printTable('Vendor Sourcing Register', columns, rows);
      toast.success('Documents exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export documents');
    }
  };

  const handleBulk = async (key, ids) => {
    if (key === 'delete') {
      setPendingDelete({ bulk: ids });
      setDeleteOpen(true);
      return;
    }
    if (key === 'archive') {
      const result = await runMutation(() => vendorDocumentService.bulkArchive(ids));
      if (result.ok) {
        toast.success(`${ids.length} document(s) archived`);
        setSelectedIds([]);
        setStatsVersion((v) => v + 1);
      } else toast.error(result.error?.message || 'Failed to archive documents');
    } else if (key === 'restore') {
      const result = await runMutation(() => vendorDocumentService.bulkRestore(ids));
      if (result.ok) {
        toast.success(`${ids.length} document(s) restored`);
        setSelectedIds([]);
        setStatsVersion((v) => v + 1);
      } else toast.error(result.error?.message || 'Failed to restore documents');
    } else if (key === 'export') {
      try {
        const rows = await fetchAll();
        const selected = rows.filter((row) => ids.includes(row.id));
        if (selected.length === 0) {
          toast.info('No documents selected to export');
          return;
        }
        exportCsv(columns, selected, 'vendor-documents-selected');
        toast.success(`${selected.length} document(s) exported`);
      } catch (err) {
        toast.error(err?.message || 'Failed to export documents');
      }
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    if (pendingDelete.bulk) {
      const result = await runMutation(() => vendorDocumentService.bulkDelete(pendingDelete.bulk));
      if (result.ok) {
        toast.success(`${pendingDelete.bulk.length} documents moved to Deleted`);
        setSelectedIds([]);
      } else toast.error(result.error?.message || 'Failed to delete documents');
    } else {
      const result = await runMutation(() => vendorDocumentService.deleteDocument(pendingDelete.id));
      if (result.ok) toast.success(`${pendingDelete.docNo} moved to Deleted`);
      else toast.error(result.error?.message || 'Failed to delete document');
    }
    setDeleteOpen(false);
    setPendingDelete(null);
    setStatsVersion((v) => v + 1);
  };

  /* ---------- filters ---------- */

  const applyFilters = () => {
    ['status', 'category', 'vendor'].forEach((key) => {
      const value = draftFilters[key] || '';
      setFilter(key, value || 'All');
    });
    setSelectedIds([]);
    setFilterOpen(false);
  };

  const resetAll = () => {
    setDraftFilters({});
    resetFilters();
    setSearchInput('');
    setSelectedIds([]);
    setActiveKpi('total');
  };

  const toggleFilters = () => {
    const next = !filterOpen;
    if (next) {
      setDraftFilters(
        ['status', 'category', 'vendor'].reduce((acc, key) => {
          const value = filters[key];
          if (value && value !== 'All') acc[key] = value;
          return acc;
        }, {})
      );
    }
    setFilterOpen(next);
  };

  const activeFilterCount = ['status', 'category', 'vendor'].filter(
    (key) => filters[key] && filters[key] !== 'All'
  ).length;

  const bulkActions = useMemo(() => {
    const actions = [{ key: 'export', label: 'Export', icon: Download }];
    if (tab === 'active') {
      actions.push({ key: 'archive', label: 'Archive', icon: Archive });
      actions.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });
    } else {
      actions.unshift({ key: 'restore', label: 'Restore', icon: Undo2 });
      actions.splice(1, 0, { key: 'delete', label: 'Delete', icon: Trash2, danger: true });
    }
    return actions;
  }, [tab]);

  /* ---------- renderers ---------- */

  const renderCell = useMemo(
    () => ({
      docNo: (row) => <span className="font-bold text-slate-800">{row.docNo}</span>,
      document: (row) => {
        const kind = detectType(row.name, row.type);
        const meta = TYPE_TONES[kind] || TYPE_TONES.other;
        const Icon = meta.Icon;
        return (
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1.5 rounded-md shrink-0" style={{ background: meta.bg, color: meta.color }}>
              <Icon className="w-3.5 h-3.5" />
            </span>
            <span className="cpr-cell-truncate" title={row.name}>
              <span className="font-semibold text-slate-800">{row.name}</span>
              <span className="block text-[10px] font-medium text-slate-400">{fileTypeLabel(row.name, kind)}</span>
            </span>
          </div>
        );
      },
      vendorName: (row) => (
        <span className="cpr-cell-truncate" title={row.vendorName}>{row.vendorName || '—'}</span>
      ),
      category: (row) => <span className="text-slate-600">{row.category || '—'}</span>,
      size: (row) => <span className="tabular-nums text-slate-600 whitespace-nowrap">{formatSize(row.size)}</span>,
      status: (row) => {
        const label =
          tab === 'active' ? row.status || VENDOR_DOCUMENT_STATUS.PENDING : tab === 'archived' ? 'Archived' : 'Deleted';
        return <PurchaseStatusCell status={label} />;
      },
      uploadedBy: (row) => <span className="cpr-cell-muted">{row.uploadedBy || '—'}</span>,
      uploadedDate: (row) => <span className="cpr-cell-muted">{formatDate(row.uploadedAt) || '—'}</span>
    }),
    [tab]
  );

  const hasFilters = Boolean(search) || activeFilterCount > 0;
  const allSelected = records.length > 0 && records.every((row) => selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  const selectedVendorName = uploadForm.vendorId
    ? uploadVendors.find((entry) => entry.id === uploadForm.vendorId)?.name || ''
    : '';

  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'Vendor Management' },
          { label: 'Vendor Sourcing' }
        ],
        icon: FolderOpen,
        title: 'Vendor Sourcing',
        subtitle: 'Central register of vendor sourcing documents — registrations, certifications, tax records and agreements',
        actions: (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={refreshPage}>
              <RefreshCw size={12} /> Refresh
            </button>
            <button type="button" className="erp-btn-primary" onClick={() => setUploadOpen(true)}>
              <span className="erp-btn-icon"><Upload size={16} /></span> Upload Document
            </button>
          </>
        )
      }}
      flowNav={<ModuleTabNav module="vendors" />}
      error={error}
      onRetry={refreshPage}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi }}
      tabs={{
        primary: { ...primaryTab, onSelect: goActive },
        segments: {
          tabs,
          activeKey: tab,
          onSelect: (key) => {
            if (key !== 'active') {
              setActiveKpi('total');
              setFilter('status', 'All');
            }
            setTab(key);
            setSelectedIds([]);
            refresh();
          },
          ariaLabel: 'Document register lifecycle'
        }
      }}
      toolbar={{
        count: pageInfo,
        left: (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={toggleFilters}
              aria-label="Toggle filters"
              aria-expanded={filterOpen}
            >
              <Filter size={12} /> {filterOpen ? 'Hide Filters' : 'Show Filters'}
            </button>
            {(searchInput || activeFilterCount > 0) && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                <X size={12} /> Clear
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={refreshPage}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        ),
        right: (
          <>
            <PurchaseSearch
              id="vendorDocumentsSearchInput"
              placeholder="Search Doc No, File, Vendor, Category..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search documents"
            />
            <PurchaseExportDropdown buttonLabel="Export" onExport={handleExport} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
            />
          </>
        )
      }}
      filters={{
        open: filterOpen,
        panelId: 'vendorDocumentsFilterPanel',
        onApply: applyFilters,
        onReset: resetAll,
        groups: [
          {
            key: 'status', id: 'vd-status', label: 'Status', value: draftFilters.status || 'All',
            options: [{ value: 'All', label: 'All Statuses' }, ...VENDOR_DOCUMENT_STATUSES.map((value) => ({ value, label: value }))],
            onChange: (value) => setDraftFilters((prev) => ({ ...prev, status: value }))
          },
          {
            key: 'category', id: 'vd-category', label: 'Category', value: draftFilters.category || 'All',
            options: [{ value: 'All', label: 'All Categories' }, ...VENDOR_DOCUMENT_CATEGORIES.map((value) => ({ value, label: value }))],
            onChange: (value) => setDraftFilters((prev) => ({ ...prev, category: value }))
          },
          {
            key: 'vendor', id: 'vd-vendor', label: 'Vendor', value: draftFilters.vendor || 'All',
            options: [
              { value: 'All', label: 'All Vendors' },
              ...uploadVendors.map((vendor) => ({ value: vendor.id, label: vendor.name }))
            ],
            onChange: (value) => setDraftFilters((prev) => ({ ...prev, vendor: value }))
          }
        ]
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: bulkActions,
        onAction: (key) => handleBulk(key, selectedIds),
        id: 'vendorDocumentsBulkActionBar'
      }}
      table={{
        columns: visibleColumns,
        rows: records,
        loading,
        selectable: true,
        selectedIds,
        allSelected,
        someSelected,
        onSelectAll: (checked) => setSelectedIds(checked ? records.map((row) => row.id) : []),
        onToggleRow: (id) =>
          setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])),
        sortKey,
        sortDirection,
        onSort: toggleSort,
        renderers: renderCell,
        /* Pending highlight — the shared light-orange wash on the
           doc-number cell for documents awaiting verification. */
        rowClass: (row) => pendingWorkClass(tab === 'active' && row.status === VENDOR_DOCUMENT_STATUS.PENDING),
        rowActions: buildRowActions,
        onRowAction: handleRowAction,
        idColumn: 'docNo',
        tableId: 'vendorDocumentsTable',
        getRowId: (row) => row.id,
        emptyContent:
          tab === 'deleted' ? (
            <div className="cpr-empty">
              <Trash2 size={48} aria-hidden="true" />
              <h3>No Deleted Documents</h3>
              <p>Your trash is empty. Deleted documents will appear here.</p>
              <button type="button" className="btn btn-primary" onClick={() => setTab('active')}>
                <ArrowLeft size={14} /> Back to Active Documents
              </button>
            </div>
          ) : tab === 'archived' ? (
            <div className="cpr-empty">
              <Archive size={48} aria-hidden="true" />
              <h3>No Archived Documents</h3>
              <p>{hasFilters ? 'No archived documents matching your search criteria.' : 'Archived documents will appear here.'}</p>
            </div>
          ) : hasFilters ? (
            <div className="cpr-empty">
              <Search size={48} aria-hidden="true" />
              <h3>No Matching Documents</h3>
              <p>No documents matching your search criteria.</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                <X size={12} /> Clear Search
              </button>
            </div>
          ) : (
            <div className="cpr-empty">
              <FolderOpen size={48} aria-hidden="true" />
              <h3>No Documents Found</h3>
              <p>Upload the first vendor document to start the register.</p>
              <button type="button" className="erp-btn-primary" onClick={() => setUploadOpen(true)}>
                <span className="erp-btn-icon"><Upload size={16} /></span> Upload Document
              </button>
            </div>
          )
      }}
      pagination={{
        page,
        totalPages,
        pageSize,
        pageSizeOptions: PAGE_SIZE_OPTIONS,
        pageInfo,
        onPageChange: goToPage,
        onPageSizeChange: changePageSize
      }}
    >
      {/* ===== UPLOAD MODAL ===== */}
      <Modal
        open={uploadOpen}
        onClose={() => {
          setUploadOpen(false);
          resetUploadForm();
        }}
        title="Upload Vendor Document"
        maxWidth="max-w-lg"
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setUploadOpen(false);
                resetUploadForm();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="erp-btn-primary"
              disabled={actionLoading}
              onClick={submitUpload}
            >
              <span className="erp-btn-icon"><Upload size={16} /></span> Upload Document
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Vendor" required>
            <SelectInput
              value={uploadForm.vendorId}
              onChange={(e) => setUploadForm((prev) => ({ ...prev, vendorId: e.target.value }))}
            >
              <option value="">Select vendor...</option>
              {uploadVendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </SelectInput>
          </FormField>

          <FormField label="Category">
            <SelectInput
              value={uploadForm.category}
              onChange={(e) => setUploadForm((prev) => ({ ...prev, category: e.target.value }))}
            >
              {VENDOR_DOCUMENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </SelectInput>
          </FormField>

          <FormField label="File" required>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              aria-label="Choose document file"
            />
            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-xs font-bold text-slate-500 hover:border-[#0B4A3D] hover:text-[#0B4A3D] transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              {fileMeta ? (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  {fileMeta.name} · {formatSize(fileMeta.size)}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Choose a file to upload
                </span>
              )}
            </button>
          </FormField>

          {selectedVendorName && (
            <p className="text-[11px] text-slate-400">
              Uploading for <span className="font-semibold text-slate-600">{selectedVendorName}</span> — new uploads
              start as <span className="font-semibold text-amber-600">Pending</span> verification.
            </p>
          )}

          <FormField label="Notes">
            <TextArea
              rows={3}
              value={uploadForm.notes}
              onChange={(e) => setUploadForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional notes — document purpose, reference, expiry reminders…"
            />
          </FormField>
        </div>
      </Modal>

      {/* ===== PREVIEW MODAL (shared AttachmentPreview viewer) ===== */}
      <AttachmentPreview
        key={previewDoc?.id || 'preview-none'}
        open={Boolean(previewDoc)}
        attachment={previewDoc}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.name}
        maxWidth="max-w-3xl"
      />

      {/* ===== DELETE CONFIRM ===== */}
      <ConfirmDialog
        open={deleteOpen}
        title={pendingDelete?.bulk ? 'Delete selected documents?' : 'Delete document?'}
        message={
          pendingDelete?.bulk
            ? `This will move ${pendingDelete.bulk.length} selected document(s) to the Deleted tab. You can restore them later.`
            : `This will move ${pendingDelete?.docNo || 'this document'} to the Deleted tab. You can restore it later.`
        }
        confirmLabel="Delete"
        variant="danger"
        icon={Trash2}
        loading={actionLoading}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteOpen(false);
          setPendingDelete(null);
        }}
      />
    </PurchaseListPage>
  );
}
