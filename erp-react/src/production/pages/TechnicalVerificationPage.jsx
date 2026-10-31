import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PdfPrintButtons from '../components/PdfPrintButtons';
import Icon from '../components/icons/Icon';
import RowActionsDropdown from '../components/production/RowActionsDropdown';
import useProductionAccess from '../access/useProductionAccess';
import ActionFeedback from '../components/production/ActionFeedback';
import { useProductionOrders } from '../context/ProductionOrdersContext';
import { useTechnicalVerification } from '../context/TechnicalVerificationContext';
import { formatDate, formatDateTime } from '../utils/format';
import './AcknowledgementPage.css';

const PAGE_SIZE = 10;

// ============================================================
// Production-type-specific field configurations.
// `auto` fields are read-only and auto-filled from the Work Order.
// `editable` fields are pre-filled from saved TV or WO, editable.
// `wide` makes the field span full width.
// ============================================================
const TV_FIELD_CONFIG = {
  Casting: {
    title: 'Casting Technical Details',
    auto: [
      { key: 'drawingNumber', label: 'Drawing Number', woKey: 'drawingNumber' },
      { key: 'drawingRevision', label: 'Drawing Revision', woKey: 'drawingRevision' },
      { key: 'patternNumber', label: 'Pattern Number', woKey: 'patternNumber' },
    ],
    editable: [
      { key: 'patternRevision', label: 'Pattern Revision', placeholder: 'e.g. Rev B' },
      { key: 'materialGrade', label: 'Material / Grade', placeholder: 'e.g. ASTM A216 WCB' },
      { key: 'specification', label: 'Specification', placeholder: 'e.g. ASTM A216 WCB' },
      { key: 'castingWeight', label: 'Casting Weight (kg)', placeholder: 'e.g. 12.5' },
      { key: 'dimensions', label: 'Dimensions', placeholder: 'e.g. 300mm x 200mm x 150mm' },
      { key: 'machiningAllowance', label: 'Machining Allowance', placeholder: 'e.g. 3mm' },
    ],
    wideEditable: [
      { key: 'specialInstructions', label: 'Special Instructions', placeholder: 'Any special casting instructions...', rows: 2 },
    ],
    checklist: [
      'Drawing Verified',
      'Drawing Revision Verified',
      'Pattern Number Verified',
      'Material / Grade Verified',
      'Quantity Verified',
      'Specification Verified',
      'Casting Weight Verified',
      'Dimensions Verified',
      'Machining Allowance Verified',
    ],
    // Map formData fields → TV record fields for save
    saveMap: (fd) => ({
      drawingNumber: fd.drawingNumber || '',
      drawingRevision: fd.drawingRevision || '',
      patternNumber: fd.patternNumber || '',
      patternRevision: fd.patternRevision || '',
      materialGrade: fd.materialGrade || '',
      specification: fd.specification || '',
      castingWeight: fd.castingWeight || '',
      dimensions: fd.dimensions || '',
      machiningAllowance: fd.machiningAllowance || '',
      specialInstructions: fd.specialInstructions || '',
    }),
    // Extract display values from TV record for the summary table columns
    summaryDrawing: (tv, order) => tv.drawingNumber || order.drawingNumber || '—',
    summaryMaterial: (tv) => tv.materialGrade || '—',
  },
  Fabrication: {
    title: 'Fabrication Technical Details',
    auto: [
      { key: 'drawingNumber', label: 'Drawing Number', woKey: 'drawingNumber' },
      { key: 'drawingRevision', label: 'Drawing Revision', woKey: 'drawingRevision' },
      { key: 'materialType', label: 'Material Type', woKey: 'materialType' },
      { key: 'materialGrade', label: 'Material Grade', woKey: 'materialGrade' },
    ],
    editable: [
      { key: 'thickness', label: 'Thickness', placeholder: 'e.g. 12mm' },
      { key: 'length', label: 'Length', placeholder: 'e.g. 500mm' },
      { key: 'width', label: 'Width', placeholder: 'e.g. 300mm' },
      { key: 'diameter', label: 'Diameter', placeholder: 'e.g. 150mm (if applicable)' },
      { key: 'requiredTolerance', label: 'Required Tolerance', placeholder: 'e.g. ±0.5mm' },
      { key: 'weldingSpecification', label: 'Welding Specification', placeholder: 'e.g. AWS D1.1' },
      { key: 'weldingProcess', label: 'Welding Process', placeholder: 'e.g. SMAW, MIG, TIG' },
      { key: 'weldType', label: 'Weld Type', placeholder: 'e.g. Fillet, Butt' },
      { key: 'jointType', label: 'Joint Type', placeholder: 'e.g. Lap, Corner' },
      { key: 'hardFacingRequirement', label: 'Hard Facing Requirement', placeholder: 'e.g. Yes / No / Details' },
      { key: 'surfaceTreatment', label: 'Surface Treatment', placeholder: 'e.g. Sandblasting, Painting' },
      { key: 'heatTreatmentRequirement', label: 'Heat Treatment Requirement', placeholder: 'e.g. Normalizing at 600°C' },
    ],
    wideEditable: [
      { key: 'specialInstructions', label: 'Special Fabrication Instructions', placeholder: 'Any special fabrication instructions...', rows: 2 },
    ],
    checklist: [
      'Drawing Verified',
      'Drawing Revision Verified',
      'Material Type / Grade Verified',
      'Quantity Verified',
      'Thickness / Dimensions Verified',
      'Welding Specification Verified',
      'Tolerance Verified',
      'Surface Treatment Verified',
    ],
    saveMap: (fd) => ({
      drawingNumber: fd.drawingNumber || '',
      drawingRevision: fd.drawingRevision || '',
      materialType: fd.materialType || '',
      materialGrade: fd.materialGrade || '',
      thickness: fd.thickness || '',
      length: fd.length || '',
      width: fd.width || '',
      diameter: fd.diameter || '',
      requiredTolerance: fd.requiredTolerance || '',
      weldingSpecification: fd.weldingSpecification || '',
      weldingProcess: fd.weldingProcess || '',
      weldType: fd.weldType || '',
      jointType: fd.jointType || '',
      hardFacingRequirement: fd.hardFacingRequirement || '',
      surfaceTreatment: fd.surfaceTreatment || '',
      heatTreatmentRequirement: fd.heatTreatmentRequirement || '',
      specialInstructions: fd.specialInstructions || '',
    }),
    summaryDrawing: (tv, order) => tv.drawingNumber || order.drawingNumber || '—',
    summaryMaterial: (tv) => tv.materialGrade || tv.materialType || '—',
  },
};

