import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock, Plus } from 'lucide-react';
import { useToast } from '../../components/Common';
import { ActivityForm } from '../../components/Marketing/VisitFollowUpExtension';
import marketingService from '../../services/marketingService';
import '../../components/Marketing/visit-followup-extension.css';

/**
 * Standalone Follow-up / Visit Extension creation & edit page.
 *
 * Modes:
 *   mode="followup"   → /marketing/follow-ups/new            (new follow-up)
 *   mode="extension"  → /marketing/follow-ups/extensions/new (new visit extension)
 *   mode="edit"       → /marketing/follow-ups/:id/edit?src=followup|activity
 *
 * Follow-ups are persisted in marketing_followups (POST/PUT /marketing/follow-ups);
 * visit extensions remain in marketing_visit_activities (POST/PUT
 * /marketing/activities). The `src` query param on the edit route tells the
 * page which backend owns the record being edited.
 */

// Map the shared ActivityForm payload onto the MarketingFollowUpRequest DTO.
const toFollowUpPayload = (form) => ({
  visitId: form.visitId ?? form._visitId ?? null,
  followupDate: form.activityDate || new Date().toISOString().slice(0, 10),
  time: form.activityTime || '',
  mode: form.followupType || form.mode || 'Phone Call',
  status: form.status || 'Pending',
  purpose: form.discussion || '',
  nextAction: form.nextAction || '',
  customerResponse: form.customerResponse || '',
  remarks: form.remarks || '',
  nextFollowupDate: form.nextFollowupDate || null,
});

// Map a loaded MarketingFollowUpResponse back onto the shared form shape.
const followUpToForm = (f) => ({
  _visitId: f.visitId,
  activityDate: f.followupDate || '',
  activityTime: f.time || '',
  followupType: f.mode || '',
  mode: f.mode || '',
  status: f.status || 'Pending',
  discussion: f.purpose || '',
  nextAction: f.nextAction || '',
  customerResponse: f.customerResponse || '',
  remarks: f.remarks || '',
  nextFollowupDate: f.nextFollowupDate || '',
});

export default function FollowUpActivityPage({ mode = 'followup' }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();

  const isEdit = mode === 'edit';
  const type = isEdit ? null : mode;
  // Which backend owns this record: marketing_followups or visit activities.
  const isFollowUp = isEdit
    ? searchParams.get('src') === 'followup'
    : mode === 'followup';

  const [visits, setVisits] = useState([]);
  const [initial, setInitial] = useState(null);
  const [initialVisit, setInitialVisit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    let cancelled = false;

    const loadVisits = marketingService.list({ size: 200 })
      .then(res => (res?.content || (Array.isArray(res) ? res : [])))
      .catch(() => []);
    const loadRecord = isEdit && id
      ? (isFollowUp ? marketingService.getFollowUp(id) : marketingService.getActivity(id))
        .catch(err => { throw err; })
      : Promise.resolve(null);

    Promise.all([loadVisits, loadRecord])
      .then(([list, rec]) => {
        if (cancelled) return;
        setVisits(list);
        setInitial(rec ? (isFollowUp ? followUpToForm(rec) : rec) : null);
        const visitId = isFollowUp ? rec?.visitId : rec?.visitId;
        if (visitId) {
          setInitialVisit(list.find(v => v.id === visitId) || null);
        }
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setLoading(false);
        toast.error(err?.message || 'Failed to load');
      });

    return () => { cancelled = true; };
  }, [isEdit, id, isFollowUp, toast]);

  const title = isEdit
    ? (isFollowUp ? 'Edit Follow-up' : 'Edit Visit Extension')
    : mode === 'extension'
      ? 'New Visit Extension'
      : 'New Follow-up';

  const handleSave = async (payload) => {
    setSaving(true);
    try {
      if (isFollowUp) {
        const body = toFollowUpPayload(payload);
        if (isEdit && id) {
          await marketingService.updateFollowUpRecord(id, body);
          toast.success('Follow-up updated');
        } else {
          await marketingService.createFollowUp(body);
          toast.success('Follow-up created');
        }
      } else if (isEdit && id) {
        await marketingService.updateActivity(id, payload);
        toast.success('Activity updated');
      } else {
        await marketingService.createActivity(payload);
        toast.success('Visit extension created');
      }
      navigate('/marketing/follow-ups');
    } catch (err) {
      toast.error(err?.message || 'Failed to save record');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="purchase-page cpr-page" style={{ paddingTop: 20, paddingBottom: 80 }}>
      <div className="vfue-root" style={{ maxWidth: 860, margin: '0 auto', padding: 0 }}>
        {/* Header */}
        <div className="vfue-header">
          <div>
            <h1 className="vfue-title">
              <Clock size={18} style={{ color: '#0B4A3D', marginRight: 6, verticalAlign: -3 }} />
              {title}
            </h1>
            <p className="vfue-subtitle">
              {isEdit ? 'Update the existing follow-up or visit extension record.' : 'Record a follow-up or visit extension against an original marketing visit.'}
            </p>
          </div>
          <button type="button" className="vfue-btn secondary" onClick={() => navigate('/marketing/follow-ups')}>
            <ArrowLeft size={14} /> Back to List
          </button>
        </div>

        {/* Form */}
        <div className="vfue-form-card">
          <div className="vfue-form-header">
            <h3>{isEdit ? 'Edit Details' : mode === 'extension' ? 'Visit Extension Details' : 'Follow-up Details'}</h3>
            <Plus size={15} style={{ color: '#0B4A3D' }} />
          </div>
          {loading ? (
            <div className="vfue-loading"><div className="vfue-spinner" /></div>
          ) : (
            <ActivityForm
              type={type}
              initial={initial || {}}
              visit={initialVisit}
              visits={visits}
              onSave={handleSave}
              onCancel={() => navigate('/marketing/follow-ups')}
              saving={saving}
            />
          )}
        </div>
      </div>
    </div>
  );
}