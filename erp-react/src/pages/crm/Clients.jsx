import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Star, UserCheck, FileText, ClipboardList, Clock, IndianRupee,
  Eye, Pencil, PhoneCall, CalendarClock, PlusCircle, List, FilePlus2, FileSignature,
  FileClock, ClipboardSignature, Truck, Receipt, Banknote, IdCard, FolderOpen,
  BookOpen, Activity, CheckCircle2, PauseCircle, Archive, RotateCcw, Trash2, ExternalLink
} from 'lucide-react';
import CrmErpList from '../../components/CRM/CrmErpList';
import { ClientViewModal } from '../../components/ClientDetail';
import leadService from '../../services/leadService';
import quotationService from '../../services/quotationService';
import invoiceService from '../../services/invoiceService';
import paymentReceiptService from '../../services/paymentReceiptService';
import cprService from '../../services/cprService';
import { formatINR, formatDate, latestFollowUpDate, nextFollowUpDate } from '../../utils/leadHelpers';

function extractList(res) {
  if (Array.isArray(res)) return { rows: res, total: res.length };
  if (res?.content) return { rows: res.content, total: res.totalElements ?? res.content.length };
  if (res?.data?.content) return { rows: res.data.content, total: res.data.totalElements ?? res.data.content.length };
  if (res?.data?.rows) return { rows: res.data.rows, total: res.data.total ?? res.data.rows.length };
  if (Array.isArray(res?.data)) return { rows: res.data, total: res.total ?? res.totalCount ?? res.data.length };
  return { rows: [], total: 0 };
}

