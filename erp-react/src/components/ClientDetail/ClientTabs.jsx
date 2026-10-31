/**
 * ClientTabs — the Client detail tab bodies, extracted so the quick-view modal
 * (Clients list) and the full-page Client view (/clients/:id) render the SAME
 * sections from the SAME real backend data.
 *
 * Every value comes from GET /customers/{id} and its sub-resources; nothing is
 * cached client-side and no placeholder values are substituted.
 */
import { useRef, useState } from 'react';
import {
  BookOpen,
  Building2,
  Clock,
  Download,
  FileText,
  FolderOpen,
  Landmark,
  Loader2,
  MapPin,
  Phone,
  Upload,
  Users
} from 'lucide-react';
import RecordVersionHistory from '../EditHistory/RecordVersionHistory';
import { useToast } from '../Common';
import {
  DetailCard,
  DetailField,
  DetailFieldGrid,
  DetailEmpty,
  DetailLoading
} from '../DetailPage';
import customerService from '../../services/customerService';
import useAsyncData from '../../hooks/useAsyncData';
import { formatINR, formatDateTime, formatDate } from '../../utils/leadHelpers';
import { getAttachmentSelectionError } from '../../utils/attachmentStorage';
import { downloadFile } from '../../utils/fileAccess';

// eslint-disable-next-line react-refresh/only-export-components
export function toList(response) {
  return Array.isArray(response)
    ? response
    : response?.data ?? response?.timeline ?? response?.activities ?? response?.content ?? [];
}

