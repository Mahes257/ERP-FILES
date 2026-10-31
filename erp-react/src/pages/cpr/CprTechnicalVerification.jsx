import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FileText, CheckCircle, XCircle, Eye, Download, Trash2, Upload,
  Search, Filter, Clock, AlertTriangle, Send, FolderOpen,
  ClipboardList, RefreshCw, Edit2, ArrowLeft, ArrowRight, ChevronDown, ChevronLeft,
  ChevronRight, Settings, Calculator
} from 'lucide-react';
import technicalVerificationService from '../../services/technicalVerificationService';
import { downloadFile, openFileInNewTab } from '../../utils/fileAccess';
import EditHistoryTimeline from '../../components/EditHistory/EditHistoryTimeline';
// Shared portal row-menu: renders into document.body with fixed positioning
// computed from the trigger, so it can never be clipped by the table's
// overflow containers (see ../../components/Common/ActionMenu.jsx).
import ActionMenu from '../../components/Common/ActionMenu';
import '../crm/crm-erp.css';

// ============================== STATUS CONFIG ==============================

const STATUS_CONFIG = {
  DRAFT: { badgeClass: 'tv-badge tv-badge-gray', label: 'Draft', color: '#6b7280' },
  PENDING_FILE: { badgeClass: 'tv-badge tv-badge-orange', label: 'Pending File', color: '#ea580c' },
  UNDER_VERIFICATION: { badgeClass: 'tv-badge tv-badge-blue', label: 'Under Verification', color: '#2563eb' },
  VERIFICATION_COMPLETED: { badgeClass: 'tv-badge tv-badge-purple', label: 'Verified', color: '#7c3aed' },
  FORWARDED_TO_COST_WORKOUT: { badgeClass: 'tv-badge tv-badge-green', label: 'Forwarded to Cost Workout', color: '#059669' },
  FORWARDED_TO_PURCHASE_REQUISITION: { badgeClass: 'tv-badge tv-badge-green', label: 'Forwarded to Purchase Requisition', color: '#059669' },
  APPROVED: { badgeClass: 'tv-badge tv-badge-green', label: 'Verified', color: '#059669' },
  REJECTED: { badgeClass: 'tv-badge tv-badge-red', label: 'Rejected', color: '#dc2626' }
};

const FILE_STATUS_CONFIG = {
  AVAILABLE: { badgeClass: 'tv-badge tv-badge-green', label: 'File Available', color: '#059669' },
  MISSING: { badgeClass: 'tv-badge tv-badge-red', label: 'File Not Found', color: '#dc2626' },
  PENDING: { badgeClass: 'tv-badge tv-badge-orange', label: 'Pending File', color: '#ea580c' }
};

// ============================== COMPONENTS ==============================

function Badge({ status, config }) {
  const cfg = config || STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT;
  return <span className={cfg.badgeClass}>{cfg.label}</span>;
}

function KpiCard({ label, value, icon: Icon, color, bg }) {
  return (
    <div className="tv-kpi-card">
      <div className="tv-kpi-icon" style={{ background: bg, color }}>
        <Icon size={20} />
      </div>
      <div className="tv-kpi-content">
        <div className="tv-kpi-value">{value || 0}</div>
        <div className="tv-kpi-label">{label}</div>
      </div>
    </div>
  );
}

// ============================== MAIN COMPONENT ==============================

