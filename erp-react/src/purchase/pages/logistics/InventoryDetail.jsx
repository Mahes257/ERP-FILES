/**
 * purchase/pages/logistics/InventoryDetail.jsx
 * ------------------------------------------------------------------
 * Inventory Update Detail — full overview of a single stock movement:
 * movement summary (before / delta / after), product + warehouse
 * information, the related document chain (PO → packing → shipment →
 * GRN → inspection), movement history for the item and a current
 * stock summary derived from the movement ledger.
 *
 * Route: /purchase/logistics/inventory/:inventoryId
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Boxes, ChevronLeft, ClipboardCheck, FileSearch,
  LayoutDashboard, Loader2, PackageCheck, Receipt, RefreshCw, SlidersHorizontal, Truck, Undo2, Warehouse
} from 'lucide-react';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseHeader from '../../components/PurchaseHeader';
import { logisticsService, INVENTORY_TYPE, GRN_STATUS, grnsStore, inspectionsStore, inventoryStore, manufacturingStore, shipmentsStore } from '../../services/logistics';
import { ordersStore } from '../../services/purchaseOrder';
import { invoicesStore } from '../../services/invoice';
import { formatDate, formatDateTime } from '../../utils/helpers';
import '../../styles/cpr-list.css';

const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';
const VALUE = 'text-xs font-semibold text-slate-800';

/* Strings/numbers only — never render raw objects (values shaped like
   { label, to } from source-document lookups must not crash React). */
function text(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') {
    if (typeof value.label === 'string' && value.label !== '') return value.label;
    if (typeof value.name === 'string' && value.name !== '') return value.name;
    return JSON.stringify(value);
  }
  return String(value);
}

function Row({ label, value }) {
  return (
    <div className="py-1.5">
      <div className={LABEL}>{label}</div>
      <div className={`${VALUE} mt-0.5`}>{value}</div>
    </div>
  );
}