// eslint-disable-next-line react-refresh/only-export-components
export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function EventList({ items, emptyMessage, loading, dotClass }) {
  if (loading) return <DetailLoading />;
  if (!items || items.length === 0) {
    return <DetailEmpty icon={Clock} title="Nothing here yet" subtitle={emptyMessage} />;
  }
  return (
    <ol className="relative border-l-2 border-slate-100 ml-1.5 space-y-4">
      {items.map((item, index) => (
        <li key={`${item.type}-${index}`} className="pl-5 relative">
          <span className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-white ${dotClass}`} />
          <div className="flex flex-wrap items-center justify-between gap-1">
            <p className="text-xs font-bold text-slate-800">{item.title}</p>
            {item.createdAt && (
              <time className="text-[10px] text-slate-400 font-medium">{formatDateTime(item.createdAt)}</time>
            )}
          </div>
          {item.detail && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.detail}</p>}
        </li>
      ))}
    </ol>
  );
}

/** Business / Contact / Tax / Address / Account / Notes / Record info cards. */
export function ClientDetailsTab({ customer }) {
  if (!customer) return null;
  const billing = [customer.billingAddress, customer.billingCity, customer.billingState, customer.billingPin]
    .filter(Boolean)
    .join(', ');
  const shipping = [customer.shippingAddress, customer.shippingCity, customer.shippingState, customer.shippingPin]
    .filter(Boolean)
    .join(', ');
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <DetailCard icon={Building2} title="Client Information">
        <DetailFieldGrid
          fields={[
            ['Business Name', customer.businessName],
            ['Client Code', customer.clientCode],
            ['Alias', customer.alias],
            ['Client Type', customer.clientType],
            ['Industry', customer.industry],
            ['Website', customer.website],
            ['Map No', customer.mapNo],
            ['Category', customer.category],
            ['Status', customer.status],
            ['Sales Person', customer.salesPerson]
          ]}
        />
      </DetailCard>

      <DetailCard icon={Phone} title="Contact Information">
        <DetailFieldGrid
          fields={[
            ['Contact Person', customer.contactPerson],
            ['Phone', customer.phone],
            ['Email', customer.email],
            ['Payment Terms', customer.paymentTerms],
            ['Currency', customer.currency]
          ]}
        />
      </DetailCard>

      <DetailCard icon={FileText} title="Tax Information">
        <DetailFieldGrid
          fields={[
            ['GSTIN', customer.gstin],
            ['PAN', customer.pan],
            ['Tax Treatment', customer.taxTreatment]
          ]}
        />
      </DetailCard>

      <DetailCard icon={Landmark} title="Account Information">
        <DetailFieldGrid
          fields={[
            ['Bank Name', customer.bankName],
            ['Account Holder', customer.accountHolderName],
            ['Account Number', customer.accountNumber],
            ['IFSC', customer.ifsc],
            ['Branch', customer.branch],
            ['UPI ID', customer.upiId],
            ['Credit Limit', customer.creditLimit != null ? formatINR(customer.creditLimit, customer.currency) : ''],
            ['Opening Balance', customer.openingBalance != null ? formatINR(customer.openingBalance, customer.currency) : '']
          ]}
        />
      </DetailCard>

      <DetailCard icon={MapPin} title="Billing Address">
        <div className="space-y-3">
          <DetailField label="Address" value={customer.billingAddress} />
          <DetailFieldGrid
            fields={[
              ['City', customer.billingCity],
              ['State', customer.billingState],
              ['PIN Code', customer.billingPin],
              ['Country', customer.country]
            ]}
          />
        </div>
      </DetailCard>

      <DetailCard icon={MapPin} title="Shipping Address">
        <div className="space-y-3">
          <DetailField label="Address" value={customer.shippingAddress || customer.billingAddress} />
          <DetailFieldGrid
            fields={[
              ['City', customer.shippingCity || customer.billingCity],
              ['State', customer.shippingState || customer.billingState],
              ['PIN Code', customer.shippingPin || customer.billingPin],
              ['Country', customer.country]
            ]}
          />
        </div>
        {billing || shipping ? (
          <p className="text-[10px] text-slate-400 font-medium mt-3">
            {billing && shipping && billing !== shipping
              ? 'Shipping address differs from billing.'
              : 'Shipping address is the same as billing.'}
          </p>
        ) : null}
      </DetailCard>

      {(customer.shippingAddresses || []).length > 0 && (
        <DetailCard icon={MapPin} title="Other Shipping Addresses" count={customer.shippingAddresses.length}>
          <ul className="space-y-2">
            {customer.shippingAddresses.map((address, index) => (
              <li key={address.id ?? index} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                <p className="text-xs font-semibold text-slate-700">
                  {[address.street, address.city, address.state, address.postal].filter(Boolean).join(', ') || '—'}
                </p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{address.country || '—'}</p>
              </li>
            ))}
          </ul>
        </DetailCard>
      )}

      {(customer.contacts || []).length > 0 && (
        <DetailCard icon={Users} title="Linked Contacts" count={customer.contacts.length}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-2 py-1.5 font-bold">Name</th>
                  <th className="px-2 py-1.5 font-bold">Email</th>
                  <th className="px-2 py-1.5 font-bold">Phone</th>
                  <th className="px-2 py-1.5 font-bold">Designation</th>
                </tr>
              </thead>
              <tbody>
                {customer.contacts.map((c, i) => (
                  <tr key={c.id ?? i} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 font-semibold text-slate-700">{c.name}</td>
                    <td className="px-2 py-1.5 text-slate-500">{c.email || '—'}</td>
                    <td className="px-2 py-1.5 text-slate-500">{c.phone || '—'}</td>
                    <td className="px-2 py-1.5 text-slate-500">{c.designation || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DetailCard>
      )}

      {customer.notes && (
        <DetailCard icon={FileText} title="Notes">
          <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{customer.notes}</p>
        </DetailCard>
      )}

      <DetailCard icon={Clock} title="Record Information">
        <DetailFieldGrid
          fields={[
            ['Created', customer.createdAt ? formatDateTime(customer.createdAt) : ''],
            ['Last Updated', customer.updatedAt ? formatDateTime(customer.updatedAt) : '']
          ]}
        />
      </DetailCard>
    </div>
  );
}

export function ClientTimelineTab({ clientId }) {
  const { data, loading } = useAsyncData(() => customerService.getTimeline(clientId), { deps: [clientId] });
  return (
    <EventList
      loading={loading}
      items={toList(data)}
      emptyMessage="No timeline events recorded for this client."
      dotClass="bg-emerald-500"
    />
  );
}

export function ClientActivitiesTab({ clientId }) {
  const { data, loading } = useAsyncData(() => customerService.getActivities(clientId), { deps: [clientId] });
  return (
    <EventList
      loading={loading}
      items={toList(data)}
      emptyMessage="No activities recorded for this client yet."
      dotClass="bg-sky-500"
    />
  );
}

export function ClientDocumentsTab({ clientId }) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const { data, loading, refresh } = useAsyncData(() => customerService.getAttachments(clientId), { deps: [clientId] });
  const [uploading, setUploading] = useState(false);
  const items = toList(data);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || uploading) return;
    const err = getAttachmentSelectionError(file);
    if (err) {
      toast.error(err.message);
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await customerService.addAttachment(clientId, formData);
      toast.success('Document uploaded');
      refresh();
    } catch (err2) {
      toast.error(err2?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <DetailLoading />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors cursor-pointer"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Upload File
        </button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
      </div>
      {items.length === 0 ? (
        <DetailEmpty
          icon={FolderOpen}
          title="No documents"
          subtitle="No documents uploaded for this client yet."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((file) => (
            <li key={file.id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5">
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600 shrink-0">
                <FolderOpen className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">{file.name}</p>
                <p className="text-[10px] text-slate-400 font-medium">
                  {file.size ? formatBytes(file.size) : ''}
                  {file.size && file.uploadedAt ? ' · ' : ''}
                  {file.uploadedAt ? formatDate(file.uploadedAt) : ''}
                </p>
              </div>
              {file.url && (
                <button
                  type="button"
                  onClick={() =>
                    downloadFile(file.url, file.name).catch((err) => toast.error(err?.message || 'Failed to download file'))
                  }
                  className="p-2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ClientStatementTab({ clientId, currency }) {
  const { data, loading } = useAsyncData(() => customerService.getStatement(clientId), { deps: [clientId] });
  // GET /customers/{id}/statement answers inside the ApiResponse envelope
  // ({success, message, data}) — unwrap it before reading the fields.
  const statement =
    data && typeof data === 'object' && !Array.isArray(data) ? data.data ?? data : null;

  if (loading) return <DetailLoading />;

  const entries = statement?.entries || [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Opening Balance</div>
          <div className="text-sm font-bold text-slate-800">{formatINR(statement?.openingBalance, currency)}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Closing Balance</div>
          <div className="text-sm font-bold text-emerald-700">{formatINR(statement?.closingBalance, currency)}</div>
        </div>
      </div>
      {entries.length === 0 ? (
        <DetailEmpty icon={BookOpen} title="No statement entries" subtitle="No statement entries for this client yet." />
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 font-bold">Date</th>
                <th className="px-3 py-2 font-bold">Type</th>
                <th className="px-3 py-2 font-bold">Reference</th>
                <th className="px-3 py-2 font-bold">Description</th>
                <th className="px-3 py-2 font-bold text-right">Debit</th>
                <th className="px-3 py-2 font-bold text-right">Credit</th>
                <th className="px-3 py-2 font-bold text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={`${entry.refNo}-${index}`} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-500">{entry.date ? formatDate(entry.date) : '—'}</td>
                  <td className="px-3 py-2 font-semibold text-slate-700">{entry.type}</td>
                  <td className="px-3 py-2 text-slate-600">{entry.refNo || '—'}</td>
                  <td className="px-3 py-2 text-slate-500 capitalize">{entry.description || '—'}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{entry.debit ? formatINR(entry.debit, currency) : ''}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{entry.credit ? formatINR(entry.credit, currency) : ''}</td>
                  <td className="px-3 py-2 text-right font-bold text-slate-800">{formatINR(entry.balance, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ClientVersionHistoryTab({ clientId, client = null }) {
  return (
    <RecordVersionHistory
      module="customer"
      recordId={clientId}
      record={client}
      docNumber={client?.clientCode || ''}
      status={client?.status}
    />
  );
}