export default function CprTechnicalVerification({ moduleTab, onModuleTabChange, embedded = false }) {
  const navigate = useNavigate();

  // Division is fixed to the internal TEAM view: the Team (Internal) /
  // Customer (External) toggle was removed from the page, and TEAM was its
  // default. Kept as state so every existing consumer (list query, KPI stats,
  // document visibility, conversion gates) keeps reading the same value.
  const [activeDivision] = useState('TEAM');

  // View state
  const [selectedTv, setSelectedTv] = useState(null);
  const [listData, setListData] = useState({ content: [], totalElements: 0, totalPages: 0 });
  const [stats, setStats] = useState({ total: 0, draft: 0, fileAvailable: 0, fileNotFound: 0, underVerification: 0, verified: 0, rejected: 0, forwarded: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [size] = useState(10);

  // Detail panel
  const [detailLoading, setDetailLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploading, setUploading] = useState(false);

  // Preview
  const [previewDoc, setPreviewDoc] = useState(null);

  // Status flow modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusAction, setStatusAction] = useState('');
  const [statusRemarks, setStatusRemarks] = useState('');

  // In-flight guard for the dedicated "Verified" action so a double click can
  // never fire two transitions for the same record.
  const [verifying, setVerifying] = useState(false);

  // Forward to CW modal
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [cwList, setCwList] = useState([]);
  const [selectedCwId, setSelectedCwId] = useState('');

  // Item-level conversion (Cost Workout / Purchase Requisition)
  const [converting, setConverting] = useState(false);
  const [conversionResult, setConversionResult] = useState(null);

  // Create form
  const [searchParams] = useSearchParams();
  const [view, setView] = useState(() => searchParams.get('view') === 'create' ? 'create' : 'list'); // 'list' | 'create'
  const [cprList, setCprList] = useState([]);
  const [selectedCprId, setSelectedCprId] = useState('');
  const [cprItems, setCprItems] = useState([]);
  const [createForm, setCreateForm] = useState({
    drawingNumber: '',
    itemDescription: '',
    itemNo: '',
    cprItemId: null,
    fileExists: false,
    technicalRemarks: '',
    internalRemarks: '',
    customerRemarks: '',
    nextReviewDate: ''
  });

  // CPR detail (full record fetched from backend when CPR is selected)
  const [selectedCprDetail, setSelectedCprDetail] = useState(null);
  const [cprDetailLoading, setCprDetailLoading] = useState(false);
  const [cprDetailError, setCprDetailError] = useState(null);
  const cprRequestIdRef = useRef(0);

  // Actions menu

  // ============================== ITEM-LEVEL (per-CPR) VERIFICATION ==============================
  const [itemView, setItemView] = useState(() => searchParams.get('view') === 'items' || !!searchParams.get('cprId'));
  const [itemCprList, setItemCprList] = useState([]);
  const [itemCprId, setItemCprId] = useState(searchParams.get('cprId') || '');
  const [itemTvList, setItemTvList] = useState([]);
  const [itemItems, setItemItems] = useState([]);
  const [itemLoading, setItemLoading] = useState(false);
  const [itemError, setItemError] = useState(null);
  const [busyItemId, setBusyItemId] = useState(null);
  const [itemStatusModal, setItemStatusModal] = useState({ tv: null, action: '', remarks: '' });

  // ============================== DATA LOADING ==============================

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, size };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      params.division = activeDivision;
      const data = await technicalVerificationService.list(params);
      setListData(data);
    } catch (err) {
      setError(err.message || 'Failed to load technical verifications');
    } finally {
      setLoading(false);
    }
  }, [page, size, search, statusFilter, activeDivision]);

  const loadStats = useCallback(async () => {
    try {
      const data = await technicalVerificationService.getStats(activeDivision);
      setStats(data.data || data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, [activeDivision]);

  useEffect(() => {
    loadList();
    loadStats();
  }, [loadList, loadStats]);

  // Load CPR list when entering create view (e.g. via ?view=create URL param)
  useEffect(() => {
    if (view === 'create' && cprList.length === 0) {
      loadCprs();
    }
  }, [view]);

  // Select the row named in the URL (?id=, used by Documents → Open Related
  // Record) and fall back to the first row when nothing is requested.
  useEffect(() => {
    const list = listData.content;
    if (!list || list.length === 0 || selectedTv) return;
    const requestedId = Number(searchParams.get('id'));
    const requested = Number.isFinite(requestedId) && requestedId > 0
      ? list.find((tv) => Number(tv.id) === requestedId)
      : null;
    openDetail(requested || list[0]);
  }, [listData.content]);

  // ============================== ACTIONS ==============================

  const openDetail = async (tv) => {
    try {
      setDetailLoading(true);
      const data = await technicalVerificationService.get(tv.id);
      setSelectedTv(data.data || data);
      setEditMode(false);
      // The notice belongs to the row that produced it, not the next one opened.
      setConversionResult(null);
    } catch (err) {
      setError(err.message || 'Failed to load details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleStatusChange = async () => {
    if (!selectedTv || !statusAction) return;
    try {
      setDetailLoading(true);
      const result = await technicalVerificationService.updateStatus(selectedTv.id, statusAction, statusRemarks);
      setSelectedTv(result.data || result);
      setShowStatusModal(false);
      setStatusRemarks('');
      loadStats();
      loadList();
    } catch (err) {
      setError(err.message || 'Failed to update status');
    } finally {
      setDetailLoading(false);
    }
  };

  // ============================== VERIFY ==============================
  // Marks the SELECTED record as Verified (UNDER_VERIFICATION ->
  // VERIFICATION_COMPLETED) through the existing authenticated status endpoint
  // (PATCH /cpr-technical-verifications/{id}/status). The backend owns the
  // transition rule — only a record that is currently UNDER_VERIFICATION may be
  // verified — so a rejected transition surfaces as the existing error banner and
  // never flips the panel to Verified. Nothing is written locally: the panel is
  // reconciled from the API response and the table/stats are reloaded, so the
  // backend response is the single source of truth.
  const handleVerify = async () => {
    if (!selectedTv || verifying) return;
    if (selectedTv.status !== 'UNDER_VERIFICATION') return;
    const tvId = selectedTv.id;
    try {
      setVerifying(true);
      setError(null);
      const result = await technicalVerificationService.updateStatus(tvId, 'VERIFICATION_COMPLETED');
      const updated = result?.data || result;
      // Only reconcile when the backend answered with the verified record.
      if (updated && (updated.id === tvId || updated.tvNo)) {
        setSelectedTv(updated);
      } else {
        await openDetail(selectedTv);
      }
      loadStats();
      loadList();
    } catch (err) {
      // Keep the original status — the API is the source of truth.
      setError(err.message || 'Failed to mark this item as Verified');
    } finally {
      setVerifying(false);
    }
  };

  const handleUpdateDivision = async (division) => {
    if (!selectedTv) return;
    try {
      setDetailLoading(true);
      const result = await technicalVerificationService.updateDivision(selectedTv.id, division);
      setSelectedTv(result.data || result);
      loadStats();
      loadList();
    } catch (err) {
      setError(err.message || 'Failed to update division');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleForward = async () => {
    if (!selectedTv || !selectedCwId) return;
    try {
      setDetailLoading(true);
      const result = await technicalVerificationService.forwardToCostWorkout(selectedTv.id, parseInt(selectedCwId));
      setSelectedTv(result.data || result);
      setShowForwardModal(false);
      setSelectedCwId('');
      // The table row carries the same status as the panel — refresh it too, or
      // the moved row would keep showing its previous badge until another load.
      loadList();
      loadStats();
    } catch (err) {
      setError(err.message || 'Failed to forward to Cost Workout');
    } finally {
      setDetailLoading(false);
    }
  };

  /**
   * Convert the ONE item behind a verification row into a Cost Workout or a
   * Purchase Requisition.
   *
   * The browser sends only the row id — the backend reads the real CPR item and
   * CPR header, so sibling items of the same CPR are never carried across and the
   * destination can never be assembled client-side. The call is idempotent, so a
   * second click opens the record created the first time instead of duplicating it.
   */
  const handleConvert = async (tv, destination) => {
    if (!tv || converting) return;
    try {
      setConverting(true);
      setError(null);
      setConversionResult(null);
      const result = destination === 'CW'
        ? await technicalVerificationService.convertToCostWorkout(tv.id)
        : await technicalVerificationService.convertToPurchaseRequisition(tv.id);
      setConversionResult(result);
      const refreshed = await technicalVerificationService.get(tv.id);
      setSelectedTv(refreshed?.data || refreshed || tv);
      loadStats();
      loadList();
    } catch (err) {
      setError(err.message || `Failed to convert this item to ${destination === 'CW' ? 'Cost Workout' : 'Purchase Requisition'}`);
    } finally {
      setConverting(false);
    }
  };

  /** Open the destination record the conversion created so it can be edited and saved. */
  const openConvertedDestination = (result) => {
    if (!result?.destinationId) return;
    // The Purchase Requisition lives in TARGET's Purchase module (/purchase/...),
    // which owns the PR routes — the SOURCE /purchase-requisitions pages are not
    // part of this CPR migration.
    navigate(result.destination === 'CW'
      ? `/cost-workouts/${result.destinationId}/edit`
      : `/purchase/requisition/${result.destinationId}/edit`);
  };

  const handleUpload = async (tvId, files, visibility = 'TEAM_ONLY') => {
    setUploading(true);
    setUploadProgress({});
    try {
      for (const file of files) {
        await technicalVerificationService.addDocument(tvId, file, visibility, (loaded, total) => {
          setUploadProgress(prev => ({
            ...prev,
            [file.name]: total ? Math.round((loaded / total) * 100) : 0
          }));
        });
      }
      const updated = await technicalVerificationService.get(tvId);
      setSelectedTv(updated.data || updated);
      setUploadProgress({});
      loadList();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteTv = async (id) => {
    if (!confirm('Delete this Technical Verification?')) return;
    try {
      await technicalVerificationService.delete(id);
      // Only clear the detail panel when the DELETED record was the selected one;
      // deleting a different row must not wipe the record the user is reading.
      if (!selectedTv || selectedTv.id === id) {
        setSelectedTv(null);
        setConversionResult(null);
      }
      loadList();
      loadStats();
    } catch (err) {
      setError(err.message || 'Failed to delete');
    }
  };

  const handleDeleteDocument = async (tvId, docId) => {
    if (!confirm('Delete this document?')) return;
    try {
      await technicalVerificationService.deleteDocument(tvId, docId);
      const updated = await technicalVerificationService.get(tvId);
      setSelectedTv(updated.data || updated);
    } catch (err) {
      setError(err.message || 'Failed to delete document');
    }
  };

  const handleChangeVisibility = async (tvId, docId, visibility) => {
    try {
      await technicalVerificationService.updateDocumentVisibility(tvId, docId, visibility);
      const updated = await technicalVerificationService.get(tvId);
      setSelectedTv(updated.data || updated);
    } catch (err) {
      setError(err.message || 'Failed to update visibility');
    }
  };

  // Create form handlers
  const loadCprs = async () => {
    try {
      const data = await technicalVerificationService.listAllCprs();
      setCprList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load CPRs:', err);
      setCprList([]);
      setError(err.message || 'Failed to load CPR list. Please check your connection and try again.');
    }
  };

  // ============================== CPR DETAIL FETCHING (on CPR selection) ==============================

  useEffect(() => {
    if (!selectedCprId) {
      setSelectedCprDetail(null);
      setCprDetailError(null);
      setCprItems([]);
      setCprAttachments([]);
      setCprAttachmentsError(null);
      return;
    }

    const requestId = ++cprRequestIdRef.current;
    const controller = new AbortController();

    const fetchCprDetail = async () => {
      setCprDetailLoading(true);
      setCprAttachmentsLoading(true);
      setCprDetailError(null);
      setCprAttachmentsError(null);
      setSelectedCprDetail(null);
      setCprAttachments([]);
      try {
        const raw = await technicalVerificationService.getCprDetail(
          parseInt(selectedCprId, 10),
          { signal: controller.signal }
        );
        if (requestId !== cprRequestIdRef.current) return;

        // Defensive unwrap: if service returned ApiResponse wrapper, extract inner data
        const detail = raw?.data ?? raw;
        if (!detail || !detail.id) {
          throw new Error('Invalid CPR response from server');
        }

        // If items are missing from the detail response, fetch them separately
        let items = detail.items || [];
        if (items.length === 0) {
          try {
            const itemsRaw = await technicalVerificationService.getCprItems(parseInt(selectedCprId, 10));
            const itemsData = itemsRaw?.data ?? itemsRaw;
            if (Array.isArray(itemsData) && itemsData.length > 0) {
              items = itemsData;
            }
          } catch (itemErr) {
            console.warn('Fallback items fetch failed:', itemErr);
          }
        }

        if (requestId !== cprRequestIdRef.current) return;
        setSelectedCprDetail({ ...detail, items });

        // Extract CPR-level attachments from the detail response
        const attachments = detail.attachments || [];
        if (requestId !== cprRequestIdRef.current) return;
        setCprAttachments(attachments);
      } catch (err) {
        if (requestId !== cprRequestIdRef.current) return;
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
        console.error('Failed to load CPR detail:', err);
        setCprDetailError(err.message || 'Failed to load CPR details');
        setSelectedCprDetail(null);
        setCprAttachmentsError('Unable to load CPR attachments. Please try again.');
      } finally {
        if (requestId === cprRequestIdRef.current) {
          setCprDetailLoading(false);
          setCprAttachmentsLoading(false);
        }
      }
    };

    fetchCprDetail();
    return () => controller.abort();
  }, [selectedCprId]);

  // Auto-populate form fields when CPR detail loads
  useEffect(() => {
    if (!selectedCprDetail) return;

    const items = selectedCprDetail.items || [];

    if (items.length === 1) {
      const item = items[0];
      setCreateForm(prev => ({
        ...prev,
        cprItemId: item.id,
        itemNo: item.drawingNo || '',
        drawingNumber: item.drawingNo || '',
        itemDescription: item.description || '',
        technicalRemarks: selectedCprDetail.remarks || prev.technicalRemarks,
        internalRemarks: selectedCprDetail.description || prev.internalRemarks
      }));
    } else if (items.length > 1) {
      setCreateForm(prev => ({
        ...prev,
        cprItemId: null,
        itemNo: '',
        drawingNumber: '',
        itemDescription: '',
        technicalRemarks: selectedCprDetail.remarks || prev.technicalRemarks,
        internalRemarks: selectedCprDetail.description || prev.internalRemarks
      }));
    } else {
      setCreateForm(prev => ({
        ...prev,
        cprItemId: null,
        itemNo: '',
        drawingNumber: '',
        itemDescription: '',
        technicalRemarks: selectedCprDetail.remarks || prev.technicalRemarks,
        internalRemarks: selectedCprDetail.description || prev.internalRemarks
      }));
    }
  }, [selectedCprDetail]);

  // Populate cprItems from the fetched CPR detail (includes all item data)
  useEffect(() => {
    if (selectedCprDetail && Array.isArray(selectedCprDetail.items)) {
      setCprItems(selectedCprDetail.items.map(item => ({
        ...item,
        hasFile: item.fileName != null && item.fileName !== '',
        hasAttachments: Array.isArray(item.attachments) && item.attachments.length > 0
      })));
    } else if (!selectedCprId) {
      setCprItems([]);
    }
  }, [selectedCprDetail, selectedCprId]);

  // Attachments state (for create view - staged before TV is saved)
  const [cprAttachments, setCprAttachments] = useState([]);
  const [cprAttachmentsLoading, setCprAttachmentsLoading] = useState(false);
  const [cprAttachmentsError, setCprAttachmentsError] = useState(null);
  const [newTvUploadProgress, setNewTvUploadProgress] = useState({});
  const [newTvUploading, setNewTvUploading] = useState(false);
  const [createdTvId, setCreatedTvId] = useState(null);
  const [createdTvDocs, setCreatedTvDocs] = useState([]);

  const handleCreate = async () => {
    if (!selectedCprId) { setError('Please select a CPR'); return; }
    try {
      setLoading(true);
      const payload = {
        cprId: parseInt(selectedCprId),
        cprItemId: createForm.cprItemId,
        itemNo: createForm.itemNo,
        drawingNumber: createForm.drawingNumber,
        itemDescription: createForm.itemDescription,
        fileExists: false,
        technicalRemarks: createForm.technicalRemarks,
        internalRemarks: createForm.internalRemarks,
        customerRemarks: createForm.customerRemarks,
        nextReviewDate: createForm.nextReviewDate || null
      };
      const result = await technicalVerificationService.create(payload);
      const tv = result.data || result;
      setSelectedTv(tv);
      setCreatedTvId(tv.id);
      setCreatedTvDocs(tv.documents || []);
      loadList();
      loadStats();
    } catch (err) { setError(err.message || 'Failed to create'); } finally { setLoading(false); }
  };

  const handleUpdate = async () => {
    if (!selectedTv) return;
    try {
      setDetailLoading(true);
      const payload = { ...editForm, cprId: selectedTv.cprId };
      const result = await technicalVerificationService.update(selectedTv.id, payload);
      setSelectedTv(result.data || result);
      setEditMode(false);
      loadList();
      // An edit can change the file/verification fields the KPI cards count.
      loadStats();
    } catch (err) { setError(err.message || 'Failed to update'); } finally { setDetailLoading(false); }
  };

  const loadCostWorkouts = async () => {
    try {
      const data = await technicalVerificationService.listAllCostWorkouts();
      setCwList(data);
    } catch (err) { console.error('Failed to load cost workouts:', err); }
  };

  // ---- Create-view attachment handlers ----

  const handleNewTvFileUpload = async (files) => {
    if (!createdTvId || !files.length) return;
    setNewTvUploading(true);
    setNewTvUploadProgress({});
    try {
      for (const file of files) {
        await technicalVerificationService.addDocument(createdTvId, file, 'TEAM_ONLY', (loaded, total) => {
          setNewTvUploadProgress(prev => ({
            ...prev,
            [file.name]: total ? Math.round((loaded / total) * 100) : 0
          }));
        });
      }
      const updated = await technicalVerificationService.get(createdTvId);
      const tv = updated.data || updated;
      setSelectedTv(tv);
      setCreatedTvDocs(tv.documents || []);
      setNewTvUploadProgress({});
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setNewTvUploading(false);
    }
  };

  const handleDeleteCreatedTvDoc = async (docId) => {
    if (!createdTvId || !confirm('Delete this attachment?')) return;
    try {
      await technicalVerificationService.deleteDocument(createdTvId, docId);
      const updated = await technicalVerificationService.get(createdTvId);
      const tv = updated.data || updated;
      setSelectedTv(tv);
      setCreatedTvDocs(tv.documents || []);
    } catch (err) {
      setError(err.message || 'Failed to delete attachment');
    }
  };

  const handleFinishCreate = () => {
    setView('list');
    setCreatedTvId(null);
    setCreatedTvDocs([]);
    setCprAttachments([]);
    setCprAttachmentsError(null);
    setCreateForm({ drawingNumber: '', itemDescription: '', itemNo: '', cprItemId: null, fileExists: false, technicalRemarks: '', internalRemarks: '', customerRemarks: '', nextReviewDate: '' });
    setSelectedCprId('');
    setSelectedCprDetail(null);
    setCprItems([]);
    loadList();
    loadStats();
  };

  // ---- Item-level verification helpers ----

  const loadItemCprs = async () => {
    try {
      const data = await technicalVerificationService.listAllCprs();
      setItemCprList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load CPRs for item verification:', err);
    }
  };

  const validateItemCpr = async (cprId) => {
    try {
      const tvResp = await technicalVerificationService.listByCpr(cprId, activeDivision);
      const tvList = Array.isArray(tvResp?.data) ? tvResp.data : (Array.isArray(tvResp) ? tvResp : []);
      setItemTvList(tvList);
      const itemsResp = await technicalVerificationService.getCprItems(cprId);
      const items = Array.isArray(itemsResp?.data) ? itemsResp.data : (Array.isArray(itemsResp) ? itemsResp : []);
      setItemItems(items);
    } catch (err) {
      setItemError(err.message || 'Failed to load CPR items for verification');
    }
  };

  const openItemView = async () => {
    setItemView(true);
    setItemError(null);
    if (!itemCprList.length) await loadItemCprs();
    if (itemCprId) validateItemCpr(itemCprId);
  };

  useEffect(() => {
    if (!itemView) return;
    if (!itemCprList.length) loadItemCprs();
    if (itemCprId) validateItemCpr(itemCprId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemView, itemCprId]);

  const refreshItemItems = async () => {
    if (!itemCprId) return;
    setItemLoading(true);
    try {
      const tvResp = await technicalVerificationService.listByCpr(itemCprId, activeDivision);
      setItemTvList(Array.isArray(tvResp?.data) ? tvResp.data : (Array.isArray(tvResp) ? tvResp : []));
    } catch (err) {
      setItemError(err.message || 'Failed to refresh verification status');
    } finally {
      setItemLoading(false);
    }
  };

  const confirmItemStatus = async () => {
    const { tv, action, remarks } = itemStatusModal;
    if (!tv) return;
    setBusyItemId(tv.id);
    setItemError(null);
    try {
      await technicalVerificationService.updateStatus(tv.id, action, remarks);
      setItemStatusModal({ tv: null, action: '', remarks: '' });
      await refreshItemItems();
      loadStats();
    } catch (err) {
      setItemError(err.message || 'Failed to update verification status');
    } finally {
      setBusyItemId(null);
    }
  };

  const handleItemUpload = async (tv, files, visibility = 'TEAM_ONLY') => {
    setBusyItemId(tv.id);
    setItemError(null);
    try {
      for (const file of files) {
        await technicalVerificationService.addDocument(tv.id, file, visibility);
      }
      await refreshItemItems();
    } catch (err) {
      setItemError(err.message || 'Upload failed');
    } finally {
      setBusyItemId(null);
    }
  };

  const openItemDoc = (url, name) => {
    if (!url) return;
    const isInline = /\.(pdf|png|jpe?g|gif|webp|svg)$/i.test(name || '');
    // These helpers are async — attach the rejection handler to the promise,
    // not a try/catch around the call (which never sees async rejections).
    (isInline ? openFileInNewTab(url) : downloadFile(url, name)).catch((err) =>
      setItemError(err?.message || 'Unable to open file')
    );
  };

  // ============================== STATUS FLOW ==============================

  const STATUS_FLOW = ['PENDING_FILE', 'UNDER_VERIFICATION', 'VERIFICATION_COMPLETED'];

  // Drives the primary status button for the states that still need a workflow
  // prompt. UNDER_VERIFICATION is intentionally absent: that transition is now
  // the dedicated "Verified" button in the action area, which writes through the
  // same status endpoint — one control, one code path, no duplicate action.
  const getNextStatusAction = (currentStatus) => {
    switch (currentStatus) {
      case 'DRAFT':
      case 'PENDING_FILE': return { action: 'UNDER_VERIFICATION', label: 'Start Verification', color: '#2563eb' };
      default: return null;
    }
  };

  // ============================== RENDER: CREATE VIEW ==============================

  if (view === 'create') {
    return (
      <div className="erp-create-scope purchase-page cpr-page tv-page">
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          .spinning { animation: spin 1s linear infinite; }
        `}</style>

        <nav className="pr-breadcrumb" aria-label="Breadcrumb">
          <span onClick={() => navigate('/dashboard')} className="pr-breadcrumb-item">Dashboard</span>
          <span className="pr-breadcrumb-sep">&rsaquo;</span>
          <span onClick={() => navigate('/cprs')} className="pr-breadcrumb-item">CPR</span>
          <span className="pr-breadcrumb-sep">&rsaquo;</span>
          <span onClick={() => setView('list')} className="pr-breadcrumb-item">Technical Verification</span>
          <span className="pr-breadcrumb-sep">&rsaquo;</span>
          <span className="pr-breadcrumb-item pr-breadcrumb-active">New</span>
        </nav>

        <div className="pr-page-header">
          <div>
            <h1><FileText size={20} /> New Technical Verification</h1>
            <p className="po-page-header-subtitle">Create a new technical verification record for a CPR</p>
          </div>
          <div className="pr-page-header-actions">
            {createdTvId ? (
              <>
                <span className="tv-badge tv-badge-green" style={{ marginRight: 8 }}>Created: {selectedTv?.tvNo || 'TV'}</span>
                <button className="erp-create-btn" onClick={handleFinishCreate}>Done</button>
              </>
            ) : (
              <>
                <button className="erp-create-btn" onClick={() => setView('list')}>Cancel</button>
                <button className="erp-create-btn" onClick={handleCreate} disabled={!selectedCprId || loading}>
                  {loading ? 'Creating...' : 'Create Verification'}
                </button>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="cpr-error-banner">
            <AlertTriangle size={14} /><span>{error}</span>
            <button onClick={() => setError(null)}>&times;</button>
          </div>
        )}

        <div className="tv-create-form">
          <div className="tv-form-card">
            <h3 className="tv-form-section-title">Select CPR</h3>
            <div className="tv-form-row">
              <div className="tv-form-group">
                <label className="tv-form-label">CPR *</label>
                <select className="tv-form-select" value={selectedCprId} onChange={(e) => setSelectedCprId(e.target.value)}>
                  <option value="">Select a CPR...</option>
                  {cprList.map(cpr => (
                    <option key={cpr.id} value={cpr.id}>{cpr.prNo}{cpr.clientName ? ` — ${cpr.clientName}` : ''}{cpr.status ? ` [${cpr.status}]` : ''}</option>
                  ))}
                </select>
                {cprList.length === 0 && !loading && (
                  <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>
                    {error ? 'Unable to load CPR records' : 'No CPR records found in the database'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {cprDetailError && (
            <div className="cpr-error-banner">
              <AlertTriangle size={14} /><span>{cprDetailError}</span>
              <button onClick={() => setCprDetailError(null)}>&times;</button>
            </div>
          )}

          {cprDetailLoading && selectedCprId && (
            <div className="tv-form-card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px', color: '#6B7280', fontSize: 13 }}>
              <RefreshCw size={14} className="spinning" style={{ animation: 'spin 1s linear infinite' }} />
              <span>Loading CPR details...</span>
            </div>
          )}

          {selectedCprDetail && !cprDetailLoading && (
            <div className="tv-form-card">
              <h3 className="tv-form-section-title">CPR Details</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px 16px', fontSize: 13 }}>
                {selectedCprDetail.prNo && (
                  <div><span style={{ color: '#6B7280' }}>CPR No: </span><strong>{selectedCprDetail.prNo}</strong></div>
                )}
                {selectedCprDetail.referencePrNo && (
                  <div><span style={{ color: '#6B7280' }}>Reference No: </span>{selectedCprDetail.referencePrNo}</div>
                )}
                {selectedCprDetail.clientName && (
                  <div><span style={{ color: '#6B7280' }}>Client: </span><strong>{selectedCprDetail.clientName}</strong></div>
                )}
                {selectedCprDetail.contactPerson && (
                  <div><span style={{ color: '#6B7280' }}>Contact: </span>{selectedCprDetail.contactPerson}</div>
                )}
                {selectedCprDetail.email && (
                  <div><span style={{ color: '#6B7280' }}>Email: </span>{selectedCprDetail.email}</div>
                )}
                {selectedCprDetail.phone && (
                  <div><span style={{ color: '#6B7280' }}>Phone: </span>{selectedCprDetail.phone}</div>
                )}
                {selectedCprDetail.company && (
                  <div><span style={{ color: '#6B7280' }}>Company: </span>{selectedCprDetail.company}</div>
                )}
                {selectedCprDetail.project && (
                  <div><span style={{ color: '#6B7280' }}>Project: </span>{selectedCprDetail.project}</div>
                )}
                {selectedCprDetail.department && (
                  <div><span style={{ color: '#6B7280' }}>Department: </span>{selectedCprDetail.department}</div>
                )}
                {selectedCprDetail.priority && (
                  <div><span style={{ color: '#6B7280' }}>Priority: </span>{selectedCprDetail.priority}</div>
                )}
                {selectedCprDetail.sourceLead && (
                  <div><span style={{ color: '#6B7280' }}>Lead No: </span>{selectedCprDetail.sourceLead || selectedCprDetail.leadNo}</div>
                )}
                {selectedCprDetail.vendor && (
                  <div><span style={{ color: '#6B7280' }}>Vendor: </span>{selectedCprDetail.vendor}</div>
                )}
                {selectedCprDetail.gst && (
                  <div><span style={{ color: '#6B7280' }}>GST: </span>{selectedCprDetail.gst}</div>
                )}
                {selectedCprDetail.pan && (
                  <div><span style={{ color: '#6B7280' }}>PAN: </span>{selectedCprDetail.pan}</div>
                )}
                {selectedCprDetail.status && (
                  <div><span style={{ color: '#6B7280' }}>Status: </span>{selectedCprDetail.status}</div>
                )}
              </div>
              {selectedCprDetail.billingAddress && (
                <div style={{ marginTop: 10, fontSize: 13 }}>
                  <span style={{ color: '#6B7280' }}>Billing Address: </span>{selectedCprDetail.billingAddress}
                </div>
              )}
              {selectedCprDetail.shippingAddress && (
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  <span style={{ color: '#6B7280' }}>Shipping Address: </span>{selectedCprDetail.shippingAddress}
                </div>
              )}
              {selectedCprDetail.description && (
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  <span style={{ color: '#6B7280' }}>Description: </span>{selectedCprDetail.description}
                </div>
              )}
              {selectedCprDetail.remarks && (
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  <span style={{ color: '#6B7280' }}>Remarks: </span>{selectedCprDetail.remarks}
                </div>
              )}
              {Array.isArray(selectedCprDetail.items) && selectedCprDetail.items.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                    CPR Items ({selectedCprDetail.items.length})
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                          <th style={{ padding: '6px 8px', color: '#6B7280' }}>#</th>
                          <th style={{ padding: '6px 8px', color: '#6B7280' }}>Drawing No</th>
                          <th style={{ padding: '6px 8px', color: '#6B7280' }}>Description</th>
                          <th style={{ padding: '6px 8px', color: '#6B7280' }}>Spec</th>
                          <th style={{ padding: '6px 8px', color: '#6B7280', textAlign: 'right' }}>Qty</th>
                          <th style={{ padding: '6px 8px', color: '#6B7280' }}>UOM</th>
                          <th style={{ padding: '6px 8px', color: '#6B7280', textAlign: 'right' }}>Est. Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCprDetail.items.map((item, idx) => (
                          <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '6px 8px', color: '#9CA3AF' }}>{idx + 1}</td>
                            <td style={{ padding: '6px 8px', fontWeight: 500 }}>{item.drawingNo || '-'}</td>
                            <td style={{ padding: '6px 8px' }}>{item.description || '-'}</td>
                            <td style={{ padding: '6px 8px' }}>{item.specification || '-'}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{item.qty ?? '-'}</td>
                            <td style={{ padding: '6px 8px' }}>{item.unit || '-'}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                              {item.estimatedCost != null ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(item.estimatedCost) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="tv-form-card">
            <h3 className="tv-form-section-title">CPR Item Details</h3>
            {cprDetailLoading && selectedCprId && <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>Loading CPR details...</div>}
            {!cprDetailLoading && cprItems.length > 0 && (
              <div className="tv-form-group" style={{ marginBottom: 12 }}>
                <label className="tv-form-label">Select CPR Item</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {cprItems.map(item => (
                    <button key={item.id} type="button"
                      className="po-btn po-btn-ghost po-btn-sm"
                      style={{
                        fontSize: 12, padding: '4px 10px', borderRadius: 6,
                        border: `1px solid ${createForm.cprItemId === item.id ? 'var(--purchase-primary)' : 'var(--purchase-border)'}`,
                        background: createForm.cprItemId === item.id ? '#e0f2fe' : '#f9fafb',
                        cursor: 'pointer'
                      }}
                      onClick={() => setCreateForm({
                        ...createForm,
                        cprItemId: item.id,
                        itemNo: item.drawingNo || '',
                        drawingNumber: item.drawingNo || '',
                        itemDescription: item.description || ''
                      })}>
                      {item.drawingNo || 'No drawing no.'}
                      {item.hasFile && <span style={{ color: '#059669', marginLeft: 4 }}>&#9679;</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!cprDetailLoading && selectedCprId && cprItems.length === 0 && selectedCprDetail && (
              <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 12 }}>
                This CPR has no items. You can still enter details manually below.
              </div>
            )}
            <div className="tv-form-row">
              <div className="tv-form-group">
                <label className="tv-form-label">Drawing Number *</label>
                <input type="text" className="tv-form-input" value={createForm.drawingNumber}
                  onChange={(e) => setCreateForm({ ...createForm, drawingNumber: e.target.value })}
                  placeholder="Enter drawing number..." />
              </div>
              <div className="tv-form-group">
                <label className="tv-form-label">Item Description *</label>
                <input type="text" className="tv-form-input" value={createForm.itemDescription}
                  onChange={(e) => setCreateForm({ ...createForm, itemDescription: e.target.value })}
                  placeholder="Enter item description..." />
              </div>
            </div>
          </div>

          <div className="tv-form-card">
            <h3 className="tv-form-section-title"><Upload size={14} /> Attachments</h3>

            {cprDetailLoading && selectedCprId && (
              <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 8 }}>Loading CPR attachments...</div>
            )}
            {cprAttachmentsError && (
              <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 8 }}>{cprAttachmentsError}</div>
            )}

            {!cprDetailLoading && !cprAttachmentsError && selectedCprId && cprAttachments.length === 0 && !createdTvId && (
              <div style={{ fontSize: 13, color: '#9CA3AF' }}>
                No existing CPR attachments found.
              </div>
            )}

            {!cprDetailLoading && !cprAttachmentsError && cprAttachments.length === 0 && !selectedCprId && !createdTvId && (
              <div style={{ fontSize: 13, color: '#9CA3AF' }}>
                Select a CPR to view its attachments, or create the verification first to upload new files.
              </div>
            )}

            {cprAttachments.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  CPR Attachments ({cprAttachments.length})
                </div>
                {cprAttachments.map(doc => (
                  <div key={`cpr-${doc.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 6, background: '#f9fafb' }}>
                    <FileText size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : ''}</span>
                    <span style={{ fontSize: 10, color: '#6366f1', background: '#eef2ff', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>CPR</span>
                    <a href={doc.url} target="_blank" rel="noreferrer" title="View" style={{ color: '#0d6efd', flexShrink: 0 }}><Eye size={14} /></a>
                    <a href={doc.url} download={doc.name} title="Download" style={{ color: '#0d6efd', flexShrink: 0 }}><Download size={14} /></a>
                  </div>
                ))}
              </div>
            )}

            {createdTvId && (
              <div style={{ marginTop: cprAttachments.length > 0 ? 16 : 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Technical Verification Attachments
                </div>
                <div className="tv-upload-zone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files);
                    if (files.length) handleNewTvFileUpload(files);
                  }}
                >
                  <Upload size={20} className="tv-upload-icon" />
                  <div className="tv-upload-label">Drop files here to upload</div>
                  <div className="tv-upload-hint">Drag & drop or <label className="tv-upload-browse">browse<input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp,.zip,.dwg,.step,.stp" onChange={(e) => {
                    const files = Array.from(e.target.files);
                    if (files.length) handleNewTvFileUpload(files);
                    e.target.value = '';
                  }} hidden /></label></div>
                </div>
                {newTvUploading && Object.keys(newTvUploadProgress).length > 0 && (
                  <div className="tv-upload-progress">
                    {Object.entries(newTvUploadProgress).map(([name, pct]) => (
                      <div key={name} className="tv-progress-item">
                        <span className="tv-progress-name">{name}</span>
                        <div className="tv-progress-bar"><div className="tv-progress-fill" style={{ width: `${pct}%` }} /></div>
                        <span className="tv-progress-pct">{pct}%</span>
                      </div>
                    ))}
                  </div>
                )}
                {createdTvDocs.length > 0 ? (
                  <div style={{ marginTop: 12 }}>
                    {createdTvDocs.map(doc => (
                      <div key={`tv-${doc.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 6, background: '#fff' }}>
                        <FileText size={14} style={{ color: '#0d6efd', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                        <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : ''}</span>
                        <a href={doc.url} target="_blank" rel="noreferrer" title="View" style={{ color: '#0d6efd', flexShrink: 0 }}><Eye size={14} /></a>
                        <a href={doc.url} download={doc.name} title="Download" style={{ color: '#0d6efd', flexShrink: 0 }}><Download size={14} /></a>
                        <button onClick={() => handleDeleteCreatedTvDoc(doc.id)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', flexShrink: 0, padding: 0 }}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 13, color: '#9CA3AF' }}>No new TV attachments yet</div>
                )}
              </div>
            )}
          </div>

          <div className="tv-form-card">
            <h3 className="tv-form-section-title">Verification Details</h3>
            <div className="tv-form-row">
              <div className="tv-form-group">
                <label className="tv-form-label">Next Review Date</label>
                <input type="date" className="tv-form-input" value={createForm.nextReviewDate}
                  onChange={(e) => setCreateForm({ ...createForm, nextReviewDate: e.target.value })} />
              </div>
            </div>
            <div className="tv-form-group">
              <label className="tv-form-label">Technical Remarks</label>
              <textarea className="tv-form-textarea" rows={3} value={createForm.technicalRemarks}
                onChange={(e) => setCreateForm({ ...createForm, technicalRemarks: e.target.value })}
                placeholder="Enter technical remarks..." />
            </div>
            <div className="tv-form-group">
              <label className="tv-form-label">Internal Remarks</label>
              <textarea className="tv-form-textarea" rows={3} value={createForm.internalRemarks}
                onChange={(e) => setCreateForm({ ...createForm, internalRemarks: e.target.value })}
                placeholder="Enter internal remarks..." />
            </div>
            <div className="tv-form-group">
              <label className="tv-form-label">Customer Remarks</label>
              <textarea className="tv-form-textarea" rows={3} value={createForm.customerRemarks}
                onChange={(e) => setCreateForm({ ...createForm, customerRemarks: e.target.value })}
                placeholder="Enter customer remarks..." />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================== RENDER: ITEM-LEVEL (PER-CPR) VIEW ==============================

  const itemStatusCfg = (status) => STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT;
  const nextItemAction = (status) => {
    switch (status) {
      case 'DRAFT':
      case 'PENDING_FILE': return { action: 'UNDER_VERIFICATION', label: 'Start Verification', color: '#2563eb' };
      case 'UNDER_VERIFICATION': return { action: 'VERIFICATION_COMPLETED', label: 'Accept / Verify', color: '#059669' };
      default: return null;
    }
  };

  if (itemView) {
    const mergedItems = itemItems.map(item => {
      const tv = itemTvList.find(t => t.cprItemId === item.id) || null;
      return { ...item, tv };
    });

    return (
      /* `erp-detail-scope` opts the item-verification view into the shared
         detail-page action standard (styles/erp-detail-scope.css) — its top
         bar renders the `erp-detail-actions` family like every other detail
         page, so Back / actions get the reference geometry. */
      <div className="erp-detail-scope purchase-page cpr-page tv-page">
        <style>{`
          .rwi-wrap { padding: 0 2px; }
          .rwi-toolbar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
          .rwi-toolbar .rwi-select { min-width:320px; padding:9px 12px; border:1px solid var(--purchase-border,#d1d5db); border-radius:8px; font-size:13.5px; background:#fff; }
          .rwi-card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; margin-bottom:16px; box-shadow:0 1px 2px rgba(16,24,40,0.04); overflow:hidden; }
          .rwi-card-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 16px; background:#f8fafc; border-bottom:1px solid #e5e7eb; }
          .rwi-card-head .rwi-itemno { font-weight:700; color:#0B4A3D; }
          .rwi-card-body { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px 16px; padding:16px; }
          .rwi-field .rwi-label { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:#6b7280; margin-bottom:2px; font-weight:600; }
          .rwi-field .rwi-value { font-size:13.5px; color:#111827; word-break:break-word; }
          .rwi-attach { border-top:1px solid #eef2f6; padding:12px 16px; background:#fbfdff; }
          .rwi-attach h5 { margin:0 0 8px; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:#64748b; }
          .rwi-file-list { display:flex; flex-direction:column; gap:6px; }
          .rwi-file { display:flex; align-items:center; gap:8px; font-size:13px; color:#1f2937; padding:6px 8px; border-radius:6px; border:1px solid #e5e7eb; background:#fff; }
          .rwi-file a { color:#0d6efd; text-decoration:none; }
          .rwi-actions { display:flex; gap:8px; align-items:center; padding:12px 16px; border-top:1px solid #eef2f6; flex-wrap:wrap; }
          .rwi-empty { text-align:center; color:#6b7280; padding:40px 0; }
          .rwi-file-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        `}</style>

        {!embedded && (
          <>
            <nav className="pr-breadcrumb" aria-label="Breadcrumb">
              <button className="bc-link" onClick={() => navigate('/dashboard')}>Dashboard</button>
              <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
              <button className="bc-link" onClick={() => navigate('/cprs')}>CPR</button>
              <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
              <span className="bc-current">CPR Technical Verification &mdash; Items</span>
            </nav>
            <div className="pr-page-header">
              <div>
                <h1><ClipboardList size={20} /> Item-level Technical Verification</h1>
                <p className="po-page-header-subtitle">Verify every CPR item independently with its own drawing and attachments</p>
              </div>
              {/* Top action area uses the shared ERP detail-action buttons
                  (styles/erp-detail-actions.css) like every other detail page. */}
              <div className="pr-page-header-actions erp-detail-actions">
                <button type="button" className="erp-detail-action" onClick={() => navigate('/cprs')}>
                  <ArrowLeft /> Back to CPRs
                </button>
                <button
                  type="button"
                  className="erp-detail-action erp-detail-action--primary"
                  onClick={() => { setItemView(false); setItemCprId(''); setItemTvList([]); setItemItems([]); }}
                >
                  <ArrowRight /> Back to List
                </button>
              </div>
            </div>
          </>
        )}

        {itemError && (
          <div className="cpr-error-banner">
            <AlertTriangle size={14} /><span>{itemError}</span>
            <button onClick={() => setItemError(null)}>&times;</button>
          </div>
        )}

        <div className="rwi-toolbar">
          <select className="rwi-select" value={itemCprId} onChange={(e) => { setItemCprId(e.target.value); setItemError(null); }}>
            <option value="">Select a CPR to load its items...</option>
            {itemCprList.map(cpr => (
              <option key={cpr.id} value={cpr.id}>{cpr.prNo} &mdash; {cpr.clientName || 'No client'}</option>
            ))}
          </select>
          {itemCprId && (
            <button className="po-btn po-btn-ghost po-btn-sm" onClick={refreshItemItems} title="Refresh status">
              <RefreshCw size={14} /> Refresh
            </button>
          )}
        </div>

        {!itemCprId ? (
          <div className="rwi-empty">
            <ClipboardList size={40} style={{ color: '#CBD5E1' }} />
            <p>Select a CPR above. All of its items with their drawings and attachments will load automatically.</p>
          </div>
        ) : itemLoading || mergedItems.length === 0 ? (
          <div className="rwi-empty">
            <p>{itemLoading ? 'Loading items...' : 'This CPR has no items to verify.'}</p>
          </div>
        ) : (
          mergedItems.map((item, idx) => {
            const status = item.tv ? itemStatusCfg(item.tv.status) : null;
            const next = item.tv ? nextItemAction(item.tv.status) : null;
            return (
              <div key={item.id} className="rwi-card">
                <div className="rwi-card-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="rwi-itemno">Item {idx + 1}</span>
                    <span className="tv-badge tv-badge-gray" style={{ fontSize: 12 }}>ID #{item.id}</span>
                    {status && <span className={status.badgeClass}>{status.label}</span>}
                    {item.tv?.fileStatus && (
                      <span className={(FILE_STATUS_CONFIG[item.tv.fileStatus] || FILE_STATUS_CONFIG.MISSING).badgeClass}>
                        {(FILE_STATUS_CONFIG[item.tv.fileStatus] || FILE_STATUS_CONFIG.MISSING).label}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>{item.tv?.tvNo || 'Not yet verified'}</span>
                </div>

                <div className="rwi-card-body">
                  <div className="rwi-field">
                    <div className="rwi-label">Drawing No.</div>
                    <div className="rwi-value" style={{ fontWeight: 600 }}>{item.drawingNo || '-'}</div>
                  </div>
                  <div className="rwi-field">
                    <div className="rwi-label">Item Description</div>
                    <div className="rwi-value">{item.description || '-'}</div>
                  </div>
                  <div className="rwi-field">
                    <div className="rwi-label">Specification</div>
                    <div className="rwi-value">{item.specification || '-'}</div>
                  </div>
                  <div className="rwi-field">
                    <div className="rwi-label">Quantity</div>
                    <div className="rwi-value">{item.qty ?? '-'}</div>
                  </div>
                  <div className="rwi-field">
                    <div className="rwi-label">UOM</div>
                    <div className="rwi-value">{item.unit || '-'}</div>
                  </div>
                  <div className="rwi-field">
                    <div className="rwi-label">Estimated Cost</div>
                    <div className="rwi-value">{item.estimatedCost != null ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(item.estimatedCost) : '-'}</div>
                  </div>
                </div>

                <div className="rwi-attach">
                  <h5>Attachments (this item only)</h5>
                  {Array.isArray(item.attachments) && item.attachments.length > 0 ? (
                    <div className="rwi-file-list">
                      {item.attachments.map((f, fi) => (
                        <div key={fi} className="rwi-file">
                          <FileText size={14} style={{ color: '#0d6efd' }} />
                          <span className="rwi-file-name">{f.name}</span>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>
                            {f.size ? `${(f.size / 1024).toFixed(1)} KB` : ''}
                          </span>
                          {f.data && (
                            <>
                              <a href={f.data} download={f.name} title="Download"><Download size={14} /></a>
                              {/\.(pdf|png|jpe?g|gif|webp|svg)$/i.test(f.name || '') && (
                                <a href={f.data} target="_blank" rel="noreferrer" title="View"><Eye size={14} /></a>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: '#9ca3af' }}>No item attachments.</div>
                  )}

                  {item.tv && Array.isArray(item.tv.documents) && item.tv.documents.length > 0 && (
                    <>
                      <h5 style={{ marginTop: 12 }}>Verification Documents</h5>
                      <div className="rwi-file-list">
                        {item.tv.documents.map(doc => (
                          <div key={doc.id} className="rwi-file">
                            <FileText size={14} style={{ color: '#7c3aed' }} />
                            <span className="rwi-file-name">{doc.name}</span>
                            <button className="po-btn po-btn-ghost po-btn-sm" title="View/Open" onClick={() => openItemDoc(doc.url, doc.name)}>
                              <Eye size={13} /> View
                            </button>
                            <button className="po-btn po-btn-ghost po-btn-sm" title="Download" onClick={() => downloadFile(doc.url, doc.name).catch((err) => setItemError(err?.message || 'Failed to download file'))}>
                              <Download size={13} /> Download
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="rwi-actions">
                  {item.tv && (
                    <>
                      {next && (
                        <button className="po-btn po-btn-primary po-btn-sm" style={{ background: next.color }}
                          disabled={busyItemId === item.tv.id || (next.action === 'UNDER_VERIFICATION' && item.tv.fileStatus !== 'AVAILABLE')}
                          onClick={() => setItemStatusModal({ tv: item.tv, action: next.action, remarks: '' })}>
                          {next.label} <ArrowRight size={13} />
                        </button>
                      )}
                      {item.tv.status === 'UNDER_VERIFICATION' && (
                      <button className="po-btn po-btn-danger po-btn-sm" disabled={busyItemId === item.tv.id}
                        onClick={() => setItemStatusModal({ tv: item.tv, action: 'REJECTED', remarks: '' })}>
                        <XCircle size={13} /> Reject
                      </button>
                      )}
                    </>
                  )}
                  {item.tv && (
                    <label className="po-btn po-btn-ghost po-btn-sm" style={{ cursor: 'pointer' }}>
                      <Upload size={13} /> Add Drawing
                      <input type="file" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.dwg,.step,.stp,.zip" hidden
                        onChange={(e) => {
                          const files = Array.from(e.target.files);
                          if (files.length) handleItemUpload(item.tv, files, activeDivision === 'TEAM' ? 'TEAM_ONLY' : 'CUSTOMER');
                          e.target.value = '';
                        }} />
                    </label>
                  )}
                  {item.estimatedCost != null && item.tv?.status === 'APPROVED' && (
                    <span className="tv-badge tv-badge-green">Ready for Cost Workout</span>
                  )}
                </div>
              </div>
            );
          })
        )}

        {itemStatusModal.tv && (
          <div className="tv-modal-overlay" onClick={() => setItemStatusModal({ tv: null, action: '', remarks: '' })}>
            <div className="tv-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="tv-modal-title">{STATUS_CONFIG[itemStatusModal.action]?.label || itemStatusModal.action}</h3>
              {itemStatusModal.action === 'REJECTED' && (
                <div className="tv-form-group">
                  <label className="tv-form-label">Remarks *</label>
                  <textarea className="tv-form-textarea" rows={3} value={itemStatusModal.remarks}
                    onChange={(e) => setItemStatusModal({ ...itemStatusModal, remarks: e.target.value })}
                    placeholder="Enter rejection remarks..." />
                </div>
              )}
              <div className="tv-modal-actions">
                <button className="po-btn po-btn-ghost" onClick={() => setItemStatusModal({ tv: null, action: '', remarks: '' })}>Cancel</button>
                <button className="po-btn po-btn-primary" onClick={confirmItemStatus}
                  disabled={itemStatusModal.action === 'REJECTED' && !itemStatusModal.remarks.trim()}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================== RENDER: SPLIT VIEW ==============================

  const nextAction = selectedTv ? getNextStatusAction(selectedTv.status) : null;
  // An item can be converted once it is verified and the user is on the TEAM
  // (internal) division — the same gate the existing Forward action uses. The
  // Cost Workout and Purchase Requisition destinations are tracked separately, so
  // having converted to one never hides the other.
  const canConvertSelected = !!selectedTv
    && activeDivision === 'TEAM'
    && ['VERIFICATION_COMPLETED', 'APPROVED', 'FORWARDED_TO_COST_WORKOUT', 'FORWARDED_TO_PURCHASE_REQUISITION'].includes(selectedTv.status)
    && selectedTv.status !== 'REJECTED';
  const documents = selectedTv?.documents || [];
  const teamDocs = documents.filter(d => d.visibility === 'TEAM_ONLY' || d.visibility === 'BOTH');
  const customerDocs = documents.filter(d => d.visibility === 'CUSTOMER' || d.visibility === 'BOTH');
  const currentDocs = activeDivision === 'TEAM' ? teamDocs : customerDocs;

  return (
    <div className="purchase-page cpr-page tv-page">
      {/* Breadcrumb + Page Header (hidden when embedded inside a hub) */}
      {!embedded && (
        <>
          <nav className="pr-breadcrumb" aria-label="Breadcrumb">
            <button className="bc-link" onClick={() => navigate('/dashboard')}>Dashboard</button>
            <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
            <button className="bc-link" onClick={() => navigate('/cprs')}>CPR</button>
            <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
            <span className="bc-current">CPR Technical Verification</span>
          </nav>
          <div className="pr-page-header">
            <div>
              <h1><FileText size={20} /> CPR Technical Verification</h1>
              <p className="po-page-header-subtitle">Verify CPR items, drawings and documents before forwarding to Cost Workout</p>
            </div>
            <div className="pr-page-header-actions">
              <button className="po-btn po-btn-primary-outline" onClick={() => { openItemView(); }}>
                <ClipboardList size={14} /> Verify CPR Items
              </button>
              <button className="po-btn po-btn-primary" onClick={() => { setView('create'); loadCprs(); }}>
                + New Verification
              </button>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="cpr-error-banner">
          <AlertTriangle size={14} /><span>{error}</span>
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {/* Division Tabs — removed. The internal/customer toggle was the only way
          to switch `activeDivision`; the page now always runs on the internal
          TEAM division (its previous default), so the list, KPI stats, table
          header, document visibility and the conversion gates all behave
          exactly as they did by default. */}

      {/* KPI Cards */}
      <div className="tv-kpi-grid">
        <KpiCard label="Total" value={stats.total} icon={FolderOpen} color="#0B4A3D" bg="rgba(11,74,61,0.08)" />
        <KpiCard label="File Available" value={stats.fileAvailable} icon={FileText} color="#2563eb" bg="rgba(37,99,235,0.08)" />
        <KpiCard label="File Not Found" value={stats.fileNotFound} icon={AlertTriangle} color="#ea580c" bg="rgba(234,88,12,0.08)" />
        <KpiCard label="Under Verification" value={stats.underVerification} icon={Clock} color="#7c3aed" bg="rgba(124,58,237,0.08)" />
        <KpiCard label="Verified" value={stats.verified} icon={CheckCircle} color="#059669" bg="rgba(5,150,105,0.08)" />
        <KpiCard label="Rejected" value={stats.rejected} icon={XCircle} color="#dc2626" bg="rgba(220,38,38,0.08)" />
        <KpiCard label="Forwarded to Cost Workout" value={stats.forwarded} icon={Send} color="#0B4A3D" bg="rgba(11,74,61,0.08)" />
      </div>

      {/* Toolbar */}
      <div className="po-toolbar">
        <div className="po-toolbar-left">
          <button className={`po-btn ${showFilters ? 'po-btn-primary-outline' : 'po-btn-ghost'}`} onClick={() => setShowFilters(!showFilters)}>
            <Filter size={14} /> {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          {showFilters && (
            <>
              <select className="tv-filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
                <option value="">All Status</option>
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </>
          )}
          <div className="tv-search-input">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search by TV No, CPR No, Item No, Drawing No..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
        </div>
        <div className="po-toolbar-right">
          <button className="po-btn po-btn-ghost po-btn-sm" onClick={() => { loadList(); loadStats(); }} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Split View: Table + Detail */}
      <div className="tv-split-view">
        {/* Left: Table */}
        <div className="tv-split-left">
          <div className="tv-table-header">
            <span>Technical Verification Items ({activeDivision}) </span>
            <span className="tv-table-count">{listData.totalElements || 0}</span>
          </div>
          <div className="tv-table-wrap">
            {/* `sgrid` = the shared sticky data grid (styles/sticky-data-grid.css):
                the TV No column stays pinned left and Actions pinned right while
                the middle columns scroll horizontally inside .tv-table-wrap. */}
            <table className="po-table tv-table sgrid sgrid-sales">
              <thead>
                <tr>
                  <th className="sgrid-pin" style={{ left: 0 }}>TV No</th>
                  <th>CPR No</th>
                  <th>Item No</th>
                  <th>Drawing No</th>
                  <th>Item / Description</th>
                  <th>File Status</th>
                  <th>Verification Status</th>
                  <th className="sgrid-pin-actions" style={{ textAlign: 'center', width: 80 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="tv-table-loading">Loading...</td></tr>
                ) : (listData.content || []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="tv-table-empty">
                      <ClipboardList size={32} style={{ color: '#CBD5E1' }} />
                      <span>No Technical Verification Items Found</span>
                    </td>
                  </tr>
                ) : (
                  (listData.content || []).map(tv => {
                    const isSelected = selectedTv?.id === tv.id;
                    const fileCfg = FILE_STATUS_CONFIG[tv.fileStatus] || FILE_STATUS_CONFIG.MISSING;
                    const statusCfg = STATUS_CONFIG[tv.status] || STATUS_CONFIG.DRAFT;
                    // The ⋮ menu action list — unchanged content, now fed to the
                    // shared portal ActionMenu so it escapes the table clipping.
                    const actionItems = [
                      { key: 'view', label: 'View', icon: Eye },
                      ...(['VERIFICATION_COMPLETED', 'APPROVED', 'FORWARDED_TO_COST_WORKOUT', 'FORWARDED_TO_PURCHASE_REQUISITION'].includes(tv.status) ? [
                        { key: 'cw', label: 'Convert to CW', icon: Calculator, disabled: converting },
                        { key: 'pr', label: 'Convert to PR', icon: ClipboardList, disabled: converting }
                      ] : []),
                      { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
                    ];
                    const onAction = (key) => {
                      if (key === 'view') openDetail(tv);
                      else if (key === 'cw') handleConvert(tv, 'CW');
                      else if (key === 'pr') handleConvert(tv, 'PR');
                      else if (key === 'delete') handleDeleteTv(tv.id);
                    };
                    return (
                      <tr key={tv.id}
                        className={`tv-table-row ${isSelected ? 'tv-table-row-selected' : ''}`}
                        onClick={() => openDetail(tv)}
                      >
                        <td className="sgrid-pin" style={{ left: 0 }}><span className="tv-cell-bold">{tv.tvNo}</span></td>
                        <td>{tv.cprPrNo || '-'}</td>
                        <td>{tv.itemNo || tv.drawingNumber || '-'}</td>
                        <td>{tv.drawingNumber || '-'}</td>
                        <td>{tv.itemDescription || '-'}</td>
                        <td>
                          <span className={fileCfg.badgeClass}>
                            {tv.fileStatus === 'AVAILABLE' ? 'File Available' : tv.fileStatus === 'PENDING' ? 'Pending File' : 'File Not Found'}
                          </span>
                        </td>
                        <td><span className={statusCfg.badgeClass}>{statusCfg.label}</span></td>
                        <td className="sgrid-pin-actions">
                          <div className="tv-actions-cell" onClick={(e) => e.stopPropagation()}>
                            <button className="tv-action-btn" onClick={() => openDetail(tv)} title="View">
                              <Eye size={14} />
                            </button>
                            {tv.status === 'VERIFICATION_COMPLETED' && !tv.forwardedToCostWorkout && activeDivision === 'TEAM' && (
                              <button className="tv-action-btn tv-action-btn-forward" onClick={() => {
                                setSelectedTv(tv);
                                setShowForwardModal(true);
                                loadCostWorkouts();
                              }} title="Forward to Cost Workout">
                                <ArrowRight size={14} />
                              </button>
                            )}
                            <ActionMenu
                              items={actionItems}
                              onAction={onAction}
                              buttonLabel="More actions"
                              triggerClassName="tv-action-btn"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {listData.totalPages > 1 && (
            <div className="tv-pagination">
              <span className="tv-pagination-info">
                Showing {listData.totalElements > 0 ? (page * size + 1) : 0} to {Math.min((page + 1) * size, listData.totalElements || 0)} of {listData.totalElements || 0}
              </span>
              <div className="tv-pagination-btns">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /></button>
                <span className="tv-pagination-page">{page + 1}</span>
                <button disabled={page >= listData.totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></button>
              </div>
              <select className="tv-pagination-size" value={size} onChange={() => {}}>
                <option value={10}>10 / page</option>
              </select>
            </div>
          )}
        </div>

        {/* Right: Detail Panel */}
        <div className="tv-split-right">
          {detailLoading && !selectedTv ? (
            <div className="tv-detail-loading">Loading details...</div>
          ) : selectedTv ? (
            <div className="tv-detail-panel">
              {/* Detail Header */}
              <div className="tv-detail-header">
                <h3 className="tv-detail-title">Item Details</h3>
                {/* Status Stepper */}
                {/* The progress steps are DERIVED from the selected record's own
                    persisted status — never from a separate copy of it — so they
                    cannot disagree with the table badge or the status line above.
                    Both forward destinations count as "reached": a record forwarded
                    to Purchase Requisition used to fall through to the catch-all and
                    render as "Under Verification · Current" while the row (correctly)
                    showed Forwarded to Purchase Requisition. The final stage also
                    names the destination the backend actually recorded. */}
                <div className="tv-stepper">
                  {(() => {
                    const forwardedToCw = selectedTv.status === 'FORWARDED_TO_COST_WORKOUT' || !!selectedTv.forwardedToCostWorkout;
                    const forwardedToPr = selectedTv.status === 'FORWARDED_TO_PURCHASE_REQUISITION' || !!selectedTv.forwardedToPurchaseRequisition;
                    const isForwarded = forwardedToCw || forwardedToPr;
                    const isVerified = isForwarded
                      || selectedTv.status === 'VERIFICATION_COMPLETED'
                      || selectedTv.status === 'APPROVED';
                    const isRejected = selectedTv.status === 'REJECTED';
                    // Name the destination the backend recorded. The STATUS is the
                    // last action performed and wins; the two destinations are also
                    // tracked independently on the record, so fall back to those
                    // flags. Only a not-yet-forwarded record stays neutral instead
                    // of implying Cost Workout.
                    const destinationStep = selectedTv.status === 'FORWARDED_TO_PURCHASE_REQUISITION'
                      ? 'Forwarded to Purchase Requisition'
                      : selectedTv.status === 'FORWARDED_TO_COST_WORKOUT'
                        ? 'Forwarded to Cost Workout'
                        : forwardedToPr && forwardedToCw ? 'Forwarded to CW & PR'
                          : forwardedToPr ? 'Forwarded to Purchase Requisition'
                            : forwardedToCw ? 'Forwarded to Cost Workout' : 'Forward to CW / PR';
                    const steps = [
                      {
                        label: 'File Check',
                        status: selectedTv.fileStatus === 'AVAILABLE'
                          ? 'done'
                          : ['DRAFT', 'PENDING_FILE'].includes(selectedTv.status) || isRejected ? 'current' : 'pending'
                      },
                      {
                        label: 'Under Verification',
                        status: isVerified ? 'done'
                          : isRejected ? 'rejected'
                          : selectedTv.status === 'UNDER_VERIFICATION' ? 'current' : 'pending'
                      },
                      // The stage the record actually sits at is marked 'current'
                      // ("you are here"), so a verified-but-not-yet-forwarded record
                      // shows Verified · Current and a forwarded record shows its own
                      // destination · Current — never a stale earlier stage.
                      { label: 'Verified', status: isVerified ? (isForwarded ? 'done' : 'current') : 'pending' },
                      { label: destinationStep, status: isForwarded ? 'current' : 'pending' }
                    ];
                    return steps.map(({ label, status: stepStatus }, i) => (
                      <div key={label} className={`tv-stepper-step tv-stepper-${stepStatus}`}>
                        <div className="tv-stepper-dot">
                          {stepStatus === 'done' ? <CheckCircle size={10} /> : stepStatus === 'rejected' ? <XCircle size={10} /> : i + 1}
                        </div>
                        <div className="tv-stepper-label">{label}</div>
                        {stepStatus === 'current' && <div className="tv-stepper-sublabel">Current</div>}
                        {stepStatus === 'rejected' && <div className="tv-stepper-sublabel">Rejected</div>}
                      </div>
                    ));
                  })()}
                </div>
                {selectedTv.status === 'REJECTED' && (
                  <div className="tv-rejection-banner" role="status">
                    <XCircle size={15} />
                    <span>This verification attempt was rejected. Review the rejection reason below.</span>
                  </div>
                )}
              </div>

              {/* Detail Info Grid */}
              <div className="tv-detail-info">
                <div className="tv-detail-row">
                  <span className="tv-detail-label">TV No.</span>                    <span className="tv-detail-value">: {selectedTv.tvNo}</span>
                  </div>
                  {conversionResult && (
                    <div className="tv-detail-row tv-conversion-result">
                      <span className="tv-detail-label">Converted</span>
                      <span className="tv-detail-value">
                        : {conversionResult.destination === 'CW' ? 'Cost Workout' : 'Purchase Requisition'}{' '}
                        <strong>{conversionResult.destinationNo}</strong>
                        {' '}
                        <button type="button" className="tv-convert-link"
                          onClick={() => openConvertedDestination(conversionResult)}>
                          Open
                        </button>
                      </span>
                    </div>
                  )}
                <div className="tv-detail-row">
                  <span className="tv-detail-label">CPR No.</span>
                  <span className="tv-detail-value">: {selectedTv.cprPrNo || '-'}</span>
                </div>
                <div className="tv-detail-row">
                  <span className="tv-detail-label">Item No.</span>
                  <span className="tv-detail-value">: {selectedTv.itemNo || selectedTv.drawingNumber || '-'}</span>
                </div>
                <div className="tv-detail-row">
                  <span className="tv-detail-label">Drawing No.</span>
                  <span className="tv-detail-value">: {selectedTv.drawingNumber || '-'}</span>
                </div>
                <div className="tv-detail-row">
                  <span className="tv-detail-label">Item / Description</span>
                  <span className="tv-detail-value">: {selectedTv.itemDescription || '-'}</span>
                </div>
                <div className="tv-detail-row">
                  <span className="tv-detail-label">Required Document</span>
                  <span className="tv-detail-value">: Technical Drawing</span>
                </div>
                <div className="tv-detail-row">
                  <span className="tv-detail-label">File Status</span>
                  <span className="tv-detail-value">: {(() => {
                    const fc = FILE_STATUS_CONFIG[selectedTv.fileStatus] || FILE_STATUS_CONFIG.MISSING;
                    return <span className={fc.badgeClass}>{fc.label}</span>;
                  })()}</span>
                </div>
                <div className="tv-detail-row">
                  <span className="tv-detail-label">Verification Status</span>
                  <span className="tv-detail-value">: {(() => {
                    const sc = STATUS_CONFIG[selectedTv.status] || STATUS_CONFIG.DRAFT;
                    return <span className={sc.badgeClass}>{sc.label}</span>;
                  })()}</span>
                </div>

                {/* Uploaded file info */}
                {currentDocs.length > 0 && (
                  <>
                    <div className="tv-detail-row">
                      <span className="tv-detail-label">Uploaded File</span>
                      <span className="tv-detail-value">
                        : <a href={currentDocs[0].url} target="_blank" rel="noreferrer" className="tv-file-link">{currentDocs[0].name}</a>
                        <a href={currentDocs[0].url} target="_blank" rel="noreferrer" className="tv-file-action"><Eye size={13} /> View</a>
                        <a href={currentDocs[0].url} download className="tv-file-action"><Download size={13} /> Download</a>
                      </span>
                    </div>
                    <div className="tv-detail-row">
                      <span className="tv-detail-label">Uploaded On</span>
                      <span className="tv-detail-value">: {currentDocs[0].uploadedAt ? new Date(currentDocs[0].uploadedAt).toLocaleString() : '-'}</span>
                    </div>
                    <div className="tv-detail-row">
                      <span className="tv-detail-label">Uploaded By</span>
                      <span className="tv-detail-value">: {currentDocs[0].uploadedBy || '-'}</span>
                    </div>
                  </>
                )}

                {selectedTv.verifiedBy && (
                  <div className="tv-detail-row">
                    <span className="tv-detail-label">Verified By</span>
                    <span className="tv-detail-value">: {selectedTv.verifiedBy}</span>
                  </div>
                )}
                {selectedTv.verificationDate && (
                  <div className="tv-detail-row">
                    <span className="tv-detail-label">Verified On</span>
                    <span className="tv-detail-value">: {selectedTv.verificationDate}</span>
                  </div>
                )}

                {selectedTv.forwardedToCostWorkout && (
                  <div className="tv-detail-row">
                    <span className="tv-detail-label">Forwarded to CW</span>
                    <span className="tv-detail-value">: <span className="tv-badge tv-badge-green">{selectedTv.costWorkoutCwNo}</span></span>
                  </div>
                )}
                {selectedTv.forwardedToPurchaseRequisition && (
                  <div className="tv-detail-row">
                    <span className="tv-detail-label">Purchase Requisition</span>
                    <span className="tv-detail-value">
                      : <span className="tv-badge tv-badge-green">{selectedTv.purchaseRequisitionPrNo}</span>
                      <button type="button" className="tv-convert-link"
                        onClick={() => navigate(`/purchase/requisition/${selectedTv.purchaseRequisitionId}/edit`)}>
                        Open
                      </button>
                    </span>
                  </div>
                )}
              </div>

              {/* Technical Verification Section */}
              <div className="tv-detail-section">
                <h4 className="tv-detail-section-title"><Settings size={14} /> Technical Verification</h4>
                {editMode ? (
                  <>
                    <div className="tv-form-group">
                      <label className="tv-form-label">Remarks *</label>
                      <textarea className="tv-form-textarea" rows={3} value={editForm.technicalRemarks || ''}
                        onChange={(e) => setEditForm({ ...editForm, technicalRemarks: e.target.value })}
                        placeholder="Enter verification remarks..." />
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="po-btn po-btn-ghost po-btn-sm" onClick={() => setEditMode(false)}>Cancel</button>
                      <button className="po-btn po-btn-primary po-btn-sm" onClick={handleUpdate} disabled={detailLoading}>
                        {detailLoading ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="tv-detail-remarks">
                    {selectedTv.technicalRemarks ? (
                      <p>{selectedTv.technicalRemarks}</p>
                    ) : (
                      <p className="tv-no-remarks">No remarks added yet.</p>
                    )}
                    <button className="po-btn po-btn-ghost po-btn-sm" onClick={() => { setEditMode(true); setEditForm({ ...selectedTv }); }}>
                      <Edit2 size={13} /> Edit
                    </button>
                  </div>
                )}
              </div>

              <div className="tv-detail-section">
                <h4 className="tv-detail-section-title"><Clock size={14} /> Edit History</h4>
                <EditHistoryTimeline
                  moduleKey="cprTechnicalVerification"
                  recordId={selectedTv.id}
                  limit={20}
                />
              </div>

              {/* Document Upload */}
              <div className="tv-detail-section">
                <h4 className="tv-detail-section-title"><Upload size={14} /> Upload Document</h4>
                <div className="tv-upload-zone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files);
                    if (files.length) handleUpload(selectedTv.id, files, activeDivision === 'TEAM' ? 'TEAM_ONLY' : 'CUSTOMER');
                  }}
                >
                  <Upload size={20} className="tv-upload-icon" />
                  <div className="tv-upload-label">Drop files here to upload</div>
                  <div className="tv-upload-hint">Drag & drop or <label className="tv-upload-browse">browse<input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp,.zip" onChange={(e) => {
                    const files = Array.from(e.target.files);
                    if (files.length) handleUpload(selectedTv.id, files, activeDivision === 'TEAM' ? 'TEAM_ONLY' : 'CUSTOMER');
                    e.target.value = '';
                  }} hidden /></label></div>
                </div>
                {uploading && Object.keys(uploadProgress).length > 0 && (
                  <div className="tv-upload-progress">
                    {Object.entries(uploadProgress).map(([name, pct]) => (
                      <div key={name} className="tv-progress-item">
                        <span className="tv-progress-name">{name}</span>
                        <div className="tv-progress-bar"><div className="tv-progress-fill" style={{ width: `${pct}%` }} /></div>
                        <span className="tv-progress-pct">{pct}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="tv-detail-actions">
                {selectedTv.status === 'UNDER_VERIFICATION' && (
                <button className="po-btn po-btn-danger" onClick={() => {
                  setStatusAction('REJECTED');
                  setShowStatusModal(true);
                }}>
                  <XCircle size={14} /> Reject
                </button>
                )}
                <button className="po-btn po-btn-ghost" onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.multiple = true;
                  input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.gif,.webp,.zip';
                  input.onchange = (e) => {
                    const files = Array.from(e.target.files);
                    if (files.length) handleUpload(selectedTv.id, files, activeDivision === 'TEAM' ? 'TEAM_ONLY' : 'CUSTOMER');
                  };
                  input.click();
                }}>
                  <Upload size={14} /> Request File
                </button>
                {/* Verified — only shown while the backend would accept the
                    transition (UNDER_VERIFICATION), so it can never be clicked
                    from a state that would be rejected. Uses the selected
                    record's real id, never a row index. */}
                {selectedTv.status === 'UNDER_VERIFICATION' && (
                  <button className="po-btn po-btn-primary" style={{ background: '#059669' }}
                    onClick={handleVerify} disabled={verifying}
                    title={`Mark ${selectedTv.tvNo || 'this item'} as Verified — moves it to the Verified stage`}>
                    <CheckCircle size={14} /> {verifying ? 'Verifying...' : 'Verified'}
                  </button>
                )}
                {nextAction && (
                  <button className="po-btn po-btn-primary" style={{ background: nextAction.color }} onClick={() => {
                    setStatusAction(nextAction.action);
                    setShowStatusModal(true);
                  }} disabled={nextAction.action === 'UNDER_VERIFICATION' && selectedTv.fileStatus !== 'AVAILABLE'}
                    title={nextAction.action === 'UNDER_VERIFICATION' && selectedTv.fileStatus !== 'AVAILABLE' ? 'A file must be available before verification can start' : undefined}>
                    {nextAction.label} <ArrowRight size={14} />
                  </button>
                )}
                {['VERIFICATION_COMPLETED', 'APPROVED'].includes(selectedTv.status) && !selectedTv.forwardedToCostWorkout && activeDivision === 'TEAM' && (
                  <button className="po-btn po-btn-primary" onClick={() => {
                    setShowForwardModal(true);
                    loadCostWorkouts();
                  }}>
                    <Send size={14} /> Forward to Cost Workout
                  </button>
                )}
                {canConvertSelected && (
                  <>
                    <button className="po-btn po-btn-ghost" disabled={converting}
                      onClick={() => handleConvert(selectedTv, 'CW')}
                      title={`Create a new Cost Workout carrying only item ${selectedTv.itemNo || selectedTv.drawingNumber || ''}`}>
                      <Calculator size={14} /> Convert to CW
                    </button>
                    <button className="po-btn po-btn-ghost" disabled={converting}
                      onClick={() => handleConvert(selectedTv, 'PR')}
                      title={`Create a new Purchase Requisition carrying only item ${selectedTv.itemNo || selectedTv.drawingNumber || ''}`}>
                      <ClipboardList size={14} /> Convert to PR
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="tv-detail-empty">
              <FileText size={48} style={{ color: '#CBD5E1' }} />
              <p>Select a verification record from the table to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Status Modal */}
      {showStatusModal && (
        <div className="tv-modal-overlay" onClick={() => setShowStatusModal(false)}>
          <div className="tv-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="tv-modal-title">{STATUS_CONFIG[statusAction]?.label || statusAction}</h3>
            {statusAction === 'REJECTED' && (
              <div className="tv-form-group">
                <label className="tv-form-label">Remarks *</label>
                <textarea className="tv-form-textarea" rows={3} value={statusRemarks}
                  onChange={(e) => setStatusRemarks(e.target.value)}
                  placeholder="Enter rejection remarks..." />
              </div>
            )}
            <div className="tv-modal-actions">
              <button className="po-btn po-btn-ghost" onClick={() => setShowStatusModal(false)}>Cancel</button>
              <button className="po-btn po-btn-primary" onClick={handleStatusChange}
                disabled={statusAction === 'REJECTED' && !statusRemarks.trim()}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forward to Cost Workout Modal */}
      {showForwardModal && (
        <div className="tv-modal-overlay" onClick={() => { setShowForwardModal(false); setSelectedCwId(''); }}>
          <div className="tv-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="tv-modal-title">Forward to Cost Workout</h3>
            <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
              Select a Cost Workout to forward <strong>{selectedTv?.tvNo}</strong> to.
            </p>
            <div className="tv-form-group">
              <label className="tv-form-label">Cost Workout *</label>
              <select className="tv-form-select" value={selectedCwId} onChange={(e) => setSelectedCwId(e.target.value)}>
                <option value="">Select a Cost Workout...</option>
                {cwList.map(cw => (
                  <option key={cw.id} value={cw.id}>{cw.cwNo} &mdash; {cw.customerName || cw.company || 'No customer'}</option>
                ))}
              </select>
            </div>
            <div className="tv-modal-actions">
              <button className="po-btn po-btn-ghost" onClick={() => { setShowForwardModal(false); setSelectedCwId(''); }}>Cancel</button>
              <button className="po-btn po-btn-primary" onClick={handleForward} disabled={!selectedCwId || detailLoading}>
                {detailLoading ? 'Forwarding...' : 'Forward to Cost Workout'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="tv-modal-overlay" onClick={() => setPreviewDoc(null)}>
          <div className="tv-modal tv-modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="tv-modal-header">
              <h3 className="tv-modal-title">{previewDoc.name}</h3>
              <button className="po-btn po-btn-ghost" onClick={() => setPreviewDoc(null)}>&times;</button>
            </div>
            <div className="tv-modal-body">
              {previewDoc.contentType?.startsWith('image/') ? (
                <img src={previewDoc.url} alt={previewDoc.name} className="tv-preview-image" />
              ) : previewDoc.contentType?.includes('pdf') ? (
                <iframe src={previewDoc.url} className="tv-preview-frame" title={previewDoc.name} />
              ) : (
                <div className="tv-preview-unsupported">
                  <FileText size={48} />
                  <p>Preview not available for this file type.</p>
                  <a href={previewDoc.url} download className="po-btn po-btn-primary">Download to view</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
