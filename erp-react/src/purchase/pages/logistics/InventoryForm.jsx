/**
 * purchase/pages/logistics/InventoryForm.jsx
 * ------------------------------------------------------------------
 * Create form for manual stock movements (Inventory Update).
 * Standardized layout: accordion sections (closed by default),
 * right-side summary, sticky action bar, draft persistence.
 *
 * The user enters an item + movement type + quantity. On-hand stock,
 * delta sign and after quantity are derived from the movement ledger
 * (see services/logistics addInventoryUpdate + utils/inventoryMovement)
 * so every recorded movement reconciles with the ledger.
 *
 * Route: /purchase/logistics/inventory/new
 * ------------------------------------------------------------------
 */
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Boxes, RotateCcw, StickyNote, X } from 'lucide-react';
import {
  Accordion, ConfirmDialog, FormField, SelectInput, TextArea, TextInput, useToast
} from '../../components/ui';
import FormActions from '../../components/FormActions';
/* Page-scoped layout fix: this page has no header block, so AppLayout's
   useStickyPageHeader never neutralizes its inert scroller the way it
   does on PR Create — the rule below replicates that exact result so the
   sticky action footer pins to the viewport like the PR page. See the
   CSS file header for details. */
import '../../styles/inventory-form-footer.css';
import LogisticsFormSummary from '../../components/LogisticsFormSummary';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import '../../styles/cpr-list.css';
import { logisticsService, INVENTORY_TYPE } from '../../services/logistics';
import { getActiveItems, getItemByCode } from '../../services/itemCatalog';
import { movementPreview, transferPreview, MOVEMENT_QUANTITY_HINT } from '../../utils/inventoryMovement';
import useFormDraft from '../../hooks/useFormDraft';

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';

function buildFormValues(record = {}) {
  return {
    sku: record.sku || '',
    product: record.product || '',
    warehouse: record.warehouse || 'Plant A Store',
    type: record.type || INVENTORY_TYPE.ADJUSTMENT,
    quantity: String(record.quantity ?? ''),
    fromLocation: record.fromLocation || '',
    toWarehouse: record.toWarehouse || '',
    toLocation: record.toLocation || '',
    reference: record.reference || '',
    notes: record.notes || '',
    updatedBy: record.updatedBy || 'Stores Team',
    date: record.date || '',
  };
}