/** Determine the production type key from an order. */
const prodType = (order) => order?.productionType || order?.department || '';

export default function TechnicalVerificationPage() {
  /* Access Management: Print/Export PDF need technicalVerification.print.
     The verify/reject writes are gated server-side by technicalVerification.approve. */
  const { can } = useProductionAccess();
  const allowTvPrint = can('technicalVerification', 'print');
  const navigate = useNavigate();
  const { orders } = useProductionOrders();
  const { technicalVerifications, saveTechnicalVerification, getTechnicalVerification, stats, refreshAll } = useTechnicalVerification();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showFiltersOpen, setShowFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedWo, setExpandedWo] = useState(null);
  const [expandedItem, setExpandedItem] = useState(null);
  const [formData, setFormData] = useState({});
  // Item whose verification form is open. A verified/rejected item is not
  // "Pending", so without this flag its Re-verify action opened a read-only
  // panel and the form was never rendered (the button did nothing).
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Merge Work Orders with their TV records — one row per Work Order
  const rows = useMemo(() => {
    return orders.map((order) => {
      // Check overall TV status: Verified if ALL items verified, Rejected if any rejected
      const items = order.items || [];
      let overallStatus = 'Pending';
      if (items.length > 0) {
        const itemStatuses = items.map((item) => {
          const tv = getTechnicalVerification(order.workOrder, item.id || item.productName);
          return tv?.verificationStatus || 'Pending';
        });
        if (itemStatuses.every((s) => s === 'Verified')) overallStatus = 'Verified';
        else if (itemStatuses.some((s) => s === 'Rejected')) overallStatus = 'Rejected';
      } else {
        const tv = getTechnicalVerification(order.workOrder);
        overallStatus = tv?.verificationStatus || 'Pending';
      }
      return {
        order,
        tv: getTechnicalVerification(order.workOrder),
        status: overallStatus,
      };
    });
  }, [orders, technicalVerifications]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const itemNames = (row.order.items || []).map((i) => i.productName).join(' ');
        const searchable = [
          row.order.workOrder,
          row.order.product,
          row.order.salesOrderNumber,
          itemNames,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      if (statusFilter !== 'All' && row.status !== statusFilter) return false;
      return true;
    });
  }, [rows, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (page > totalPages && totalPages > 0) setPage(totalPages);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalCount = stats?.total ?? rows.length;
  const pendingCount = stats?.pending ?? rows.filter((r) => r.status === 'Pending').length;
  const verifiedCount = stats?.verified ?? rows.filter((r) => r.status === 'Verified').length;
  const rejectedCount = stats?.rejected ?? rows.filter((r) => r.status === 'Rejected').length;

  /** Initialise form data from Work Order item + saved TV record. */
  const initForm = (itemKey) => {
    // Find the Work Order row and the specific item
    let foundRow = null;
    let foundItem = null;
    for (const r of rows) {
      const items = r.order.items || [];
      for (const item of items) {
        if (`${r.order.workOrder}-${item.id || item.productName}` === itemKey) {
          foundRow = r;
          foundItem = item;
          break;
        }
      }
      if (foundRow) break;
    }
    if (!foundRow || !foundItem) return;
    const tv = getTechnicalVerification(foundRow.order.workOrder, foundItem.id || foundItem.productName) || {};
    const o = foundRow.order;
    const pt = foundItem.productionType || prodType(o);
    const config = TV_FIELD_CONFIG[pt];
    if (!config) return;

    const data = {};
    // Auto-filled fields: saved TV value → WO value → empty
    config.auto.forEach((f) => {
      data[f.key] = tv[f.key] || o[f.woKey] || '';
    });
    // Editable fields: saved TV value → WO value → empty
    [...config.editable, ...(config.wideEditable || [])].forEach((f) => {
      data[f.key] = tv[f.key] || '';
    });
    // Checklist
    data.checklist = {};
    config.checklist.forEach((item) => {
      data.checklist[item] = tv.checklist?.[item] || '';
    });
    data.verificationRemarks = tv.verificationRemarks || '';
    setFormData(data);
  };

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleChecklist = (item) => {
    setFormData((prev) => ({
      ...prev,
      checklist: {
        ...prev.checklist,
        [item]: prev.checklist[item] === 'Yes' ? '' : 'Yes',
      },
    }));
  };

  /**
   * Save the verification record for the given Work Order item.
   * The result is awaited and reported — a rejected save (e.g. HTTP 500) used
   * to close the form and leave the row showing "Pending" with no explanation.
   */
  const handleVerify = async (itemKey, status) => {
    // Find the Work Order row and the specific item
    let foundRow = null;
    let foundItem = null;
    for (const r of rows) {
      const items = r.order.items || [];
      for (const item of items) {
        if (`${r.order.workOrder}-${item.id || item.productName}` === itemKey) {
          foundRow = r;
          foundItem = item;
          break;
        }
      }
      if (foundRow) break;
    }
    if (!foundRow || !foundItem) return;
    const now = new Date().toISOString();
    const o = foundRow.order;
    const item = foundItem;
    const pt = item.productionType || prodType(o);
    const config = TV_FIELD_CONFIG[pt];
    if (!config) return;

    setSaving(true);
    const result = await saveTechnicalVerification({
      workOrderId: o.workOrder,
      // always store a string: the API returns it as a string and the
      // context looks records up by string, so a numeric id would never match
      itemId: String(item?.id || item?.productName || ''),
      workOrderNumber: o.workOrder,
      productionOrderNumber: o.salesOrderNumber || o.workOrder,
      itemProduct: item?.productName || item?.product || o.product || '',
      productionType: pt,
      requiredQuantity: item?.quantity || o.quantity || 0,
      ...config.saveMap(formData),
      checklist: formData.checklist || {},
      verifiedBy: 'Current User',
      verificationDateTime: now,
      verificationStatus: status,
      verificationRemarks: formData.verificationRemarks || '',
    });
    setSaving(false);

    if (result?.ok) {
      setFeedback({
        message: `${item?.productName || item?.product || 'Item'} marked ${status} for ${o.workOrder}.`,
        tone: status === 'Rejected' ? 'info' : 'success',
      });
      setExpandedItem(null);
      setEditingItem(null);
      setFormData({});
    } else {
      setFeedback({ message: result?.error || 'Could not save the technical verification.', tone: 'error' });
    }
  };

  /** Reload records + counters from the database. */
  const handleRefresh = async () => {
    const ok = await refreshAll();
    setFeedback(
      ok === false
        ? { message: 'Could not reload technical verifications from the server.', tone: 'error' }
        : { message: 'Technical verifications reloaded from the database.', tone: 'success' }
    );
  };

  /** Render a single auto-filled field (read-only, green badge or "Not Provided"). */
  const renderAutoField = (fieldKey, label, value) => (
    <div className="ack-expand-field" key={fieldKey}>
      <span className="ack-expand-label">{label}</span>
      {value ? (
        <span className="ack-expand-value tv-auto-filled">{value}</span>
      ) : (
        <span className="ack-expand-value tv-not-provided">Not Provided</span>
      )}
    </div>
  );

  /** Render a single editable text field. */
  const renderEditableField = (fieldKey, label, placeholder) => (
    <div className="ack-expand-field" key={fieldKey}>
      <span className="ack-expand-label">{label}</span>
      <input
        type="text"
        className="form-input"
        value={formData[fieldKey] || ''}
        onChange={(e) => updateField(fieldKey, e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );

  /** Render a single wide editable textarea field. */
  const renderWideEditableField = (fieldKey, label, placeholder, rows = 2) => (
    <div className="ack-expand-field ack-expand-field-wide" key={fieldKey}>
      <span className="ack-expand-label">{label}</span>
      <textarea
        className="form-textarea"
        rows={rows}
        value={formData[fieldKey] || ''}
        onChange={(e) => updateField(fieldKey, e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <div className="page">
      <ActionFeedback
        message={feedback?.message}
        tone={feedback?.tone}
        onDismiss={() => setFeedback(null)}
      />

      <PageHeader
        title="Technical Verification"
        subtitle="Verify drawings, specifications and technical requirements before production."
      />

      {/* Summary cards — Production Orders KPI style */}
      <div className="ack-page-summary">
        {[
          { tone: 'neutral', icon: 'clipboard', num: totalCount, label: 'Total', cardClass: 'total-card' },
          { tone: 'amber', icon: 'clock', num: pendingCount, label: 'Pending', cardClass: 'pending-card' },
          { tone: 'green', icon: 'check', num: verifiedCount, label: 'Verified', cardClass: 'completed-card' },
          { tone: 'red', icon: 'x', num: rejectedCount, label: 'Rejected', cardClass: 'rejected-card' },
        ].map((card) => {
          const filterVal = card.label === 'Total' ? 'All' : card.label;
          const isActive = statusFilter === filterVal;
          return (
            <div
              key={card.label}
              className={`ack-page-summary-card ${card.cardClass}${isActive ? ' card-active' : ''}`}
              onClick={() => { setStatusFilter(filterVal); setPage(1); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStatusFilter(filterVal); setPage(1); } }}
            >
              <div className="ack-page-summary-icon-num">
                <span className="ack-page-summary-icon">
                  <Icon name={card.icon} size={19} />
                </span>
                <div className="ack-page-summary-value">{card.num}</div>
              </div>
              <div className="ack-page-summary-label">{card.label}</div>
            </div>
          );
        })}
      </div>

      {/* Toolbar — Production Orders pattern */}
      <div className="ack-toolbar">
        <div className="ack-toolbar-left">
          <button type="button" className="ack-ghost-btn" onClick={() => setShowFiltersOpen((v) => !v)}>
            <Icon name={showFiltersOpen ? 'eye-off' : 'filter'} size={11} /> {showFiltersOpen ? 'Hide Filters' : 'Show Filters'}
          </button>
          <button type="button" className="ack-ghost-btn" onClick={handleRefresh}>
            <Icon name="refresh-cw" size={11} /> Refresh
          </button>
        </div>
        <div className="ack-toolbar-right">
          <div className="ack-search-input">
            <Icon name="search" size={14} />
            <input
              type="text"
              placeholder="Search Work Order or Item..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            />
          </div>
          <span className="ack-record-count">
            {filtered.length > 0 ? `Showing 1–${Math.min(PAGE_SIZE, filtered.length)} of ${filtered.length}` : 'No records'}
          </span>
        </div>
      </div>

      {/* Collapsible filter panel */}
      {showFiltersOpen && (
        <div className="ack-filter-panel">
          <div className="ack-filter-field">
            <label>Status</label>
            <select
              className="journey-status-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              {['All', 'Pending', 'Verified', 'Rejected'].map((s) => (
                <option key={s} value={s}>{s === 'All' ? 'All' : s}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <section className="orders-card">

        {/* Table */}
        <div className="table-scroll">
          {/* Sticky grid (shared Production scope): selection column frozen at
              left: 0, Work Order frozen beside it, Actions frozen at right: 0 —
              offsets come from the shared `.sgrid-prod` scope. */}
          <table className="data-table sgrid sgrid-prod sgrid-cb sgrid-actions">
            <thead>
              <tr>
                <th className="pt-checkbox-col sgrid-pin sgrid-first">
                  <input type="checkbox" className="pt-checkbox" aria-label="Select all" />
                </th>
                <th className="sgrid-pin">Work Order</th>
                <th>Items</th>
                <th>Production Type</th>
                <th>Status</th>
                <th className="sgrid-pin-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-muted)' }}>
                    No Work Orders found.
                  </td>
                </tr>
              )}
              {pageRows.map((row) => {
                const isPending = row.status === 'Pending';
                const isVerified = row.status === 'Verified';
                const isRejected = row.status === 'Rejected';
                const isExpanded = expandedWo === row.order.workOrder;
                const items = row.order.items || [];
                // Determine production types present in this Work Order
                const typeSet = new Set(items.map((i) => i.productionType).filter(Boolean));
                const typeLabels = [...typeSet].join(', ') || prodType(row.order) || '—';
                return (
                  <React.Fragment key={row.order.workOrder}>
                    <tr className={`kpi-row-${(row.status || 'all').toLowerCase().replace(/\s+/g, '-')}`}>
                      <td className="pt-checkbox-col sgrid-pin sgrid-first">
                        <input type="checkbox" className="pt-checkbox" aria-label={`Select ${row.order.workOrder}`} />
                      </td>
                      <td className="cell-strong sgrid-pin">
                        {/* In-app navigation to the dedicated detail route. This
                            used to be `target="_blank"`, so opening a record
                            threw the user into a second browser tab and the
                            detail was never presented as part of the app. */}
                        <Link to={`/production/technical-verification/${row.order.id || row.order.workOrder}`} style={{ color: '#075E54', fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }} onClick={(e) => e.stopPropagation()}>
                          {row.order.workOrder}
                        </Link>
                      </td>
                      <td>{items.length > 0 ? `${items.length} item${items.length > 1 ? 's' : ''}` : (row.order.product || '—')}</td>
                      <td>
                        <span className="ack-status-badge" style={{ background: '#e0e7ff', color: '#3730a3' }}>
                          {typeLabels}
                        </span>
                      </td>
                      <td>
                        <span className={`ack-status-badge ${isVerified ? 'ack-status-acknowledged' : isRejected ? 'tv-status-rejected' : 'ack-status-pending'}`}>
                          <Icon name={isVerified ? 'check' : isRejected ? 'x' : 'clock'} size={12} />
                          {row.status}
                        </span>
                      </td>
                      <td className="sgrid-pin-actions">
                        <RowActionsDropdown
                          actions={[
                            {
                              label: 'Preview',
                              icon: <Icon name="eye" size={13} />,
                              onClick: () => navigate(`/production/preview/technical-verification/${encodeURIComponent(row.order.workOrder || row.order.id)}`),
                            },
                            {
                              label: 'View Details',
                              // Opens the dedicated full-page detail in the app
                              // itself (was `window.open(..., '_blank')`, which
                              // left the list behind in this tab and rendered
                              // the detail outside the app shell).
                              icon: <Icon name="external-link" size={13} />,
                              onClick: () => navigate(`/production/technical-verification/${row.order.id || row.order.workOrder}`),
                            },
                            // Toggles the inline verification panel for this Work Order
                            // (same idiom as the Acknowledgement page's row action).
                            // It previously opened a new browser tab, which left the
                            // whole inline item/checklist form unreachable because
                            // nothing else ever set `expandedWo`. It stays available
                            // for verified/rejected orders so items can be re-verified.
                            {
                              label: isExpanded
                                ? 'Hide Verification'
                                : (row.status === 'Pending' ? 'Verify' : 'Re-verify'),
                              icon: <Icon name={isExpanded ? 'eye-off' : row.status === 'Pending' ? 'check' : 'edit'} size={13} />,
                              onClick: () => {
                                setExpandedItem(null);
                                setEditingItem(null);
                                setExpandedWo(isExpanded ? null : row.order.workOrder);
                              },
                            },
                            ...(allowTvPrint ? [{
                              label: 'Print',
                              icon: <Icon name="printer" size={13} />,
                              onClick: () => window.print(),
                            },
                            {
                              label: 'Export PDF',
                              icon: <Icon name="download" size={13} />,
                              onClick: () => {
                                import('pdf-lib').then(({ PDFDocument, rgb, StandardFonts }) => {
                                  const pdfDoc = PDFDocument.create();
                                  pdfDoc.then(async (doc) => {
                                    const font = await doc.embedFont(StandardFonts.Helvetica);
                                    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
                                    const page = doc.addPage([842, 595]);
                                    let y = 560;
                                    page.drawText('Technical Verification', { x: 40, y, size: 18, font: boldFont, color: rgb(0.13, 0.55, 0.13) });
                                    const rows = [`${row.order.workOrder} | ${items.length} items | ${typeLabels} | ${row.status}`];
                                    y -= 40;
                                    rows.forEach((r) => { page.drawText(r, { x: 40, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) }); y -= 16; });
                                    const bytes = await doc.save();
                                    const blob = new Blob([bytes], { type: 'application/pdf' });
                                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `TV_${row.order.workOrder}.pdf`; a.click();
                                  });
                                });
                              },
                            }] : []),
                          ]}
                        />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="ack-expand-row">
                        <td colSpan={6}>
                          <div className="ack-expand-panel">
                            {/* Work Order Info */}
                            <div className="tv-section-divider">
                              <h4>{row.order.workOrder} — Items</h4>
                            </div>

                            {/* Items list with per-item Verify */}
                            {items.length > 0 ? (
                              items.map((item) => {
                                // stable key for this Work Order item, used by the
                                // expand / verify handlers below
                                const itemKey = `${row.order.workOrder}-${item.id || item.productName}`;
                                const itemTv = getTechnicalVerification(row.order.workOrder, item.id || item.productName);
                                const itemStatus = itemTv?.verificationStatus || 'Pending';
                                const itemPt = item.productionType || '';
                                const itemConfig = TV_FIELD_CONFIG[itemPt];
                                const isItemVerified = itemStatus === 'Verified';
                                const isItemRejected = itemStatus === 'Rejected';
                                const isItemPending = itemStatus === 'Pending';
                                const itemExpanded = expandedItem === itemKey;
                                return (
                                  <div key={item.id || item.productName} style={{ padding: '12px 0', borderBottom: '1px solid var(--color-border, #eee)' }}>
                                    <div
                                      style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', cursor: 'pointer' }}
                                      onClick={() => {
                                        if (expandedItem === itemKey) {
                                          setExpandedItem(null);
                                          setEditingItem(null);
                                        } else {
                                          initForm(itemKey);
                                          setEditingItem(null);
                                          setExpandedItem(itemKey);
                                        }
                                      }}
                                    >
                                      <span style={{ fontWeight: 600, fontSize: 13 }}>{item.productName || item.product || '—'}</span>
                                      <span className="ack-status-badge" style={{ background: '#e0e7ff', color: '#3730a3', fontSize: 11 }}>
                                        {itemPt || '—'}
                                      </span>
                                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Qty: {item.quantity || '—'}</span>
                                      <span className={`ack-status-badge ${isItemVerified ? 'ack-status-acknowledged' : isItemRejected ? 'tv-status-rejected' : 'ack-status-pending'}`} style={{ fontSize: 11 }}>
                                        <Icon name={isItemVerified ? 'check' : isItemRejected ? 'x' : 'clock'} size={11} />
                                        {itemStatus}
                                      </span>
                                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                                        {isItemPending && (
                                          <button
                                            type="button"
                                            className="btn btn-sm btn-primary"
                                            onClick={() => {
                                              initForm(itemKey);
                                              setEditingItem(null);
                                              setExpandedItem(itemKey);
                                            }}
                                          >
                                            <Icon name="edit" size={12} /> Verify
                                          </button>
                                        )}
                                        {!isItemPending && (
                                          <span className="ack-status-badge" style={{ background: '#d1fae5', color: '#065f46', fontSize: 11 }}>
                                            <Icon name="check" size={11} /> {itemStatus}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Per-item TV details or form (expanded) */}
                                    {itemExpanded && (
                                      <div style={{ marginTop: 12, padding: 14, background: 'var(--color-bg, #f8faf8)', borderRadius: 8, border: '1px solid var(--color-border, #e0e0e0)' }}>
                                        {/* Show saved TV details for verified/rejected items
                                            (hidden while the record is being re-verified) */}
                                        {(!isItemPending && itemTv && itemConfig && itemKey !== editingItem) && (
                                          <>
                                            <div className="tv-section-divider"><h4>{itemConfig.title}</h4></div>
                                            <div className="ack-expand-fields">
                                              {itemConfig.auto.map((f) => renderAutoField(f.key, f.label, itemTv[f.key]))}
                                              {itemConfig.editable.map((f) => renderAutoField(f.key, f.label, itemTv[f.key]))}
                                            </div>
                                            {itemTv.checklist && Object.keys(itemTv.checklist).length > 0 && (
                                              <>
                                                <div className="tv-section-divider"><h4>Verification Checklist</h4></div>
                                                <div className="tv-checklist">
                                                  {itemConfig.checklist.map((ci) => (
                                                    <label key={ci} className="tv-checklist-item" style={{ cursor: 'default' }}>
                                                      <input type="checkbox" checked={itemTv.checklist[ci] === 'Yes'} disabled readOnly />
                                                      <span>{ci}</span>
                                                    </label>
                                                  ))}
                                                </div>
                                              </>
                                            )}
                                            {itemTv.verificationRemarks && (
                                              <>
                                                <div className="tv-section-divider"><h4>Verification Remarks</h4></div>
                                                <p style={{ fontSize: 13, color: 'var(--color-text-secondary, #555)', margin: 0 }}>{itemTv.verificationRemarks}</p>
                                              </>
                                            )}
                                            {itemTv.verifiedBy && (
                                              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>
                                                Verified by <strong>{itemTv.verifiedBy}</strong> on {formatDateTime(itemTv.verificationDateTime)}
                                              </div>
                                            )}
                                            <div className="ack-expand-actions" style={{ marginTop: 10 }}>
                                              <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => { setExpandedItem(null); setEditingItem(null); }}
                                              >
                                                Close
                                              </button>
                                              <button
                                                type="button"
                                                className="btn btn-sm btn-primary"
                                                onClick={() => {
                                                  // Open the editable form pre-filled with the
                                                  // saved record so the verification can be
                                                  // corrected and saved again.
                                                  initForm(itemKey);
                                                  setEditingItem(itemKey);
                                                  setExpandedItem(itemKey);
                                                }}
                                              >
                                                <Icon name="edit" size={12} /> Re-verify
                                              </button>
                                            </div>
                                          </>
                                        )}

                                        {/* Show form for pending items (or when re-verifying) */}
                                        {(isItemPending || itemKey === editingItem) && itemConfig && (
                                          <>
                                            <div className="ack-expand-fields">
                                              {itemConfig.auto.map((f) => renderAutoField(f.key, f.label, formData[f.key]))}
                                              {itemConfig.editable.map((f) => renderEditableField(f.key, f.label, f.placeholder))}
                                              {(itemConfig.wideEditable || []).map((f) =>
                                                renderWideEditableField(f.key, f.label, f.placeholder, f.rows || 2)
                                              )}
                                            </div>

                                            <div className="tv-section-divider"><h4>Verification Checklist</h4></div>
                                            <div className="tv-checklist">
                                              {itemConfig.checklist.map((ci) => (
                                                <label key={ci} className="tv-checklist-item">
                                                  <input
                                                    type="checkbox"
                                                    checked={(formData.checklist || {})[ci] === 'Yes'}
                                                    onChange={() => toggleChecklist(ci)}
                                                  />
                                                  <span>{ci}</span>
                                                </label>
                                              ))}
                                            </div>

                                            <div className="tv-section-divider"><h4>Verification Remarks</h4></div>
                                            <div className="ack-expand-fields">
                                              <div className="ack-expand-field ack-expand-field-wide">
                                                <textarea
                                                  className="form-textarea"
                                                  rows={2}
                                                  value={formData.verificationRemarks || ''}
                                                  onChange={(e) => updateField('verificationRemarks', e.target.value)}
                                                  placeholder="Add verification remarks..."
                                                />
                                              </div>
                                            </div>

                                            <div className="ack-expand-actions" style={{ marginTop: 10 }}>
                                              <button
                                                type="button"
                                                className="btn btn-secondary"
                                                onClick={() => { setExpandedItem(null); setEditingItem(null); setFormData({}); }}
                                              >
                                                Cancel
                                              </button>
                                              <button
                                                type="button"
                                                className="btn btn-danger"
                                                disabled={saving}
                                                onClick={() => handleVerify(itemKey, 'Rejected')}
                                              >
                                                <Icon name="x" size={14} /> Reject
                                              </button>
                                              <button
                                                type="button"
                                                className="btn btn-primary"
                                                disabled={saving}
                                                onClick={() => handleVerify(itemKey, 'Verified')}
                                              >
                                                <Icon name="check" size={14} />Verify
                                              </button>
                                            </div>
                                          </>
                                        )}

                                        {/* No config found for this production type */}
                                        {!itemConfig && (
                                          <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No TV configuration found for production type: {itemPt || 'Unknown'}</p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              <p style={{ color: 'var(--color-text-muted)', fontSize: 13, padding: '12px 0' }}>No items in this Work Order.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="sf-pagination">
            <span className="sf-pagination-info">
              Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="sf-pagination-controls">
              <button
                type="button"
                className="btn btn-secondary sf-pagination-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <Icon name="chevron-left" size={13} /> Prev
              </button>
              <span className="sf-pagination-page">Page {page} of {totalPages}</span>
              <button
                type="button"
                className="btn btn-secondary sf-pagination-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <Icon name="chevron-right" size={13} />
              </button>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