// ERP clients.html table columns (Client Code → Actions)
const CLIENT_COLUMNS = [
  { key: 'clientCode', label: 'Client Code', sortable: true, sortField: 'id' },
  { key: 'businessName', label: 'Business Name', sortable: true, sortField: 'businessName' },
  { key: 'contactPerson', label: 'Contact Person', sortable: true, sortField: 'name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'industry', label: 'Industry', sortable: true, sortField: 'industry' },
  { key: 'lastFollowup', label: 'Last Follow-up' },
  { key: 'nextFollowup', label: 'Next Follow-up' },
  { key: 'status', label: 'Status', sortable: true, sortField: 'status' },
  { key: 'actions', label: 'Actions' }
];

const STATUS_BADGE = {
  Active: 'crm-erp-status crm-erp-status-active',
  Inactive: 'crm-erp-status crm-erp-status-inactive',
  Archived: 'crm-erp-status crm-erp-status-archived'
};

export default function Clients({ embedded = false }) {
  const navigate = useNavigate();
  const [kpiExtra, setKpiExtra] = useState(null);
  // Client record view (Details / Timeline / Documents / Statement / Activities)
  const [viewClient, setViewClient] = useState(null);
  const [followups, setFollowups] = useState([]);

  // Real follow-up data for the "Last / Next Follow-up" columns — the client's
  // own follow-ups, the same source the Leads list uses (grouped by clientId
  // instead of leadId). Best-effort: the columns fall back to '—' on failure.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await leadService.listCrm('followups', { page: 0, size: 500 });
        const rows = Array.isArray(res)
          ? res
          : res?.content || res?.data?.content || res?.data?.rows || [];
        if (!cancelled) setFollowups(rows);
      } catch { /* follow-up columns are best-effort */ }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const followupsByClient = useMemo(() => {
    const map = new Map();
    (Array.isArray(followups) ? followups : []).forEach((fu) => {
      const clientId = Number(fu.clientId);
      if (!clientId) return;
      if (!map.has(clientId)) map.set(clientId, []);
      map.get(clientId).push(fu);
    });
    return map;
  }, [followups]);

  // Real cross-module data for the ERP client KPIs (all from live APIs).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [leadsRes, qtnRes, invRes, payRes, cprRes] = await Promise.allSettled([
        leadService.listLeads({ page: 0, size: 1 }),
        quotationService.list({ page: 0, size: 200 }),
        invoiceService.list({ page: 0, size: 200 }),
        paymentReceiptService.list({ page: 0, size: 200 }),
        cprService.listAllCprs()
      ]);
      if (cancelled) return;
      setKpiExtra({
        prospects: leadsRes.status === 'fulfilled' ? extractList(leadsRes.value).total : 0,
        qtns: qtnRes.status === 'fulfilled' ? extractList(qtnRes.value).rows : [],
        invs: invRes.status === 'fulfilled' ? extractList(invRes.value).rows : [],
        pays: payRes.status === 'fulfilled' ? extractList(payRes.value).rows : [],
        cprs:
          cprRes.status === 'fulfilled'
            ? Array.isArray(cprRes.value)
              ? cprRes.value
              : extractList(cprRes.value).rows
            : []
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const renderers = useMemo(
    () => ({
      businessName: (row) => (
        <span className="crm-erp-cell-main">{row.businessName || row.company || row.name || '—'}</span>
      ),
      contactPerson: (row) => <span>{row.contactPerson || row.name || '—'}</span>,
      phone: (row) => <span>{row.phone || '—'}</span>,
      email: (row) => <span className="crm-erp-cell-muted">{row.email || '—'}</span>,
      industry: (row) => <span>{row.industry || '—'}</span>,
      // Real follow-up data for this client (grouped by clientId below). This
      // column used to print the record's own updatedAt under a "Last Follow-up"
      // header, which is not a follow-up date at all.
      lastFollowup: (row) => {
        const latest = latestFollowUpDate(followupsByClient.get(Number(row.id)));
        return <span className="crm-erp-cell-muted">{latest ? formatDate(latest) : '—'}</span>;
      },
      nextFollowup: (row) => {
        const next = nextFollowUpDate(followupsByClient.get(Number(row.id)));
        return <span className="crm-erp-cell-muted">{next ? formatDate(next) : '—'}</span>;
      },
      status: (row) => (
        <span className={STATUS_BADGE[row.status] || 'crm-erp-status'}>{row.status || 'Active'}</span>
      )
    }),
    [followupsByClient]
  );

  // ---- ERP Actions menu — exact sections, wording and order ----
  const getRowActions = (row) => {
    if (row.status === 'Archived') {
      return [
        { section: 'CLIENT' },
        { key: 'viewClient', label: 'View Client', icon: Eye },
        { key: 'openInNewTab', label: 'Open in New Tab', icon: ExternalLink },
        { key: 'edit', label: 'Edit Client', icon: Pencil },
        { section: 'OTHER' },
        { key: 'restore', label: 'Restore', icon: RotateCcw },
        { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
      ];
    }
    return [
      { section: 'CLIENT' },
      { key: 'viewClient', label: 'View Client', icon: Eye },
      { key: 'openInNewTab', label: 'Open in New Tab', icon: ExternalLink },
      { key: 'edit', label: 'Edit Client', icon: Pencil },
      { section: 'FOLLOW-UPS' },
      { key: 'createFollowup', label: 'Create Follow-up', icon: PhoneCall },
      { key: 'viewFollowups', label: 'View Follow-ups', icon: CalendarClock },
      { section: 'CUSTOMER PURCHASE REQUEST (CPR)' },
      { key: 'createCpr', label: 'Create CPR', icon: PlusCircle },
      { key: 'viewCprs', label: 'View CPR List', icon: List },
      { section: 'QUOTATIONS' },
      { key: 'createQuotation', label: 'Create Quotation', icon: FilePlus2 },
      { key: 'viewQuotations', label: 'View Quotations', icon: List },
      { section: 'SALES CONTRACTS' },
      { key: 'createSc', label: 'Create Sales Contract', icon: FileSignature },
      { key: 'viewSc', label: 'View Sales Contracts', icon: List },
      { section: 'PROFORMA INVOICES' },
      { key: 'createProforma', label: 'Create Proforma Invoice', icon: FileClock },
      { key: 'viewProforma', label: 'View Proforma Invoices', icon: List },
      { section: 'CUSTOMER PURCHASE ORDERS' },
      { key: 'createSo', label: 'Create Customer Purchase Order', icon: ClipboardSignature },
      { key: 'viewSo', label: 'View Customer Purchase Orders', icon: List },
      { section: 'DELIVERY CHALLANS' },
      { key: 'createDc', label: 'Create Delivery Challan', icon: Truck },
      { key: 'viewDc', label: 'View Delivery Challans', icon: List },
      { section: 'INVOICES' },
      { key: 'createInvoice', label: 'Create Invoice', icon: Receipt },
      { key: 'viewInvoices', label: 'View Invoices', icon: List },
      { section: 'PAYMENTS' },
      { key: 'createPayment', label: 'Create Payment Receipt', icon: Banknote },
      { key: 'viewPayments', label: 'View Payment Receipts', icon: List },
      { section: 'CLIENT RECORDS' },
      { key: 'viewDetails', label: 'Client Details', icon: IdCard },
      { key: 'timeline', label: 'Client Timeline', icon: Clock },
      { key: 'documents', label: 'Client Documents', icon: FolderOpen },
      { key: 'statement', label: 'Statement', icon: BookOpen },
      { key: 'activities', label: 'Activities', icon: Activity },
      { section: 'STATUS' },
      {
        key: 'toggleStatus',
        label: row.status === 'Inactive' ? 'Mark as Active' : 'Mark as Inactive',
        icon: row.status === 'Inactive' ? CheckCircle2 : PauseCircle
      },
      { section: 'OTHER' },
      { key: 'archive', label: 'Archive', icon: Archive },
      { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
    ];
  };

  // Navigation for the menu actions not handled inside CrmErpList
  // (view/edit/restore/archive/delete/toggleStatus are handled there).
  const onRowAction = (actionKey, row) => {
    const customer = encodeURIComponent(row.businessName || row.company || row.name || '');
    switch (actionKey) {
      case 'viewClient':
      case 'viewDetails':
        // Navigate to the full Client View page instead of opening the modal.
        navigate(`/clients/${row.id}`);
        break;
      case 'timeline':
        setViewClient({ id: row.id, tab: 'timeline' });
        break;
      case 'documents':
        setViewClient({ id: row.id, tab: 'documents' });
        break;
      case 'statement':
        setViewClient({ id: row.id, tab: 'statement' });
        break;
      case 'activities':
        setViewClient({ id: row.id, tab: 'activities' });
        break;
      case 'createFollowup':
        navigate(`/followups/new?clientId=${row.id}&customer=${customer}`);
        break;
      case 'viewFollowups':
        navigate('/followups');
        break;
      case 'createCpr':
        navigate(`/cprs/new?clientId=${row.id}`);
        break;
      case 'viewCprs':
        navigate('/cprs');
        break;
      case 'createQuotation':
        navigate(`/quotations/new?clientId=${row.id}&customer=${customer}`);
        break;
      case 'viewQuotations':
        navigate('/quotations');
        break;
      case 'createSc':
        navigate(`/sales-contracts/new?clientId=${row.id}`);
        break;
      case 'viewSc':
        navigate('/sales-contracts');
        break;
      case 'createProforma':
        navigate(`/proforma-invoices/new?clientId=${row.id}`);
        break;
      case 'viewProforma':
        navigate('/proforma-invoices');
        break;
      case 'createSo':
        navigate(`/sales-orders/new?clientId=${row.id}&customer=${customer}`);
        break;
      case 'viewSo':
        navigate('/sales-orders');
        break;
      case 'createDc':
        navigate(`/delivery-challans/new?clientId=${row.id}`);
        break;
      case 'viewDc':
        navigate('/delivery-challans');
        break;
      case 'createInvoice':
        navigate(`/invoices/new?clientId=${row.id}`);
        break;
      case 'viewInvoices':
        navigate('/invoices');
        break;
      case 'createPayment':
        navigate(`/payment-receipts/new?clientId=${row.id}`);
        break;
      case 'viewPayments':
        navigate('/payment-receipts');
        break;
      default:
        break;
    }
  };

  // ERP client KPI cards — every value comes from a live API response.
  const getKpis = ({ rows, totalCount, statusCounts = {}, setClientFilter }) => {
    const extra = kpiExtra || {};
    const openQtns = (extra.qtns || []).filter((q) =>
      ['draft', 'sent', 'pending'].includes(String(q.status || '').toLowerCase())
    ).length;
    const cprCount = (extra.cprs || []).filter((c) =>
      ['draft', 'pending', 'pending review', 'approved'].includes(String(c.status || '').toLowerCase())
    ).length;
    const pendingPayments = (extra.invs || [])
      .filter((i) => ['pending', 'overdue', 'partial'].includes(String(i.status || '').toLowerCase()))
      .reduce((sum, i) => sum + (Number(i.grandTotal ?? i.total ?? 0) || 0), 0);
    const revenue =
      (extra.invs || [])
        .filter((i) => ['paid', 'completed', 'received'].includes(String(i.status || '').toLowerCase()))
        .reduce((sum, i) => sum + (Number(i.grandTotal ?? i.total ?? 0) || 0), 0) +
      (extra.pays || []).reduce((sum, p) => sum + (Number(p.amount ?? p.grandTotal ?? 0) || 0), 0);
    const activeClients = statusCounts['Active'] ?? rows.filter((r) => r.status === 'Active').length;

    return [
      { key: 'totalclients', label: 'Total Clients', value: totalCount, icon: Users, color: '#0B4A3D', onClick: () => setClientFilter('status', ''), newTabUrl: '/clients' },
      { key: 'prospects', label: 'Prospects', value: extra.prospects ?? 0, icon: Star, color: '#f59e0b', onClick: () => setClientFilter('status', ''), newTabUrl: '/clients?status=Prospect' },
      { key: 'activeclients', label: 'Active Clients', value: activeClients, icon: UserCheck, color: '#10b981', onClick: () => setClientFilter('status', 'Active'), newTabUrl: '/clients?status=Active' },
      { key: 'openquotations', label: 'Open Quotations', value: openQtns, icon: FileText, color: '#083D34', onClick: () => setClientFilter('status', ''), newTabUrl: '/quotations' },
      { key: 'purchaserequests', label: 'Purchase Requests', value: cprCount, icon: ClipboardList, color: '#06b6d4', onClick: () => setClientFilter('status', ''), newTabUrl: '/cprs' },
      { key: 'pendingpayments', label: 'Pending Payments', value: formatINR(pendingPayments), icon: Clock, color: '#ef4444', onClick: () => setClientFilter('status', ''), newTabUrl: '/invoices?status=Pending' },
      { key: 'revenue', label: 'Revenue', value: formatINR(revenue), icon: IndianRupee, color: '#059669', onClick: () => setClientFilter('status', ''), newTabUrl: '/invoices' }
    ];
  };

  const CLIENT_FILTERS = useMemo(
    () => [
      {
        key: 'status', label: 'Status', type: 'select', mode: 'client',
        options: [
          { value: '', label: 'All Statuses' },
          { value: 'Active', label: 'Active' },
          { value: 'Inactive', label: 'Inactive' },
          { value: 'Lead', label: 'Lead' },
          { value: 'Prospect', label: 'Prospect' },
          { value: 'Blocked', label: 'Blocked' },
          { value: 'Archived', label: 'Archived' }
        ]
      },
      {
        key: 'industry', label: 'Industry', type: 'select', mode: 'client',
        options: (rows) => [
          { value: '', label: 'All Industries' },
          ...Array.from(new Set(rows.map((r) => r.industry).filter(Boolean))).map((v) => ({ value: v, label: v }))
        ]
      },
      {
        key: 'owner', label: 'Sales Person', type: 'select', mode: 'client',
        options: (rows) => [
          { value: '', label: 'All Sales Persons' },
          ...Array.from(new Set(rows.map((r) => r.owner).filter(Boolean))).map((v) => ({ value: v, label: v }))
        ]
      }
    ],
    []
  );

  return (
    <>
      <CrmErpList
        title="Your Clients"
        titleIcon={Users}
        breadcrumb={['Dashboard', 'Sales', 'Clients']}
        endpoint="customers"
        noun="client"
        filename="clients"
        columns={CLIENT_COLUMNS}
        renderers={renderers}
        filters={CLIENT_FILTERS}
        kpis={getKpis}
        searchPlaceholder="Search by Client Code, Business Name, Phone, Email..."
        addButton={{ label: 'Add Client', to: '/clients/new' }}
        emptyMessage="No clients found matching your criteria."
        errorMessage="Failed to load clients. Please try again."
        viewRoute={(row) => `/clients/${row.id}`}
        rowActions={getRowActions}
        onRowAction={onRowAction}
        embedded={embedded}
      />

      <ClientViewModal
        key={viewClient ? `${viewClient.id}-${viewClient.tab}` : 'client-view-closed'}
        open={viewClient !== null}
        clientId={viewClient?.id}
        initialTab={viewClient?.tab || 'details'}
        onClose={() => setViewClient(null)}
      />
    </>
  );
}