export default function InventoryForm() {
  const navigate = useNavigate();
  const toast = useToast();

  const { loadDraft, saveDraft: persistDraft, clearDraft } = useFormDraft({
    draftKey: 'purchase.inventory',
    recordId: null,
  });

  const form = useForm({ defaultValues: buildFormValues(), mode: 'onTouched' });
  const { register, handleSubmit, reset, control, setValue, formState: { errors } } = form;

  /* Item Master lookup: picking a catalog SKU fills the product name and
     defaults the warehouse, so stock movements reference the same item
     definitions as PR / PO / GRN. */
  const inventoryItems = getActiveItems();
  const skuRegistration = register('sku');
  const handleSkuSelect = (e) => {
    skuRegistration.onChange(e);
    const item = getItemByCode(e.target.value);
    if (!item) return;
    setValue('product', item.product, { shouldDirty: true });
    if (item.warehouse && !watchedValues?.warehouse) {
      setValue('warehouse', item.warehouse, { shouldDirty: true });
    }
  };
  const watchedValues = useWatch({ control });

  const [submitting, setSubmitting] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  /* Live on-hand stock for the selected item + warehouse. The ledger is
     the single source of truth — Before/Delta/After shown below (and the
     persisted record) derive from it. */
  const [stockPreview, setStockPreview] = useState(null);
  const [toStockPreview, setToStockPreview] = useState(null);
  const isTransfer = watchedValues?.type === INVENTORY_TYPE.TRANSFER;
  const lookupKey = `${(watchedValues?.sku || '').trim()}|${(watchedValues?.product || '').trim()}|${(watchedValues?.warehouse || '').trim()}`;
  const toLookupKey = `${(watchedValues?.sku || '').trim()}|${(watchedValues?.product || '').trim()}|${(watchedValues?.toWarehouse || '').trim()}`;
  useEffect(() => {
    let cancelled = false;
    if ((watchedValues?.warehouse || '').trim() && ((watchedValues?.sku || '').trim() || (watchedValues?.product || '').trim())) {
      logisticsService
        .getInventoryLedgerForItem({
          sku: (watchedValues?.sku || '').trim(),
          product: (watchedValues?.product || '').trim(),
          warehouse: (watchedValues?.warehouse || '').trim()
        })
        .then((data) => {
          if (!cancelled) setStockPreview({ onHand: data.onHand, key: lookupKey });
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupKey]);
  /* Destination on-hand when transferring between warehouses. */
  useEffect(() => {
    let cancelled = false;
    if (isTransfer && (watchedValues?.toWarehouse || '').trim() && ((watchedValues?.sku || '').trim() || (watchedValues?.product || '').trim())) {
      logisticsService
        .getInventoryLedgerForItem({
          sku: (watchedValues?.sku || '').trim(),
          product: (watchedValues?.product || '').trim(),
          warehouse: (watchedValues?.toWarehouse || '').trim()
        })
        .then((data) => {
          if (!cancelled) setToStockPreview({ onHand: data.onHand, key: toLookupKey });
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTransfer, toLookupKey]);

  /* Only trust preview state that matches the current form values. */
  const stock = stockPreview && stockPreview.key === lookupKey ? stockPreview : null;
  const toStock = toStockPreview && toStockPreview.key === toLookupKey ? toStockPreview : null;
  const preview = isTransfer
    ? movementPreview(watchedValues?.type, 0, stock?.onHand ?? 0)
    : movementPreview(watchedValues?.type, watchedValues?.quantity, stock?.onHand ?? 0);
  const transferView = isTransfer
    ? transferPreview(watchedValues?.quantity, stock?.onHand ?? 0, toStock?.onHand ?? 0)
    : null;

  /* Load draft on mount */
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    const draft = loadDraft();
    if (draft && typeof draft === 'object') {
      reset({ ...buildFormValues(), ...draft }, { keepDefaultValues: false });
      toast.info('Draft restored');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Debounced draft save */
  useEffect(() => {
    if (watchedValues) persistDraft(watchedValues);
  }, [watchedValues, persistDraft]);

  const persist = async (values, { draft = false, stay = false } = {}) => {
    if (draft) setDraftSaving(true);
    else setSubmitting(true);
    try {
      const quantity = Number(values.quantity);
      if (!Number.isFinite(quantity) || quantity === 0) {
        throw new Error('Enter a non-zero quantity');
      }
      if (values.type === INVENTORY_TYPE.TRANSFER && !(values.toWarehouse || '').trim()) {
        throw new Error('Destination warehouse is required for a transfer');
      }
      if (values.type === INVENTORY_TYPE.TRANSFER && quantity < 0) {
        throw new Error('Transfer quantity must be positive');
      }
      const common = {
        sku: (values.sku || '').trim(),
        product: (values.product || '').trim(),
        quantity,
        reference: (values.reference || '').trim(),
        notes: (values.notes || '').trim(),
        updatedBy: (values.updatedBy || '').trim() || 'Stores Team',
        date: values.date || undefined,
      };
      let record;
      if (values.type === INVENTORY_TYPE.TRANSFER) {
        const transfer = await logisticsService.transferStock({
          ...common,
          fromWarehouse: (values.warehouse || '').trim(),
          toWarehouse: (values.toWarehouse || '').trim(),
          fromLocation: (values.fromLocation || '').trim(),
          toLocation: (values.toLocation || '').trim()
        });
        record = transfer.source;
      } else {
        record = await logisticsService.addInventoryUpdate({
          ...common,
          warehouse: (values.warehouse || '').trim(),
          type: values.type,
        });
      }
      toast.success(draft ? 'Draft saved' : `${record.id} recorded — stock movement saved`);
      if (!draft) clearDraft();
      if (!stay) navigate('/purchase/logistics/inventory');
      return true;
    } catch (err) {
      toast.error(err?.message || 'Failed to record stock movement');
      return false;
    } finally {
      setSubmitting(false);
      setDraftSaving(false);
    }
  };

  const onSubmitSave = (values) => persist(values);
  const saveDraft = () => handleSubmit((values) => persist(values, { draft: true }))();
  const handleSaveAndNew = () => handleSubmit((values) => persist(values, { stay: true }))();
  const handleCancel = () => setConfirmCancelOpen(true);
  const confirmCancel = () => { clearDraft(); navigate('/purchase/logistics/inventory'); };
  const handleReset = () => setConfirmResetOpen(true);
  const confirmReset = () => { reset(buildFormValues()); clearDraft(); setConfirmResetOpen(false); toast.info('Form reset'); };

  const hasItem = Boolean((watchedValues?.sku || watchedValues?.product || '').trim());

  return (
    <PurchasePageLayout className="purchase-page--form inventory-form-page">
    <form onSubmit={handleSubmit(onSubmitSave)}>
      <div className="pr-form-layout">
        <div className="pr-form-main">
          {/* ============ STOCK MOVEMENT DETAILS ============ */}
          <Accordion
            title="Stock Movement"
            subtitle="Item, warehouse, type and quantity for this movement"
            icon={Boxes}
          >
            <div className={GRID}>
              <FormField label="SKU" error={errors.sku?.message} hint="Either SKU or product name is required">
                <TextInput
                  registration={skuRegistration}
                  placeholder="e.g. RM-STL-01"
                  ariaLabel="SKU"
                  list="inv-item-list"
                  onChange={handleSkuSelect}
                />
                <datalist id="inv-item-list">
                  {inventoryItems.map((i) => <option key={i.itemCode} value={i.itemCode}>{i.product}</option>)}
                </datalist>
              </FormField>
              <FormField label="Product" error={errors.product?.message}>
                <TextInput registration={register('product')} placeholder="Product name" ariaLabel="Product" />
              </FormField>
              <FormField label={watchedValues?.type === INVENTORY_TYPE.TRANSFER ? 'From Warehouse' : 'Warehouse'} error={errors.warehouse?.message}>
                <TextInput registration={register('warehouse')} placeholder="e.g. Plant A Store" ariaLabel="Warehouse" />
              </FormField>
              {watchedValues?.type === INVENTORY_TYPE.TRANSFER && (
                <>
                  <FormField label="To Warehouse" error={errors.toWarehouse?.message}>
                    <TextInput registration={register('toWarehouse')} placeholder="e.g. Plant B Store" ariaLabel="To Warehouse" />
                  </FormField>
                  <FormField label="From Location (optional)">
                    <TextInput registration={register('fromLocation')} placeholder="e.g. Bay A1" ariaLabel="From Location" />
                  </FormField>
                  <FormField label="To Location (optional)">
                    <TextInput registration={register('toLocation')} placeholder="e.g. Bay B2" ariaLabel="To Location" />
                  </FormField>
                </>
              )}
              <FormField label="Movement Type">
                <Controller control={control} name="type" render={({ field }) => (
                  <SelectInput value={field.value || 'Adjustment'} onChange={(e) => field.onChange(e.target.value)} ariaLabel="Movement Type">
                    {Object.values(INVENTORY_TYPE).map((t) => <option key={t} value={t}>{t}</option>)}
                  </SelectInput>
                )} />
              </FormField>
              <FormField
                label="Quantity"
                error={errors.quantity?.message}
                hint={MOVEMENT_QUANTITY_HINT[watchedValues?.type] || MOVEMENT_QUANTITY_HINT[INVENTORY_TYPE.ADJUSTMENT]}
              >
                <TextInput
                  type="number"
                  step="any"
                  registration={register('quantity')}
                  placeholder={watchedValues?.type === INVENTORY_TYPE.ADJUSTMENT ? 'e.g. -5 or +5' : 'e.g. 40'}
                  ariaLabel="Quantity"
                />
              </FormField>
              <FormField label="Reference">
                <TextInput registration={register('reference')} placeholder="e.g. Cycle count / GRN-2026-041" ariaLabel="Reference" />
              </FormField>
              <FormField label="Updated By">
                <TextInput registration={register('updatedBy')} placeholder="e.g. Stores Team" ariaLabel="Updated By" />
              </FormField>
              <FormField label="Movement Date" hint="Leave blank to use today">
                <TextInput type="date" registration={register('date')} ariaLabel="Movement Date" />
              </FormField>
            </div>

            {/* Live stock preview — same math the ledger persists */}
            {watchedValues?.type === INVENTORY_TYPE.TRANSFER ? (
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{(watchedValues?.warehouse || 'From')} — After</div>
                  <div className={`text-sm font-bold tabular-nums mt-0.5 ${transferView.from.after < 0 ? 'text-rose-600' : 'text-slate-800'}`}>{transferView.from.after}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">On hand {transferView.from.onHand}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{(watchedValues?.toWarehouse || 'To')} — After</div>
                  <div className="text-sm font-bold text-[#0B4A3D] tabular-nums mt-0.5">+{transferView.to.delta} → {transferView.to.after}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">On hand {transferView.to.onHand}</div>
                </div>
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">On Hand</div>
                  <div className="text-sm font-bold text-slate-800 tabular-nums mt-0.5">
                    {stock ? stock.onHand : hasItem && (watchedValues?.warehouse || '').trim() ? '…' : 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Delta</div>
                  <div className={`text-sm font-bold tabular-nums mt-0.5 ${preview.delta > 0 ? 'text-emerald-700' : preview.delta < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                    {preview.delta > 0 ? `+${preview.delta}` : preview.delta}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stock After</div>
                  <div className="text-sm font-bold text-[#0B4A3D] tabular-nums mt-0.5">{preview.after}</div>
                </div>
              </div>
            )}
          </Accordion>

          {/* ============ NOTES ============ */}
          <Accordion
            title="Notes"
            subtitle="Additional notes for this stock movement"
            icon={StickyNote}
          >
            <div className="space-y-4">
              <FormField label="Notes" hint={`${(watchedValues?.notes || '').length} / 500`}>
                <TextArea
                  registration={register('notes')}
                  rows={4}
                  maxLength={500}
                  placeholder="Reason for adjustment, cycle count notes..."
                />
              </FormField>
            </div>
          </Accordion>
        </div>

        <aside className="pr-form-side">
          <LogisticsFormSummary
            title="Movement Summary"
            icon={Boxes}
            docNo="New Movement"
            status="Posted"
            sourceDoc={watchedValues?.reference}
            sourceLabel="Reference"
            warehouse={watchedValues?.warehouse}
            createdBy={watchedValues?.updatedBy || 'Stores Team'}
            extraRows={isTransfer
              ? [
                  { label: 'Type', value: 'Transfer' },
                  { label: 'From Warehouse', value: watchedValues?.warehouse || '—' },
                  { label: 'To Warehouse', value: watchedValues?.toWarehouse || '—' },
                  { label: 'From After', value: transferView.from.after },
                  { label: 'To After', value: `+${transferView.to.delta} → ${transferView.to.after}` },
                ]
              : [
                  { label: 'Type', value: watchedValues?.type || 'Adjustment' },
                  { label: 'On Hand', value: stock ? stock.onHand : '—' },
                  { label: 'Delta', value: `${preview.delta > 0 ? '+' : ''}${preview.delta}` },
                  { label: 'After Qty', value: preview.after },
                ]}
          />
        </aside>
      </div>

      <FormActions
        submitting={submitting}
        draftSaving={draftSaving}
        submitLabel="Save Movement"
        submitVariant="primary"
        showDraft
        onDraft={saveDraft}
        onCancel={handleCancel}
        onReset={handleReset}
        showSaveNew
        onSaveNew={handleSaveAndNew}
      />
    </form>

    <ConfirmDialog
      open={confirmResetOpen}
      title="Reset form?"
      message="This will clear all fields. Data already saved is not affected."
      confirmLabel="Reset"
      variant="warning"
      icon={RotateCcw}
      onConfirm={confirmReset}
      onCancel={() => setConfirmResetOpen(false)}
    />
    <ConfirmDialog
      open={confirmCancelOpen}
      title="Discard unsaved changes?"
      message="Leaving now will discard unsaved changes."
      confirmLabel="Leave Page"
      variant="default"
      icon={X}
      onConfirm={confirmCancel}
      onCancel={() => setConfirmCancelOpen(false)}
    />
    </PurchasePageLayout>
  );
}
