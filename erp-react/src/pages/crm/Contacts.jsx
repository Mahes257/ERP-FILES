import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Contact2, Users, UserCheck, PauseCircle, Star, Layers, Link2, Building2,
  Eye, Pencil, ExternalLink, Archive, RotateCcw, Trash2, CheckCircle2
} from 'lucide-react';
import CrmErpList from '../../components/CRM/CrmErpList';
import contactService from '../../services/contactService';
import { formatLeadNo, getInitials, avatarColor } from '../../utils/leadHelpers';
import { CONTACT_COLUMNS, CONTACT_FILTERS, contactRowActions, contactStatusFor } from '../../utils/contactHelpers';

/**
 * CRM → Contacts.
 *
 * The list shows REAL contact rows from the contacts table (the people captured
 * by the Lead form and the contacts linked to clients) — never leads standing in
 * for contacts. Search, filters, sorting and pagination are all executed by the
 * backend through /contacts, so what is displayed is what MySQL holds.
 *
 * Columns: Contact Name · Business Name · Contact Type · Designation · Phone ·
 * Email · Associated Lead · Associated Client · Status · Actions.
 */
const STATUS_BADGE = {
  Active: 'crm-erp-status crm-erp-status-active',
  Inactive: 'crm-erp-status crm-erp-status-inactive',
  Archived: 'crm-erp-status crm-erp-status-archived'
};

const TYPE_BADGE = {
  Primary: 'crm-erp-status crm-erp-status-active',
  Secondary: 'crm-erp-status crm-erp-status-inactive'
};