function TypeBadge({ type }) {
  const tone =
    type === INVENTORY_TYPE.RECEIPT
      ? 'bg-emerald-50 text-emerald-700'
      : type === INVENTORY_TYPE.ISSUE
        ? 'bg-amber-50 text-amber-600'
        : type === INVENTORY_TYPE.TRANSFER
          ? 'bg-violet-50 text-violet-700'
          : 'bg-sky-50 text-sky-600';
  const Icon =
    type === INVENTORY_TYPE.RECEIPT ? ArrowDownToLine
      : type === INVENTORY_TYPE.ISSUE ? ArrowUpFromLine
        : type === INVENTORY_TYPE.TRANSFER ? ArrowLeftRight
          : SlidersHorizontal;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${tone}`}>
      <Icon className="w-3.5 h-3.5" />
      {text(type)}
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="px-5 py-3 border-b border-slate-100">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

/* Existence checks against the live stores — document links only render
   when the linked record actually exists. */
const byGrnNo = (no) => Boolean(no) && grnsStore.all.some((entry) => entry.grnNo === no || entry.id === no);
const byPoNo = (no) => Boolean(no) && ordersStore.all.some((entry) => entry.poNo === no || entry.id === no);
const byShipmentNo = (no) => Boolean(no) && shipmentsStore.all.some((entry) => entry.shipmentNo === no || entry.id === no);
const byPackingNo = (no) => Boolean(no) && manufacturingStore.all.some((entry) => entry.packingNo === no || entry.id === no);
const byInspectionNo = (no) => Boolean(no) && inspectionsStore.all.some((entry) => entry.inspectionNo === no || entry.id === no);
const byInventoryId = (no) => Boolean(no) && inventoryStore.all.some((entry) => entry.id === no);

/* ═══════════════════════════════════════════════════════════════════ */
/*  Main Component                                                   */
/* ═══════════════════════════════════════════════════════════════════ */
export default function InventoryDetail() {
  const navigate = useNavigate();
  const { inventoryId } = useParams();

  const [item, setItem] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const data = await logisticsService.getInventoryById(inventoryId);
      if (!data) {
        setNotFound(true);
        return;
      }
      setItem(data);
      const ledgerData = await logisticsService.getInventoryLedgerForItem({
        sku: data.sku || '',
        product: data.product || '',
        warehouse: ''
      });
      setLedger(ledgerData);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [inventoryId]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  /* ── Related documents resolved from REAL records (never guessed) ── */
  const related = useMemo(() => {
    if (!item) return { grn: null, po: null, shipment: null, inspection: null, packing: null, reversalOf: null, reversal: null };
    const reference = text(item.reference, '');

    const grnNo =
      (item.grnNo && byGrnNo(item.grnNo) && item.grnNo) ||
      (/^GRN-/i.test(reference) && byGrnNo(reference) ? reference : null);
    const grn = grnNo ? grnsStore.all.find((entry) => entry.grnNo === grnNo || entry.id === grnNo) || null : null;

    const poNo =
      (item.poNo && byPoNo(item.poNo) && item.poNo) ||
      (/^PO-/i.test(reference) && byPoNo(reference) ? reference : null);
    const po = poNo ? ordersStore.all.find((entry) => entry.poNo === poNo || entry.id === poNo) || null : null;

    const shipmentNo =
      (item.shipmentNo && byShipmentNo(item.shipmentNo) && item.shipmentNo) ||
      (grn?.shipmentNo && byShipmentNo(grn.shipmentNo) ? grn.shipmentNo : null);
    const shipment = shipmentNo ? shipmentsStore.all.find((entry) => entry.shipmentNo === shipmentNo || entry.id === shipmentNo) || null : null;

    const packingNo =
      (shipment?.packingNo && byPackingNo(shipment.packingNo) && shipment.packingNo) || null;

    const inspectionNo =
      (item.inspectionNo && byInspectionNo(item.inspectionNo) && item.inspectionNo) ||
      (grn ? (inspectionsStore.all.find((entry) => entry.grnNo === grn.grnNo)?.inspectionNo || null) : null);

    const reversalOf = item.reversalOf && byInventoryId(item.reversalOf) ? item.reversalOf : null;
    const reversal = item.reversalId && byInventoryId(item.reversalId) ? item.reversalId : null;

    /* Vendor invoices raised against this movement's GRN / PO (vendor
       invoices are a separate document type — never an inventory
       movement). Live from the invoice store so a newly created invoice
       appears immediately. */
    const invoices = invoicesStore.all.filter((inv) => {
      if (grn && inv.grnNo === grn.grnNo) return true;
      return Boolean(po) && inv.poNo === po.poNo;
    });

    return { grn, po, shipment, inspection: inspectionNo, packing: packingNo, reversalOf, reversal, invoices };
  }, [item]);

  /* Derived quantities */
  const before = Number(item?.before) || 0;
  const delta = Number(item?.delta) || 0;
  const rawAfter = item?.after;
  const after = rawAfter !== undefined && rawAfter !== null && rawAfter !== '' ? Number(rawAfter) : before + delta;

  /* Invoice affordance — offer "Create Vendor Invoice" while the linked
     goods receipt has received stock and nothing is invoiced yet; once an
     invoice exists, jump straight to it (vendor invoices and inventory
     movements stay separate documents). */
  const movementInvoices = related.invoices || [];
  const linkedGrnReceivedQty = (related.grn?.items || []).reduce(
    (sum, line) => sum + (Number(line.received) || 0),
    0
  );
  const grnEligible =
    Boolean(related.grn) &&
    related.grn.status !== GRN_STATUS.EXPECTED &&
    linkedGrnReceivedQty > 0;
  const poEligible =
    Boolean(related.po) &&
    !related.grn &&
    item.type === INVENTORY_TYPE.RECEIPT &&
    delta > 0;
  const canCreateInvoice = (grnEligible || poEligible) && movementInvoices.length === 0;

  if (loading) {
    return (
      <PurchasePageLayout className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </PurchasePageLayout>
    );
  }

  if (notFound || !item) {
    return (
      <PurchasePageLayout>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <FileSearch className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">Inventory record not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been removed or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/logistics/inventory')}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
          >
            <ChevronLeft size={14} /> Back to Inventory Update
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  const quantityTone = delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-rose-600' : 'text-slate-600';
  const historyRows = (ledger?.records || []).filter((entry) => entry.id !== item.id);

  return (
    <PurchasePageLayout>
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Logistics', to: '/purchase/logistics' },
          { label: 'Inventory Update', to: '/purchase/logistics/inventory' },
          { label: text(item.id) }
        ]}
        icon={Boxes}
        title="Inventory Movement Overview"
        subtitle={`${text(item.id)} — ${text(item.product || item.sku)}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/purchase/logistics/inventory"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors"
            >
              <ChevronLeft size={12} /> Back to Inventory Update
            </Link>
            <button
              type="button"
              onClick={() => navigate(`/purchase/logistics/inventory/${item.id}/360`)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors cursor-pointer"
            >
              <LayoutDashboard size={13} /> 360° View
            </button>
            {canCreateInvoice && (
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/purchase/invoices/new?grn=${encodeURIComponent(related.grn?.grnNo || '')}&po=${encodeURIComponent(related.po?.poNo || '')}`
                  )
                }
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-3 py-2 rounded-lg transition-colors cursor-pointer"
              >
                <Receipt size={13} /> Create Vendor Invoice
              </button>
            )}
            {!canCreateInvoice && movementInvoices.length > 0 && (
              <button
                type="button"
                onClick={() => navigate(`/purchase/invoices/${movementInvoices[0].id}`)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-3 py-2 rounded-lg transition-colors cursor-pointer"
              >
                <Receipt size={13} /> View Invoice
              </button>
            )}
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        }
      />

      <div className="space-y-5 pb-8">

        {/* ── MOVEMENT OVERVIEW ── */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Movement Overview</h3>
            <TypeBadge type={item.type} />
          </div>
          <div className="px-5 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
              <Row label="Inventory Ref No" value={text(item.id)} />
              <Row label="SKU" value={text(item.sku || item.itemCode)} />
              <Row label="Product" value={text(item.product)} />
              <Row label="Warehouse" value={text(item.warehouse)} />
              <Row label="Before Quantity" value={<span className="tabular-nums">{before}</span>} />
              <Row
                label="Delta"
                value={<span className={`font-bold tabular-nums ${quantityTone}`}>{delta > 0 ? `+${delta}` : delta}</span>}
              />
              <Row label="After Quantity" value={<span className="tabular-nums font-bold">{after}</span>} />
              <Row
                label="Source Reference"
                value={
                  related.grn ? (
                    <Link to={`/purchase/logistics/grn/${related.grn.grnNo}`} className="text-[#0B4A3D] hover:underline font-semibold">
                      {related.grn.grnNo}
                    </Link>
                  ) : related.po ? (
                    <Link to={`/purchase/orders/${related.po.poNo}`} className="text-[#0B4A3D] hover:underline font-semibold">
                      {related.po.poNo}
                    </Link>
                  ) : text(item.reference)
                }
              />
              <Row label="Updated By" value={text(item.updatedBy)} />
              <Row label="Updated Date" value={formatDate(item.updatedOn || item.createdAt)} />
              {item.createdAt && <Row label="Created At" value={formatDateTime(item.createdAt)} />}
              {item.status && <Row label="Status" value={text(item.status)} />}
            </div>
            {text(item.notes, '') && (
              <div className="mt-3 rounded-lg bg-amber-50/70 border border-amber-100 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Notes</div>
                <p className="text-xs text-slate-700 mt-1">{text(item.notes)}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── QUANTITY MOVEMENT (before → delta → after) ── */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Quantity Movement</h3>
          </div>
          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3 text-center">
              <div className={LABEL}>Before Qty</div>
              <div className="text-xl font-extrabold text-slate-800 mt-1 tabular-nums">{before}</div>
            </div>
            <div className={`rounded-lg border px-4 py-3 text-center ${delta > 0 ? 'border-emerald-100 bg-emerald-50/40' : delta < 0 ? 'border-rose-100 bg-rose-50/40' : 'border-slate-100 bg-slate-50/60'}`}>
              <div className={LABEL}>{delta > 0 ? 'Stock In (+)' : delta < 0 ? 'Stock Out (−)' : 'No Change'}</div>
              <div className={`text-xl font-extrabold mt-1 tabular-nums ${quantityTone}`}>{delta > 0 ? `+${delta}` : delta}</div>
            </div>
            <div className="rounded-lg border border-[#0B4A3D]/20 bg-[#EDF7F4] px-4 py-3 text-center">
              <div className={LABEL}>After Qty</div>
              <div className="text-xl font-extrabold text-[#0B4A3D] mt-1 tabular-nums">{after}</div>
            </div>
          </div>
        </div>

        {/* ── MOVEMENT DETAILS + PRODUCT + WAREHOUSE ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-1">
            <Section title="Movement Details">
              <div className="grid grid-cols-1 gap-y-1">
                <Row label="Reference No" value={text(item.id)} />
                <Row label="Movement Type" value={<TypeBadge type={item.type} />} />
                <Row label="Reference" value={text(item.reference)} />
                <Row label="Recorded By" value={text(item.updatedBy)} />
                <Row label="Recorded On" value={formatDateTime(item.createdAt)} />
                <Row label="Movement Date" value={formatDate(item.updatedOn)} />
                {(related.reversalOf || related.reversal) && (
                  <Row
                    label={related.reversalOf ? 'Reverses' : 'Reversed By'}
                    value={
                      <Link
                        to={`/purchase/logistics/inventory/${related.reversalOf || related.reversal}`}
                        className="inline-flex items-center gap-1 text-[#0B4A3D] hover:underline font-semibold"
                      >
                        <Undo2 size={12} /> {related.reversalOf || related.reversal}
                      </Link>
                    }
                  />
                )}
              </div>
            </Section>
          </div>

          <div className="lg:col-span-1">
            <Section title="Product Information">
              <div className="grid grid-cols-1 gap-y-1">
                <Row label="SKU / Item Code" value={text(item.sku || item.itemCode)} />
                <Row label="Product" value={text(item.product)} />
                <Row label="UOM" value={text(item.uom, 'Nos')} />
                <Row label="Batch / Lot" value={text(item.batchLot)} />
                {item.itemCode && item.itemCode !== item.sku && <Row label="Catalog Code" value={text(item.itemCode)} />}
              </div>
            </Section>
          </div>

          <div className="lg:col-span-1">
            <Section title="Warehouse Information">
              <div className="grid grid-cols-1 gap-y-1">
                <Row label="Warehouse" value={
                  <span className="inline-flex items-center gap-1.5"><Warehouse size={12} className="text-slate-400" /> {text(item.warehouse)}</span>
                } />
                <Row label="Location" value={text(item.location)} />
              </div>
            </Section>
          </div>
        </div>

        {/* ── RELATED DOCUMENT / SOURCE CHAIN ── */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Related Documents</h3>
            {canCreateInvoice && (
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/purchase/invoices/new?grn=${encodeURIComponent(related.grn?.grnNo || '')}&po=${encodeURIComponent(related.po?.poNo || '')}`
                  )
                }
                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <Receipt size={12} /> Create Vendor Invoice
              </button>
            )}
          </div>
          <div className="px-5 py-4">
            {(related.po || related.packing || related.shipment || related.grn || related.inspection || related.invoices.length > 0) ? (
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}
              >
                {related.po && (
                  <Link
                    to={`/purchase/orders/${related.po.poNo}`}
                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
                      <FileSearch size={14} className="text-sky-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Purchase Order</div>
                      <div className="text-xs font-bold text-[#0B4A3D] truncate">{related.po.poNo}</div>
                    </div>
                  </Link>
                )}
                {related.packing && (
                  <Link
                    to={`/purchase/logistics/manufacturing/${related.packing}`}
                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                      <Boxes size={14} className="text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Packing</div>
                      <div className="text-xs font-bold text-[#0B4A3D] truncate">{related.packing}</div>
                    </div>
                  </Link>
                )}
                {related.shipment && (
                  <Link
                    to={`/purchase/logistics/shipment/${related.shipment.shipmentNo}`}
                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                      <Truck size={14} className="text-amber-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Shipment</div>
                      <div className="text-xs font-bold text-[#0B4A3D] truncate">{related.shipment.shipmentNo}</div>
                    </div>
                  </Link>
                )}
                {related.grn && (
                  <Link
                    to={`/purchase/logistics/grn/${related.grn.grnNo}`}
                    className="flex items-center gap-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50/30 hover:border-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                      <PackageCheck size={14} className="text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Goods Receipt (GRN)</div>
                      <div className="text-xs font-bold text-[#0B4A3D] truncate">{related.grn.grnNo}</div>
                    </div>
                  </Link>
                )}
                {related.inspection && (
                  <Link
                    to={`/purchase/logistics/quality/${related.inspection}`}
                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
                      <ClipboardCheck size={14} className="text-violet-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Inspection</div>
                      <div className="text-xs font-bold text-[#0B4A3D] truncate">{related.inspection}</div>
                    </div>
                  </Link>
                )}
                {related.invoices.map((inv) => (
                  <Link
                    key={inv.id}
                    to={`/purchase/invoices/${inv.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg border border-rose-200 bg-rose-50/30 hover:border-[#0B4A3D] hover:bg-[#EDF7F4] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
                      <Receipt size={14} className="text-rose-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vendor Invoice</div>
                      <div className="text-xs font-bold text-[#0B4A3D] truncate">{inv.invoiceNo}</div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No linked documents — {text(item.reference, 'this movement carries no source reference') || 'no source reference'}.
              </p>
            )}
          </div>
        </div>

        {/* ── CURRENT STOCK SUMMARY ── */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Current Stock Summary</h3>
          </div>
          <div className="px-5 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="rounded-lg border border-[#0B4A3D]/20 bg-[#EDF7F4] px-4 py-3">
                <div className={LABEL}>On Hand</div>
                <div className="text-xl font-extrabold text-[#0B4A3D] mt-1 tabular-nums">{ledger?.onHand ?? 0}</div>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3">
                <div className={LABEL}>Total Movements</div>
                <div className="text-xl font-extrabold text-slate-800 mt-1 tabular-nums">{ledger?.totalMovements ?? 0}</div>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-4 py-3">
                <div className={LABEL}>Receipts</div>
                <div className="text-xl font-extrabold text-emerald-700 mt-1 tabular-nums">{ledger?.receipts ?? 0}</div>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50/40 px-4 py-3">
                <div className={LABEL}>Issues</div>
                <div className="text-xl font-extrabold text-amber-700 mt-1 tabular-nums">{ledger?.issues ?? 0}</div>
              </div>
              <div className="rounded-lg border border-sky-100 bg-sky-50/40 px-4 py-3">
                <div className={LABEL}>Adjustments</div>
                <div className="text-xl font-extrabold text-sky-700 mt-1 tabular-nums">{ledger?.adjustments ?? 0}</div>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3">
                <div className={LABEL}>Net In / Out</div>
                <div className="text-xl font-extrabold text-slate-800 mt-1 tabular-nums">
                  <span className="text-emerald-700">+{ledger?.netIn ?? 0}</span>
                  <span className="text-slate-300 mx-1">/</span>
                  <span className="text-rose-600">-{ledger?.netOut ?? 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── INVENTORY MOVEMENT HISTORY ── */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Inventory Movement History</h3>
            <span className="text-[10px] font-bold text-slate-400">
              {text(item.sku || item.product)}{item.warehouse ? ` · ${text(item.warehouse)}` : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 text-left font-bold text-slate-500">Ref No</th>
                  <th className="px-4 py-2.5 text-left font-bold text-slate-500">Date/Time</th>
                  <th className="px-4 py-2.5 text-left font-bold text-slate-500">Type</th>
                  <th className="px-4 py-2.5 text-right font-bold text-slate-500">Before</th>
                  <th className="px-4 py-2.5 text-right font-bold text-slate-500">Delta</th>
                  <th className="px-4 py-2.5 text-right font-bold text-slate-500">After</th>
                  <th className="px-4 py-2.5 text-left font-bold text-slate-500">Warehouse</th>
                  <th className="px-4 py-2.5 text-left font-bold text-slate-500">Reference</th>
                  <th className="px-4 py-2.5 text-left font-bold text-slate-500">User</th>
                </tr>
              </thead>
              <tbody>
                {/* Current movement pinned first */}
                <tr className="border-b border-[#0B4A3D]/15 bg-[#EDF7F4]/60">
                  <td className="px-4 py-2.5 font-bold text-[#0B4A3D] whitespace-nowrap">
                    <Link to={`/purchase/logistics/inventory/${item.id}`} className="hover:underline">
                      {text(item.id)}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDateTime(item.createdAt)}</td>
                  <td className="px-4 py-2.5"><TypeBadge type={item.type} /></td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{before}</td>
                  <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${quantityTone}`}>{delta > 0 ? `+${delta}` : delta}</td>
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums text-slate-800">{after}</td>
                  <td className="px-4 py-2.5 text-slate-600">{text(item.warehouse)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{text(item.reference)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{text(item.updatedBy)}</td>
                </tr>
                {historyRows.length === 0 && (
                  <tr>
                    <td colSpan="9" className="px-4 py-6 text-center text-xs text-slate-400">
                      No other movements recorded for this item.
                    </td>
                  </tr>
                )}
                {historyRows.map((entry) => {
                  const rowDelta = Number(entry.delta) || 0;
                  return (
                    <tr key={entry.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-semibold text-[#0B4A3D] whitespace-nowrap">
                        <Link to={`/purchase/logistics/inventory/${entry.id}`} className="hover:underline">
                          {text(entry.id)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDateTime(entry.createdAt)}</td>
                      <td className="px-4 py-2.5"><TypeBadge type={entry.type} /></td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{text(entry.before)}</td>
                      <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${rowDelta > 0 ? 'text-emerald-700' : rowDelta < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                        {rowDelta > 0 ? `+${rowDelta}` : rowDelta}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums text-slate-700">{text(entry.after)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{text(entry.warehouse)}</td>
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{text(entry.reference)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{text(entry.updatedBy)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PurchasePageLayout>
  );
}
