import { useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { Modal, FormField, TextInput, TextArea, useToast } from '../Common';
import {
  EMAIL_MODE,
  leadContactName,
  leadDisplayName,
  logLeadCommunication,
  openMailClient
} from '../../utils/leadCommunication';

const todayISO = () => new Date().toISOString().slice(0, 10);
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

const READONLY_CLS = 'bg-slate-100 text-slate-500 cursor-not-allowed';
const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';

// Starter body — same wording the ERP already uses for a lead email.
function seedBody(lead) {
  return (
    `Hi ${leadContactName(lead) || 'Sir/Madam'},\n\n` +
    'I wanted to get in touch regarding your ongoing interest with us.\n\n' +
    'Best Regards,\nVISHAK TECH'
  );
}

/**
 * Send Email — inline composition dialog for Leads → Actions → Send Email.
 *
 * Composes the message over the Leads page (no navigation) and records the
 * communication against the selected Lead through the existing follow-up API
 * (`mode: 'Email'`). The message itself is handed to the user's mail client,
 * matching the ERP's existing mail behaviour — the backend has no SMTP config.
 */
export default function SendEmailModal({ open, lead, onClose, onSaved }) {
  const toast = useToast();
  // The page mounts this dialog with a fresh `key` on every open (the ERP
  // pattern used by the other lead dialogs), so the recipient and contact
  // details always belong to the row the user acted on.
  const [to, setTo] = useState(lead?.email || '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(`Regarding ${leadDisplayName(lead)}`);
  const [body, setBody] = useState(() => seedBody(lead));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const handleSend = async () => {
    if (submitting) return;

    const next = {};
    const recipients = to
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (recipients.length === 0) next.to = 'Recipient email is required';
    else if (recipients.some((value) => !EMAIL_PATTERN.test(value))) {
      next.to = 'Enter a valid recipient email address';
    }
    if (cc.trim() && cc.split(',').some((value) => value.trim() && !EMAIL_PATTERN.test(value.trim()))) {
      next.cc = 'Enter a valid CC email address';
    }
    if (bcc.trim() && bcc.split(',').some((value) => value.trim() && !EMAIL_PATTERN.test(value.trim()))) {
      next.bcc = 'Enter a valid BCC email address';
    }
    if (!subject.trim()) next.subject = 'Subject is required';
    if (!body.trim()) next.body = 'Email body is required';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      // Real backend persistence first — the communication is only handed to the
      // mail client once the Lead-scoped record has actually been saved.
      await logLeadCommunication(lead, {
        mode: EMAIL_MODE,
        followupDate: todayISO(),
        discussionSummary: subject.trim(),
        customerFeedback: body
      });

      openMailClient({ to, cc, bcc, subject: subject.trim(), body });

      toast.success(`Email drafted for ${recipients[0]} — recorded on ${leadDisplayName(lead)}`);
      onSaved?.(lead);
      onClose?.();
    } catch (err) {
      toast.error(err?.message || 'Failed to record the email');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send Email"
      maxWidth="max-w-2xl"
      footer={
        <>
          <button
            onClick={onClose}
            className="text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={submitting}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
            {submitting ? 'Sending...' : 'Send Email'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-violet-50 flex items-center justify-center text-violet-600 font-bold text-sm">
            {(leadContactName(lead) || leadDisplayName(lead)).slice(0, 1).toUpperCase() || '?'}
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">{leadDisplayName(lead)}</div>
            <div className="text-[11px] text-slate-400 font-medium">{leadContactName(lead)}</div>
          </div>
        </div>

        <div className={GRID}>
          <FormField label="Lead">
            <TextInput value={leadDisplayName(lead)} readOnly className={READONLY_CLS} />
          </FormField>
          <FormField label="Contact Person">
            <TextInput value={leadContactName(lead)} readOnly className={READONLY_CLS} />
          </FormField>
          <FormField
            label="Email Address (from Lead)"
            hint={lead?.email ? undefined : 'This lead has no email address on record.'}
          >
            <TextInput value={lead?.email || ''} readOnly className={READONLY_CLS} />
          </FormField>
          <FormField label="To" required error={errors.to}>
            <TextInput
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@company.com"
              error={!!errors.to}
            />
          </FormField>
          <FormField label="CC" error={errors.cc}>
            <TextInput
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="Optional"
              error={!!errors.cc}
            />
          </FormField>
          <FormField label="BCC" error={errors.bcc}>
            <TextInput
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              placeholder="Optional"
              error={!!errors.bcc}
            />
          </FormField>
        </div>

        <FormField label="Subject" required error={errors.subject}>
          <TextInput
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            error={!!errors.subject}
          />
        </FormField>

        <FormField label="Email Body" required error={errors.body}>
          <TextArea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            error={!!errors.body}
            placeholder="Write your message..."
          />
        </FormField>

        <div className="text-[11px] text-slate-400 font-medium">
          The message is recorded as an Email entry on this lead through the existing
          Follow-ups workflow, then opened in your default mail client. Attachments are
          sent from the mail client (the ERP has no SMTP configuration).
        </div>
      </div>
    </Modal>
  );
}