export default function Contacts({ embedded = false }) {
  const navigate = useNavigate();
  // Real KPI counts from /contacts/stats (no fabricated or hardcoded numbers).
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    contactService
      .stats()
      .then((res) => {
        if (cancelled) return;
        setStats(res?.data ?? res ?? null);
      })
      .catch(() => {
        // Counts are an enhancement: the list itself stays fully usable.
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const renderers = useMemo(
    () => ({
      name: (row) => (
        <span className="flex items-center gap-2.5">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] ${avatarColor(row.name)} border border-black/5 shrink-0`}>
            {getInitials(row.name)}
          </span>
          <span className="flex flex-col min-w-0">
            <span className="crm-erp-cell-main truncate">{row.name || '—'}</span>
            <span className="text-[10px] text-slate-400 font-normal">ID: #{String(row.id).padStart(4, '0')}</span>
          </span>
        </span>
      ),
      businessName: (row) => <span>{row.businessName || '—'}</span>,
      contactType: (row) => (
        <span className={TYPE_BADGE[row.contactType] || 'crm-erp-status'}>{row.contactType || '—'}</span>
      ),
      designation: (row) => <span>{row.designation || '—'}</span>,
      phone: (row) => <span>{row.phone || '—'}</span>,
      email: (row) => <span className="crm-erp-cell-muted">{row.email || '—'}</span>,
      // The lead number is derived from the id everywhere in the CRM, so the
      // column shows the same "LEAD-000123" the Leads module shows, plus the
      // lead's business/contact name for recognition.
      leadId: (row) =>
        row.leadId ? (
          <button
            type="button"
            onClick={() => navigate(`/leads/${row.leadId}`)}
            className="text-left cursor-pointer hover:underline"
            title={`Open ${formatLeadNo(row.leadId)}`}
          >
            <span className="block font-semibold text-[#0B4A3D]">{formatLeadNo(row.leadId)}</span>
            <span className="block text-[10px] text-slate-400">{row.leadBusinessName || row.leadName || ''}</span>
          </button>
        ) : (
          <span className="text-slate-400">—</span>
        ),
      clientId: (row) =>
        row.clientId ? (
          <button
            type="button"
            onClick={() => navigate(`/clients/${row.clientId}`)}
            className="text-left cursor-pointer hover:underline"
            title={`Open ${row.clientCode || row.clientName || 'client'}`}
          >
            <span className="block font-semibold text-[#0B4A3D]">{row.clientCode || `Client #${row.clientId}`}</span>
            <span className="block text-[10px] text-slate-400">{row.clientName || ''}</span>
          </button>
        ) : (
          <span className="text-slate-400">—</span>
        ),
      status: (row) => (
        <span className={STATUS_BADGE[row.status] || 'crm-erp-status'}>{row.status || 'Active'}</span>
      )
    }),
    [navigate]
  );

  // ---- Actions: only destinations that really exist (see contactHelpers) ---
  const ACTION_ICONS = {
    viewContact: Eye,
    editContact: Pencil,
    openInNewTab: ExternalLink,
    openLead: Users,
    openClient: Building2,
    archive: Archive,
    restore: RotateCcw,
    markActive: CheckCircle2,
    markInactive: PauseCircle,
    delete: Trash2
  };
  const getRowActions = (row) =>
    contactRowActions(row).map((action) =>
      action.key ? { ...action, icon: ACTION_ICONS[action.key] } : action
    );

  const onRowAction = async (actionKey, row, refresh) => {
    switch (actionKey) {
      case 'viewContact':
        navigate(`/contacts/${row.id}`);
        break;
      case 'editContact':
        navigate(`/contacts/${row.id}/edit`);
        break;
      case 'openLead':
        if (row.leadId) navigate(`/leads/${row.leadId}`);
        break;
      case 'openClient':
        if (row.clientId) navigate(`/clients/${row.clientId}`);
        break;
      case 'markInactive':
      case 'markActive': {
        // Real status change through the API; the list reloads from the server.
        await contactService.setStatus(row.id, contactStatusFor(actionKey));
        refresh?.();
        break;
      }
      default:
        break;
    }
  };

  // Server-side filters come from contactHelpers: every value is sent to
  // /contacts as a query param and applied to the persisted rows by the backend.

  const getKpis = ({ setFilter }) => [
    { key: 'total', label: 'All Contacts', value: stats?.total ?? 0, icon: Contact2, color: '#0B4A3D' },
    { key: 'active', label: 'Active', value: stats?.active ?? 0, icon: UserCheck, color: '#10b981', onClick: () => setFilter('status', 'Active') },
    { key: 'inactive', label: 'Inactive', value: stats?.inactive ?? 0, icon: PauseCircle, color: '#f59e0b', onClick: () => setFilter('status', 'Inactive') },
    { key: 'primary', label: 'Primary Contacts', value: stats?.primary ?? 0, icon: Star, color: '#0d9488', onClick: () => setFilter('contactType', 'Primary') },
    { key: 'secondary', label: 'Secondary Contacts', value: stats?.secondary ?? 0, icon: Layers, color: '#6366f1', onClick: () => setFilter('contactType', 'Secondary') },
    { key: 'leadLinked', label: 'Linked to a Lead', value: stats?.leadLinked ?? 0, icon: Link2, color: '#06b6d4', onClick: () => setFilter('association', 'lead') },
    { key: 'clientLinked', label: 'Linked to a Client', value: stats?.clientLinked ?? 0, icon: Building2, color: '#059669', onClick: () => setFilter('association', 'client') }
  ];

  return (
    <CrmErpList
      title="Your Contacts"
      titleIcon={Contact2}
      breadcrumb={['Dashboard', 'Sales', 'Contacts']}
      endpoint="contacts"
      noun="contact"
      filename="contacts"
      columns={CONTACT_COLUMNS}
      renderers={renderers}
      filters={CONTACT_FILTERS}
      kpis={getKpis}
      searchPlaceholder="Search by Contact Name, Business Name, Phone, Email, Designation, Lead No or Client Code..."
      addButton={{ label: 'Contact', to: '/contacts/new' }}
      emptyMessage="No contacts found matching your criteria."
      errorMessage="Failed to load contacts. Please try again."
      viewRoute={(row) => `/contacts/${row.id}`}
      rowActions={getRowActions}
      onRowAction={onRowAction}
      embedded={embedded}
    />
  );
}
