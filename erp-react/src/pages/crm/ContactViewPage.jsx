import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Archive, Building2, Contact2, IdCard, Link2, Pencil, RotateCcw, RotateCw,
  Trash2, Users
} from 'lucide-react';
import { ConfirmDialog, useToast } from '../../components/Common';
import {
  DetailPage,
  DetailBreadcrumb,
  DetailHeader,
  DetailCard,
  DetailRow,
  DetailBadge,
  DetailLink
} from '../../components/DetailPage';
import contactService from '../../services/contactService';
import { formatLeadNo, formatDate } from '../../utils/leadHelpers';

const STATUS_TONE = {
  Active: 'green',
  Inactive: 'amber',
  Archived: 'neutral',
  Deleted: 'rose'
};

const TYPE_TONE = { Primary: 'green', Secondary: 'neutral' };

/**
 * CRM → Contact view.
 *
 * Everything on this page comes from GET /contacts/{id}: the person's captured
 * details and the REAL associations (the lead it came from and the client it
 * became linked to after conversion — both ids, never a name match).
 */
export default function ContactViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  // Bumping this key re-runs the fetch (after a mutation, or the Refresh
  // action) without calling setState directly in an effect body.
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    contactService
      .get(id)
      .then((res) => {
        if (cancelled) return;
        setContact(res?.data ?? res ?? null);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to load contact');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  const runAction = async (operation, message) => {
    setBusy(true);
    try {
      await operation();
      toast.success(message);
      load();
    } catch (err) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  if (loading && !contact) {
    return (
      <DetailPage className="erp-detail-scope">
        <DetailBreadcrumb items={[{ label: 'Contacts', to: '/contacts' }, { label: `Contact #${id}` }]} />
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-10 text-center text-xs font-semibold text-slate-400">
          Loading contact…
        </div>
      </DetailPage>
    );
  }

  if (error || !contact) {
    return (
      <DetailPage className="erp-detail-scope">
        <DetailBreadcrumb items={[{ label: 'Contacts', to: '/contacts' }, { label: `Contact #${id}` }]} />
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-10 text-center">
          <Contact2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-700 mb-1">Contact Not Found</h2>
          <p className="text-xs text-slate-400 mb-5">{error || 'The contact you are looking for does not exist.'}</p>
          <button type="button" onClick={() => navigate('/contacts')} className="erp-detail-action erp-detail-action--primary">
            Back to Contacts
          </button>
        </div>
      </DetailPage>
    );
  }

  const status = contact.status || 'Active';
  const isArchived = status === 'Archived';
  const displayName = contact.name || `Contact #${id}`;

  const headerActions = [
    { key: 'edit', label: 'Edit', icon: Pencil, style: 'secondary', action: () => navigate(`/contacts/${id}/edit`) },
    contact.leadId
      ? { key: 'lead', label: `Open Lead ${formatLeadNo(contact.leadId)}`, icon: Users, style: 'ghost', action: () => navigate(`/leads/${contact.leadId}`) }
      : null,
    contact.clientId
      ? { key: 'client', label: 'Open Client', icon: Building2, style: 'ghost', action: () => navigate(`/clients/${contact.clientId}`) }
      : null,
    isArchived
      ? { key: 'restore', label: 'Restore', icon: RotateCcw, style: 'ghost', action: () => runAction(() => contactService.restore(id), 'Contact restored') }
      : { key: 'archive', label: 'Archive', icon: Archive, style: 'ghost', action: () => runAction(() => contactService.archive(id), 'Contact archived') },
    {
      key: 'delete',
      label: 'Move to Trash',
      icon: Trash2,
      style: 'ghost',
      action: () => setConfirm('delete')
    },
    { key: 'refresh', label: 'Refresh', icon: RotateCw, style: 'ghost', action: load }
  ].filter(Boolean);

  return (
    <DetailPage className="erp-detail-scope">
      <DetailBreadcrumb
        items={[
          { label: 'CRM', to: '/crm' },
          { label: 'Contacts', to: '/contacts' },
          { label: displayName }
        ]}
      />

      <DetailHeader
        initial={displayName}
        title={displayName}
        onBack={() => navigate('/contacts')}
        backLabel="Back to Contacts"
        busy={busy}
        actions={headerActions}
        chips={[
          <DetailBadge key="type" tone={TYPE_TONE[contact.contactType] || 'neutral'}>
            {contact.contactType || 'Primary'} Contact
          </DetailBadge>,
          <DetailBadge key="status" tone={STATUS_TONE[status] || 'neutral'}>{status}</DetailBadge>
        ]}
        meta={[
          contact.designation ? <span key="des">{contact.designation}</span> : null,
          contact.phone ? <span key="ph">{contact.phone}</span> : null,
          contact.email ? <span key="em">{contact.email}</span> : null
        ].filter(Boolean)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <DetailCard icon={IdCard} title="Contact Information">
          <DetailRow label="Contact Name">{contact.name || '—'}</DetailRow>
          <DetailRow label="Contact Type">{contact.contactType || '—'}</DetailRow>
          <DetailRow label="Designation">{contact.designation || '—'}</DetailRow>
          <DetailRow label="Phone">{contact.phone || '—'}</DetailRow>
          <DetailRow label="Email">{contact.email || '—'}</DetailRow>
          <DetailRow label="Business Name">{contact.businessName || '—'}</DetailRow>
        </DetailCard>

        <div className="space-y-4">
          <DetailCard icon={Link2} title="Associations">
            <DetailRow label="Lead">
              {contact.leadId ? (
                <DetailLink onClick={() => navigate(`/leads/${contact.leadId}`)}>
                  {formatLeadNo(contact.leadId)}
                  {contact.leadName ? ` · ${contact.leadName}` : ''}
                </DetailLink>
              ) : (
                '—'
              )}
            </DetailRow>
            <DetailRow label="Lead Stage">{contact.leadStage || '—'}</DetailRow>
            <DetailRow label="Client">
              {contact.clientId ? (
                <DetailLink onClick={() => navigate(`/clients/${contact.clientId}`)}>
                  {[contact.clientCode, contact.clientName].filter(Boolean).join(' · ')}
                </DetailLink>
              ) : (
                '—'
              )}
            </DetailRow>
            <p className="text-[11px] text-slate-400 mt-2">
              A contact keeps its lead reference after the lead converts: the client link is added
              to the same record, so no duplicate contact is created.
            </p>
          </DetailCard>

          <DetailCard icon={Contact2} title="Record">
            <DetailRow label="Contact ID">{`#${String(contact.id).padStart(4, '0')}`}</DetailRow>
            <DetailRow label="Status">{status}</DetailRow>
            <DetailRow label="Created By">{contact.source === 'Lead' ? 'Lead form' : contact.source || '—'}</DetailRow>
            <DetailRow label="Created">{contact.createdAt ? formatDate(contact.createdAt) : '—'}</DetailRow>
            <DetailRow label="Updated">{contact.updatedAt ? formatDate(contact.updatedAt) : '—'}</DetailRow>
          </DetailCard>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'delete'}
        title="Move Contact to Trash"
        message={`Move "${displayName}" to trash? The contact can be restored from the Deleted tab. Its lead and client are not affected.`}
        confirmLabel="Move to Trash"
        onConfirm={() => runAction(() => contactService.remove(id), 'Contact moved to trash')}
        onCancel={() => setConfirm(null)}
      />
    </DetailPage>
  );
}
