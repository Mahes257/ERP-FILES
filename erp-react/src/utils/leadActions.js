import { Eye, Pencil, Copy, Share2, Mail, RotateCcw, Archive, Trash2 } from 'lucide-react';

export function buildRowActions(row, options = {}) {
  const { withView = true, withEdit = true, withDuplicate = true, withShare = true, withEmail = true } = options;
  const common = [];
  if (withView) common.push({ key: 'view', label: 'View', icon: Eye });
  if (withEdit) common.push({ key: 'edit', label: 'Edit', icon: Pencil });
  if (withDuplicate) common.push({ key: 'duplicate', label: 'Duplicate', icon: Copy });

  if (row.status === 'Archived') {
    return [
      ...common,
      { key: 'restore', label: 'Restore', icon: RotateCcw },
      { key: 'delete', label: 'Permanent Delete', icon: Trash2, danger: true }
    ];
  }

  const actions = [...common];
  if (withShare) actions.push({ key: 'share', label: 'Share', icon: Share2 });
  if (withEmail) actions.push({ key: 'sendEmail', label: 'Send Email', icon: Mail });
  if (row.status === 'Inactive') {
    actions.push({ key: 'markActive', label: 'Activate', icon: RotateCcw });
  } else {
    actions.push({ key: 'markInactive', label: 'Mark Inactive', icon: Archive });
  }
  actions.push({ key: 'archive', label: 'Soft Delete', icon: Archive });
  actions.push({ key: 'delete', label: 'Delete Permanently', icon: Trash2, danger: true });
  return actions;
}

export function buildLeadLink(lead) {
  const origin = window.location.origin;
  return `${origin}/leads/${lead.id}`;
}

export async function shareLead(lead) {
  const url = buildLeadLink(lead);
  const text = `${lead.name}${lead.company ? ` · ${lead.company}` : ''} — ${url}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: lead.name, text, url });
      return { ok: true, action: 'share' };
    }
    await navigator.clipboard.writeText(url);
    return { ok: true, action: 'copy' };
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return { ok: true, action: 'cancelled' };
    }
    try {
      await navigator.clipboard.writeText(url);
      return { ok: true, action: 'copy' };
    } catch (clipboardError) {
      return { ok: false, error: clipboardError };
    }
  }
}

export function sendEmail(lead) {
  const subject = encodeURIComponent(`Regarding ${lead.name}${lead.company ? ` - ${lead.company}` : ''}`);
  const body = encodeURIComponent(
    `Hi ${lead.name},\n\nI wanted to get in touch regarding your ongoing interest with us.\n\n` +
      (lead.email ? `Reach us anytime at this address: ${lead.email}\n\n` : '') +
      `Reference: ${buildLeadLink(lead)}`
  );
  window.location.href = `mailto:${lead.email || ''}?subject=${subject}&body=${body}`;
}
