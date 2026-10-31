import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ClipboardList, Printer, Plus, CheckCircle2,
  Building2, StickyNote, Factory, Package, Warehouse, Users, PenLine,
  Info, Activity, FileText, CalendarDays, MapPin, Upload, X, Image
} from 'lucide-react';
import { CreationActionBar, useToast } from '../Common';
import marketingService from '../../services/marketingService';
import { printQForm } from './QFormPrint';
import '../../pages/sales/quotation-create.css';
import './questionnaire-form.css';
import './marketing-form-actions.css';

// ============================== Constants ==============================



const DEFAULT_PLANT_OEM = [
  { section: 'PLANT_OEM', machine: 'Cooler', sortOrder: 0 },
  { section: 'PLANT_OEM', machine: 'Pre Heater', sortOrder: 1 },
  { section: 'PLANT_OEM', machine: 'Kiln', sortOrder: 2 }
];

const DEFAULT_VRM_OEM = [
  { section: 'VRM_OEM', machine: 'VRM — Vertical Roller Mill', sortOrder: 0 },
  { section: 'VRM_OEM', machine: 'VRM — Limestone', sortOrder: 1 },
  { section: 'VRM_OEM', machine: 'VRM — Coal Mill', sortOrder: 2 }
];

const DEFAULT_CEMENT_MILL_OEM = [
  { section: 'CEMENT_MILL_OEM', machine: 'Cement Mill / Ball Mill', sortOrder: 0 }
];

const DEFAULT_CLINKER_CRUSHER = [
  { section: 'CLINKER_CRUSHER', machine: 'Roller', sortOrder: 0 },
  { section: 'CLINKER_CRUSHER', machine: 'Hammer Impact', sortOrder: 1 }
];

const DEFAULT_PACKING_PLANT_OEM = [
  { section: 'PACKING_PLANT_OEM', machine: 'Packing Plant', sortOrder: 0 }
];

const DEPARTMENTS = [
  'Purchase', 'Mechanical', 'Cooler', 'Vertical Roller Mill',
  'Pre Heater & Kiln', 'Plant Director', 'Plant DGM', 'Purchase Head'
];

const DEFAULT_CONTACTS = DEPARTMENTS.map((dept, i) => ({
  department: dept,
  personInCharge: '',
  mobile: '',
  mailId: '',
  sortOrder: i
}));

const fmtDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

// ============================== Signature Upload ==============================

const ACCEPTED_SIG_TYPES = ['image/jpeg', 'image/png', 'image/jpg'];

function SignatureUpload({ value, onChange, disabled, label }) {
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!value) setFileName('');
  }, [value]);

  const processFile = (file) => {
    if (!file) return;
    if (!ACCEPTED_SIG_TYPES.includes(file.type)) {
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      onChange(e.target.result);
      setFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e) => {
    processFile(e.target.files?.[0]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    processFile(e.dataTransfer.files?.[0]);
  };

  const handleRemove = () => {
    onChange(null);
    setFileName('');
  };

  return (
    <div className="qf-sig-upload">
      {value ? (
        <div className="qf-sig-preview">
          <img src={value} alt={label || 'Signature'} className="qf-sig-preview-img" />
          {fileName && <span className="qf-sig-filename">{fileName}</span>}
          {!disabled && (
            <div className="qf-sig-actions">
              <button type="button" className="qf-sig-btn replace" onClick={() => fileRef.current?.click()}>
                <Upload size={12} /> Replace
              </button>
              <button type="button" className="qf-sig-btn remove" onClick={handleRemove}>
                <X size={12} /> Remove
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          className={`qf-sig-dropzone ${dragOver ? 'dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !disabled && fileRef.current?.click()}
        >
          <Image size={28} className="qf-sig-dropzone-icon" />
          <span className="qf-sig-dropzone-text">
            {disabled ? 'No signature uploaded' : 'Click or drag to upload signature'}
          </span>
          {!disabled && (
            <span className="qf-sig-dropzone-hint">JPG, JPEG, PNG</span>
          )}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
        className="qf-sig-file-input"
        onChange={handleFileChange}
        disabled={disabled}
      />
    </div>
  );
}

// ============================== Main Q Form Component ==============================

export default function QuestionnaireForm({ visitId, formId: initialFormId, onClose, onSaveAndContinue, preview = false }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const toggleSection = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  const [formId, setFormId] = useState(initialFormId || null);
  const [status, setStatus] = useState('Not Prepared');
  const [visit, setVisit] = useState(null);
  const [fullVisit, setFullVisit] = useState(null);

  const [dateOfVisit, setDateOfVisit] = useState('');
  const [plantName, setPlantName] = useState('');
  const [plantLocation, setPlantLocation] = useState('');
  const [activeLines, setActiveLines] = useState('');
  const [shutdownPeriod, setShutdownPeriod] = useState('');
  const [productionPerDay, setProductionPerDay] = useState('');
  const [approximatePrDate, setApproximatePrDate] = useState('');
  const [basicRemarks, setBasicRemarks] = useState('');
  const [travelPlanId, setTravelPlanId] = useState(null);
  const [travelPlans, setTravelPlans] = useState([]);
  const [plantOem, setPlantOem] = useState(DEFAULT_PLANT_OEM);
  const [vrmOem, setVrmOem] = useState(DEFAULT_VRM_OEM);
  const [cementMillOem, setCementMillOem] = useState(DEFAULT_CEMENT_MILL_OEM);
  const [clinkerCrusher, setClinkerCrusher] = useState(DEFAULT_CLINKER_CRUSHER);
  const [packingPlantOem, setPackingPlantOem] = useState(DEFAULT_PACKING_PLANT_OEM);
  const [limestoneCrusherDetails, setLimestoneCrusherDetails] = useState('');
  const [contacts, setContacts] = useState(DEFAULT_CONTACTS);
  const [marketingLeadSig, setMarketingLeadSig] = useState(null);
  const [bossCommand, setBossCommand] = useState('');
  const [authoritySig, setAuthoritySig] = useState(null);
  const [meta, setMeta] = useState({ formNo: '', visitNo: '', marketer: '', createdAt: null, updatedAt: null, submittedAt: null, companyName: '', customerName: '', location: '', travelPlanId: null, travelPlanNo: '' });

  const loadFormData = (data) => {
    setFormId(data.id);
    setStatus(data.status);
    setTravelPlanId(data.travelPlanId || null);
    setDateOfVisit(data.dateOfVisit || '');
    setPlantName(data.plantName || '');
    setPlantLocation(data.plantLocation || '');
    setActiveLines(data.activeLines != null ? String(data.activeLines) : '');
    setShutdownPeriod(data.shutdownPeriod || '');
    setProductionPerDay(data.productionPerDay || '');
    setApproximatePrDate(data.approximatePrDate || '');
    setBasicRemarks(data.basicRemarks || '');
    setBossCommand(data.bossCommand || '');
    setMarketingLeadSig(data.marketingLeadSignatureBase64 || null);
    setAuthoritySig(data.authoritySignatureBase64 || null);
    if (data.plantOemDetails?.length > 0) setPlantOem(data.plantOemDetails);
    if (data.vrmOemDetails?.length > 0) setVrmOem(data.vrmOemDetails);
    if (data.cementMillOemDetails?.length > 0) setCementMillOem(data.cementMillOemDetails);
    if (data.clinkerCrusherDetails?.length > 0) setClinkerCrusher(data.clinkerCrusherDetails);
    if (data.packingPlantOemDetails?.length > 0) setPackingPlantOem(data.packingPlantOemDetails);
    setLimestoneCrusherDetails(data.limestoneCrusherDetails || '');
    if (data.plantContacts?.length > 0) setContacts(data.plantContacts);
    setMeta({
      formNo: data.formNo || '',
      visitNo: data.visitNo || '',
      marketer: data.marketer || '',
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null,
      submittedAt: data.submittedAt || null,
      companyName: data.companyName || '',
      customerName: data.customerName || '',
      location: data.location || '',
      travelPlanId: data.travelPlanId || null,
      travelPlanNo: data.travelPlanNo || ''
    });
    setVisit({ companyName: data.companyName, customerName: data.customerName, location: data.location, visitNo: data.visitNo });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        if (initialFormId) {
          // Open existing Q Form by ID
          const existing = await marketingService.getQForm(initialFormId);
          const formData = existing?.data || existing;
          if (!cancelled && formData) loadFormData(formData);
        } else if (visitId) {
          // Visit-linked Q Form: try to get existing, else create
          const existing = await marketingService.getQFormByVisitId(visitId);
          const formData = existing?.data || existing;
          if (cancelled) return;
          if (formData && formData.id) {
            loadFormData(formData);
          } else {
            const created = await marketingService.createQForm({ visitId });
            const createdData = created?.data || created;
            if (!cancelled && createdData) loadFormData(createdData);
          }
        } else {
          // Standalone Q Form: create a new one directly
          const created = await marketingService.createQForm({});
          const createdData = created?.data || created;
          if (!cancelled && createdData) loadFormData(createdData);
        }
        // Load full visit data for print header (if Q Form is linked to a visit)
        const qfVisitId = (initialFormId && !cancelled) ? null : visitId;
        const loadedVisitId = qfVisitId || null;
        if (loadedVisitId && !cancelled) {
          try {
            const visitRes = await marketingService.get(loadedVisitId);
            const visitData = visitRes?.data || visitRes;
            if (!cancelled && visitData) setFullVisit(visitData);
          } catch { /* visit data is optional for print */ }
        }
        // Load Travel Planner reference options for the dropdown
        try {
          const tpRes = await marketingService.listTravelPlans({ page: 0, size: 200, sort: 'createdAt,desc' });
          const tpList = tpRes?.content || (Array.isArray(tpRes) ? tpRes : []);
          if (!cancelled) setTravelPlans(tpList);
        } catch { /* travel planner dropdown is optional */ }
      } catch (err) {
        if (!cancelled) toast.error(err?.message || 'Failed to load Q Form');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId]);

  const buildPayload = useCallback(() => ({
    visitId,
    travelPlanId: travelPlanId || null,
    dateOfVisit: dateOfVisit || null,
    plantName, plantLocation,
    activeLines: activeLines ? parseInt(activeLines, 10) : null,
    shutdownPeriod, productionPerDay, approximatePrDate, basicRemarks,
    plantOemDetails: plantOem, vrmOemDetails: vrmOem,
    cementMillOemDetails: cementMillOem, clinkerCrusherDetails: clinkerCrusher,
    packingPlantOemDetails: packingPlantOem, limestoneCrusherDetails,
    plantContacts: contacts, bossCommand,
    marketingLeadSignatureBase64: marketingLeadSig,
    authoritySignatureBase64: authoritySig
  }), [visitId, travelPlanId, dateOfVisit, plantName, plantLocation, activeLines, shutdownPeriod, productionPerDay,
    approximatePrDate, basicRemarks, plantOem, vrmOem, cementMillOem, clinkerCrusher,
    packingPlantOem, limestoneCrusherDetails, contacts, bossCommand, marketingLeadSig, authoritySig]);

  const saveDraft = async () => {
    if (!formId) return;
    setSaving(true);
    try {
      const res = await marketingService.saveQFormDraft(formId, buildPayload());
      loadFormData(res?.data || res);
      if (visitId) await marketingService.saveQForm(visitId, { qFormStatus: 'Draft' });
      toast.success(preview ? 'Q Form changes saved' : 'Q Form saved as Draft');
    } catch (err) { toast.error(err?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const submitForm = async () => {
    if (!formId) return;
    setSaving(true);
    try {
      const res = await marketingService.submitQForm(formId, buildPayload());
      loadFormData(res?.data || res);
      toast.success('Q Form submitted successfully');
    } catch (err) { toast.error(err?.message || 'Failed to submit'); }
    finally { setSaving(false); }
  };

  const saveAndContinue = async () => {
    if (!formId) return;
    setSaving(true);
    try {
      const res = await marketingService.saveQFormDraft(formId, buildPayload());
      loadFormData(res?.data || res);
      if (!preview && onSaveAndContinue) onSaveAndContinue(formId);
      else toast.success('Q Form saved');
    } catch (err) { toast.error(err?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const updateOem = (setter) => (i, k, v) => setter(p => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const addOem = (setter, def) => () => setter(p => [...p, { ...def, sortOrder: p.length }]);
  const updateContact = (i, k, v) => setContacts(p => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const addContact = () => setContacts(p => [...p, { department: '', personInCharge: '', mobile: '', mailId: '', sortOrder: p.length }]);

  if (loading) return <div className="qtn-create-page qf-page"><div className="qf-loading">Loading Q Form...</div></div>;
  const isSubmitted = status === 'Filled & Submitted';
  const ro = isSubmitted;

  const formDisplayId = meta.formNo || (formId ? `QF-${formId}` : 'New Q Form');
  const companyName = visit?.companyName || meta.companyName || visit?.customerName || meta.customerName || '—';

  return (
    <div className="qtn-create-page qf-page">
      <style>{QF_PRINT_CSS}</style>

      <div className="qtn-create-inner">
        {/* ===== PAGE HEAD — title + status ===== */}
        <div className="qf-page-head">
          <div className="qf-page-head-left">
            <div className="qf-page-head-icon"><ClipboardList size={22} /></div>
            <div>
              <h1>{preview ? 'Q Form Preview' : 'Q Form'}</h1>
              <div className="qf-page-subtitle">
                Questionnaire Form{visit && (visit.visitNo || companyName !== '—') ? ` · ${[visit.visitNo, companyName === '—' ? null : companyName].filter(Boolean).join(' — ')}` : ''}
              </div>
            </div>
          </div>
          <div className="qf-toolbar-right">
            <span className={`qf-status-pill ${isSubmitted ? 'qf-status-submitted' : status === 'Draft' ? 'qf-status-draft' : 'qf-status-new'}`}>
              {isSubmitted && <CheckCircle2 size={12} />}
              {status}
            </span>
            <button onClick={() => {
              const vd = fullVisit || {
                visitNo: meta.visitNo || visit?.visitNo,
                companyName: visit?.companyName || meta.companyName,
                customerName: visit?.customerName || meta.customerName,
                location: visit?.location || meta.location,
                scheduleDate: dateOfVisit,
                contactPerson: visit?.contactPerson || meta.contactPerson,
              };
              printQForm({ ...buildPayload(), id: formId, formNo: formDisplayId }, vd);
            }} className="qtn-btn qtn-btn-secondary" style={{ height: 38, padding: '0 16px', fontSize: 13 }}>
              <Printer size={14} /> Print
            </button>
          </div>
        </div>

        {/* ===== 2-COLUMN LAYOUT (ERP create page): main form + right-side panel ===== */}
        <div className="qtn-create-grid">
          <div className="qtn-main-form">
            {/* ===== Q FORM HEADER CARD ===== */}
            <div className="qtn-card">
              <div className="qtn-card-body">
                <div className="qf-header-meta">
                  <div className="qf-header-meta-item">
                    <span className="qf-header-meta-label">Q Form ID</span>
                    <span className="qf-header-meta-value">{formDisplayId}</span>
                  </div>
                  <div className="qf-header-meta-item">
                    <span className="qf-header-meta-label">Status</span>
                    <span className={`qf-status-pill ${isSubmitted ? 'qf-status-submitted' : status === 'Draft' ? 'qf-status-draft' : 'qf-status-new'}`}>{status}</span>
                  </div>
                  <div className="qf-header-meta-item">
                    <span className="qf-header-meta-label">Marketing User</span>
                    <span className="qf-header-meta-value">{meta.marketer || '—'}</span>
                  </div>
                  <div className="qf-header-meta-item">
                    <span className="qf-header-meta-label">Travel Registry Reference</span>
                    <span className="qf-header-meta-value">{meta.travelPlanNo || '—'}</span>
                  </div>
                  <div className="qf-header-meta-item">
                    <span className="qf-header-meta-label">Visit No</span>
                    <span className="qf-header-meta-value">{meta.visitNo || visit?.visitNo || '—'}</span>
                  </div>
                  <div className="qf-header-meta-item">
                    <span className="qf-header-meta-label">Company</span>
                    <span className="qf-header-meta-value">{companyName}</span>
                  </div>
                  <div className="qf-header-meta-item">
                    <span className="qf-header-meta-label">Location</span>
                    <span className="qf-header-meta-value">{visit?.location || meta.location || '—'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== VISIT / PLANT BASIC INFORMATION ===== */}
            <div className="qtn-card">
              <div className="qtn-card-header" onClick={() => toggleSection('visit')} style={{ cursor: 'pointer' }}>
                <h3><Building2 size={15} /> Visit / Plant Basic Information</h3>
                <span style={{ fontSize: 12, color: '#64748B', transition: 'transform 0.2s', transform: collapsed.visit ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
              </div>
              {!collapsed.visit && (<div className="qtn-card-body">
                <div className="qtn-grid-2">
                  <div className="qtn-field">
                    <label htmlFor="qfDateOfVisit">Date of Visit</label>
                    <input id="qfDateOfVisit" type="date" className="qtn-input" value={dateOfVisit}
                      onChange={e => setDateOfVisit(e.target.value)} disabled={ro} />
                  </div>
                  <div className="qtn-field">
                    <label htmlFor="qfActiveLines">Number of Active Lines in the Plant</label>
                    <input id="qfActiveLines" type="text" className="qtn-input" value={activeLines}
                      onChange={e => setActiveLines(e.target.value)} disabled={ro} placeholder="e.g. 2" />
                  </div>
                </div>
                <div className="qtn-field" style={{ marginTop: 16 }}>
                  <label htmlFor="qfPlantName">Plant Name &amp; Group Name</label>
                  <input id="qfPlantName" type="text" className="qtn-input" value={plantName}
                    onChange={e => setPlantName(e.target.value)} disabled={ro} placeholder="Plant name & group name" />
                </div>
                <div className="qtn-field" style={{ marginTop: 16 }}>
                  <label htmlFor="qfPlantLocation">Location &amp; Address of the Plant</label>
                  <textarea id="qfPlantLocation" rows={3} className="qtn-input qf-textarea" value={plantLocation}
                    onChange={e => setPlantLocation(e.target.value)} disabled={ro} placeholder="Location & address of the plant" />
                </div>
                <div className="qtn-grid-2" style={{ marginTop: 16 }}>
                  <div className="qtn-field">
                    <label htmlFor="qfShutdown">Shutdown Period Per Year</label>
                    <input id="qfShutdown" type="text" className="qtn-input" value={shutdownPeriod}
                      onChange={e => setShutdownPeriod(e.target.value)} disabled={ro} placeholder="e.g. 30 days" />
                  </div>
                  <div className="qtn-field">
                    <label htmlFor="qfProduction">Production (Tones Per Day)</label>
                    <input id="qfProduction" type="text" className="qtn-input" value={productionPerDay}
                      onChange={e => setProductionPerDay(e.target.value)} disabled={ro} placeholder="e.g. 3200 TPD" />
                  </div>
                </div>
                <div className="qtn-field" style={{ marginTop: 16 }}>
                  <label htmlFor="qfPrDate">Approximate PR Date</label>
                  <input id="qfPrDate" type="text" className="qtn-input" value={approximatePrDate}
                    onChange={e => setApproximatePrDate(e.target.value)} disabled={ro} placeholder="e.g. Q1 2027" />
                </div>
              </div>
              )}</div>

            {/* ===== ANY OTHER REMARKS ===== */}
            <div className="qtn-card">
              <div className="qtn-card-header" onClick={() => toggleSection('remarks')} style={{ cursor: 'pointer' }}>
                <h3><StickyNote size={15} /> Any Other Remarks</h3>
                <span style={{ fontSize: 12, color: '#64748B', transition: 'transform 0.2s', transform: collapsed.remarks ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
              </div>
              {!collapsed.remarks && (<div className="qtn-card-body">
                <div className="qtn-field">
                  <label htmlFor="qfRemarks">Any other Remarks:</label>
                  <textarea id="qfRemarks" rows={4} className="qtn-input qf-textarea" value={basicRemarks}
                    onChange={e => setBasicRemarks(e.target.value)} disabled={ro}
                    placeholder="Add any other remarks..." />
                </div>
              </div>
              )}</div>

            {/* ===== PLANT OEM DETAILS ===== */}
            <div className="qtn-card">
              <div className="qtn-card-header" onClick={() => toggleSection('oem')} style={{ cursor: 'pointer' }}>
                <h3><Factory size={15} /> Plant OEM Details</h3>
                <span style={{ fontSize: 12, color: '#64748B', transition: 'transform 0.2s', transform: collapsed.oem ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
              </div>
              {!collapsed.oem && (<div className="qtn-card-body">
                <div className="qf-subsection">Plant OEM Details as Follows: (Original Equipment Manufacturer)</div>
                <div className="qf-table-wrap">
                  <table className="qf-table">
                    <thead>
                      <tr>
                        <th>S. No</th><th>Machine</th><th>IKN</th><th>FL Smith</th>
                        <th>Polysius (Poly Track)</th><th>KHD</th><th>Claudius Peters</th><th>Sinoma</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plantOem.map((r, i) => (
                        <tr key={i}>
                          <td className="qf-sno">{String.fromCharCode(97 + i)}.</td>
                          <td className="qf-machine"><input className="qf-cell-input" value={r.machine} onChange={e => updateOem(setPlantOem)(i, 'machine', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.ikn || ''} onChange={e => updateOem(setPlantOem)(i, 'ikn', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.flSmith || ''} onChange={e => updateOem(setPlantOem)(i, 'flSmith', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.polysius || ''} onChange={e => updateOem(setPlantOem)(i, 'polysius', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.khd || ''} onChange={e => updateOem(setPlantOem)(i, 'khd', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.claudiusPeters || ''} onChange={e => updateOem(setPlantOem)(i, 'claudiusPeters', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.sinoma || ''} onChange={e => updateOem(setPlantOem)(i, 'sinoma', e.target.value)} disabled={ro} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!ro && (
                  <button type="button" onClick={addOem(setPlantOem, { section: 'PLANT_OEM', machine: '', sortOrder: plantOem.length })} className="qf-add-row no-print">
                    <Plus size={13} /> Add Row
                  </button>
                )}

                <div className="qf-subsection" style={{ marginTop: 22 }}>VRM OEM Details</div>
                <div className="qf-table-wrap">
                  <table className="qf-table">
                    <thead>
                      <tr>
                        <th>S. No</th><th>Machine</th><th>Loesche</th><th>Gebr. Pfeiffer</th>
                        <th>Polysius</th><th>Pfeiffer</th><th>Pfeiffer Part Number</th><th>Atox</th><th>Sinoma</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vrmOem.map((r, i) => (
                        <tr key={i}>
                          <td className="qf-sno">{String.fromCharCode(97 + i)}.</td>
                          <td className="qf-machine"><input className="qf-cell-input" value={r.machine} onChange={e => updateOem(setVrmOem)(i, 'machine', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.loesche || ''} onChange={e => updateOem(setVrmOem)(i, 'loesche', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.gebrPfeiffer || ''} onChange={e => updateOem(setVrmOem)(i, 'gebrPfeiffer', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.polysius || ''} onChange={e => updateOem(setVrmOem)(i, 'polysius', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.pfeiffer || ''} onChange={e => updateOem(setVrmOem)(i, 'pfeiffer', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.pfeifferPartNumber || ''} onChange={e => updateOem(setVrmOem)(i, 'pfeifferPartNumber', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.atox || ''} onChange={e => updateOem(setVrmOem)(i, 'atox', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.sinoma || ''} onChange={e => updateOem(setVrmOem)(i, 'sinoma', e.target.value)} disabled={ro} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="qf-subsection" style={{ marginTop: 22 }}>Cement Mill / Ball Mill OEM Details</div>
                <div className="qf-table-wrap">
                  <table className="qf-table">
                    <thead><tr><th>Machine</th><th>Christian Pfeiffer</th><th>Vega</th><th>Megatoux</th></tr></thead>
                    <tbody>
                      {cementMillOem.map((r, i) => (
                        <tr key={i}>
                          <td className="qf-machine">Cement Mill / Ball Mill</td>
                          <td><input className="qf-cell-input" value={r.christianPfeiffer || ''} onChange={e => updateOem(setCementMillOem)(i, 'christianPfeiffer', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.vega || ''} onChange={e => updateOem(setCementMillOem)(i, 'vega', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.megatoux || ''} onChange={e => updateOem(setCementMillOem)(i, 'megatoux', e.target.value)} disabled={ro} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="qf-subsection" style={{ marginTop: 22 }}>Clinker Crusher</div>
                <div className="qf-table-wrap">
                  <table className="qf-table">
                    <thead><tr><th>Type</th><th>Roller — IKN</th><th>Roller — FL Smith</th><th>Hammer Impact</th></tr></thead>
                    <tbody>
                      {clinkerCrusher.map((r, i) => (
                        <tr key={i}>
                          <td><input className="qf-cell-input" value={r.machine} onChange={e => updateOem(setClinkerCrusher)(i, 'machine', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.rollerIkn || ''} onChange={e => updateOem(setClinkerCrusher)(i, 'rollerIkn', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.rollerFlSmith || ''} onChange={e => updateOem(setClinkerCrusher)(i, 'rollerFlSmith', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.hammerImpact || ''} onChange={e => updateOem(setClinkerCrusher)(i, 'hammerImpact', e.target.value)} disabled={ro} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              )}</div>

            {/* ===== LIMESTONE CRUSHER ===== */}
            <div className="qtn-card">
              <div className="qtn-card-header" onClick={() => toggleSection('limestone')} style={{ cursor: 'pointer' }}>
                <h3><Package size={15} /> Limestone Crusher</h3>
                <span style={{ fontSize: 12, color: '#64748B', transition: 'transform 0.2s', transform: collapsed.limestone ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
              </div>
              {!collapsed.limestone && (<div className="qtn-card-body">
                <div className="qtn-field">
                  <label htmlFor="qfLimestoneCrusher">Limestone Crusher Details</label>
                  <textarea id="qfLimestoneCrusher" rows={5} className="qtn-input qf-textarea" value={limestoneCrusherDetails}
                    onChange={e => setLimestoneCrusherDetails(e.target.value)} disabled={ro}
                    placeholder="Enter limestone crusher details..." />
                </div>
              </div>
              )}</div>

            {/* ===== PACKING PLANT OEM DETAILS ===== */}
            <div className="qtn-card">
              <div className="qtn-card-header" onClick={() => toggleSection('packing')} style={{ cursor: 'pointer' }}>
                <h3><Warehouse size={15} /> Packing Plant OEM Details</h3>
                <span style={{ fontSize: 12, color: '#64748B', transition: 'transform 0.2s', transform: collapsed.packing ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
              </div>
              {!collapsed.packing && (<div className="qtn-card-body">
                <div className="qf-subsection">Packing Plant OEM Details as Follows: (Original Equipment Manufacturer)</div>
                <div className="qf-table-wrap">
                  <table className="qf-table">
                    <thead><tr><th>Machine</th><th>FL Smith</th><th>Vendomatic</th><th>Buemer</th><th>Haver &amp; Booker</th><th>China</th></tr></thead>
                    <tbody>
                      {packingPlantOem.map((r, i) => (
                        <tr key={i}>
                          <td className="qf-machine">Packing Plant</td>
                          <td><input className="qf-cell-input" value={r.flSmith || ''} onChange={e => updateOem(setPackingPlantOem)(i, 'flSmith', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.vendomatic || ''} onChange={e => updateOem(setPackingPlantOem)(i, 'vendomatic', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.buemer || ''} onChange={e => updateOem(setPackingPlantOem)(i, 'buemer', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.haverBooker || ''} onChange={e => updateOem(setPackingPlantOem)(i, 'haverBooker', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.china || ''} onChange={e => updateOem(setPackingPlantOem)(i, 'china', e.target.value)} disabled={ro} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              )}</div>

            {/* ===== CONTACT DETAILS ===== */}
            <div className="qtn-card">
              <div className="qtn-card-header" onClick={() => toggleSection('contacts')} style={{ cursor: 'pointer' }}>
                <h3><Users size={15} /> Plant Contact Details</h3>
                <span style={{ fontSize: 12, color: '#64748B', transition: 'transform 0.2s', transform: collapsed.contacts ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
              </div>
              {!collapsed.contacts && (<div className="qtn-card-body">
                <div className="qf-table-wrap">
                  <table className="qf-table">
                    <thead><tr><th>Department</th><th>Person In charge</th><th>Mobile</th><th>Mail ID</th></tr></thead>
                    <tbody>
                      {contacts.map((r, i) => (
                        <tr key={i}>
                          <td><input className="qf-cell-input" value={r.department} onChange={e => updateContact(i, 'department', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.personInCharge || ''} onChange={e => updateContact(i, 'personInCharge', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.mobile || ''} onChange={e => updateContact(i, 'mobile', e.target.value)} disabled={ro} /></td>
                          <td><input className="qf-cell-input" value={r.mailId || ''} onChange={e => updateContact(i, 'mailId', e.target.value)} disabled={ro} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!ro && (
                  <button type="button" onClick={addContact} className="qf-add-row no-print">
                    <Plus size={13} /> Add Contact Row
                  </button>
                )}
              </div>
              )}</div>

            {/* ===== SIGNATURE / APPROVAL ===== */}
            <div className="qtn-card">
              <div className="qtn-card-header" onClick={() => toggleSection('signature')} style={{ cursor: 'pointer' }}>
                <h3><PenLine size={15} /> Signature / Approval</h3>
                <span style={{ fontSize: 12, color: '#64748B', transition: 'transform 0.2s', transform: collapsed.signature ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
              </div>
              {!collapsed.signature && (<div className="qtn-card-body">
                <div className="qtn-grid-2">
                  <div className="qtn-field">
                    <label>Signature of the Marketing Lead</label>
                    <SignatureUpload value={marketingLeadSig} onChange={setMarketingLeadSig} disabled={ro} label="Marketing Lead" />
                  </div>
                  <div className="qtn-field">
                    <label>Signature of the Authority</label>
                    <SignatureUpload value={authoritySig} onChange={setAuthoritySig} disabled={ro} label="Authority" />
                  </div>
                </div>
                <div className="qtn-field" style={{ marginTop: 20 }}>
                  <label htmlFor="qfBossCommand">Boss Command:</label>
                  <textarea id="qfBossCommand" rows={4} className="qtn-input qf-textarea" value={bossCommand}
                    onChange={e => setBossCommand(e.target.value)} disabled={ro}
                    placeholder="Enter Boss Command instructions..." />
                </div>
              </div>
              )}</div>
          </div>

          {/* ===== RIGHT-SIDE / SECONDARY PANEL ===== */}
          <div className="qtn-sidebar-form">
            <div className="qtn-card">
              <div className="qtn-card-header">
                <h3><Info size={14} /> Document Information</h3>
              </div>
              <div className="qtn-card-body">
                <div className="qf-meta-list">
                  <div className="qf-meta-item">
                    <span className="qf-meta-label">Q Form ID</span>
                    <span className="qf-meta-value">{formDisplayId}</span>
                  </div>
                  <div className="qf-meta-item">
                    <span className="qf-meta-label">Status</span>
                    <span className={`qf-status-pill ${isSubmitted ? 'qf-status-submitted' : status === 'Draft' ? 'qf-status-draft' : 'qf-status-new'}`}>{status}</span>
                  </div>
                  <div className="qf-meta-item">
                    <span className="qf-meta-label">Visit No</span>
                    <span className="qf-meta-value">{meta.visitNo || visit?.visitNo || '—'}</span>
                  </div>
                  <div className="qf-meta-item">
                    <span className="qf-meta-label">Marketing User</span>
                    <span className="qf-meta-value">{meta.marketer || '—'}</span>
                  </div>
                  <div className="qf-meta-item">
                    <span className="qf-meta-label">Travel Registry Reference</span>
                    <span className="qf-meta-value">
                      {ro ? (
                        meta.travelPlanNo || '—'
                      ) : (
                        <select className="qtn-input" value={travelPlanId || ''}
                          onChange={e => setTravelPlanId(e.target.value ? Number(e.target.value) : null)}
                          style={{ padding: '6px 8px', fontSize: 12 }}>
                          <option value="">— Select Travel Registry —</option>
                          {travelPlans.map(tp => (
                            <option key={tp.id} value={tp.id}>
                              {tp.planNo || `TP-${tp.id}`} · {tp.startDate || ''} · {tp.startingLocation || ''} →’ {tp.endingLocation || ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </span>
                  </div>
                  <div className="qf-meta-item">
                    <span className="qf-meta-label">Company</span>
                    <span className="qf-meta-value">{companyName}</span>
                  </div>
                  <div className="qf-meta-item">
                    <span className="qf-meta-label">Location</span>
                    <span className="qf-meta-value">{visit?.location || meta.location || '—'}</span>
                  </div>
                  <div className="qf-meta-item">
                    <span className="qf-meta-label">Created</span>
                    <span className="qf-meta-value">{fmtDateTime(meta.createdAt)}</span>
                  </div>
                  <div className="qf-meta-item">
                    <span className="qf-meta-label">Updated</span>
                    <span className="qf-meta-value">{fmtDateTime(meta.updatedAt)}</span>
                  </div>
                  {meta.submittedAt && (
                    <div className="qf-meta-item">
                      <span className="qf-meta-label">Submitted</span>
                      <span className="qf-meta-value">{fmtDateTime(meta.submittedAt)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="qtn-card">
              <div className="qtn-card-header">
                <h3><Activity size={14} /> Plant Snapshot</h3>
              </div>
              <div className="qtn-card-body">
                <div className="qf-snapshot-list">
                  <div className="qf-snapshot-row">
                    <div className="qf-snapshot-icon"><CalendarDays size={14} /></div>
                    <div className="qf-snapshot-text">
                      <div className="qf-snapshot-label">Date of Visit</div>
                      <div className="qf-snapshot-value">{dateOfVisit || 'Not filled'}</div>
                    </div>
                  </div>
                  <div className="qf-snapshot-row">
                    <div className="qf-snapshot-icon"><Building2 size={14} /></div>
                    <div className="qf-snapshot-text">
                      <div className="qf-snapshot-label">Plant / Group</div>
                      <div className="qf-snapshot-value">{plantName || 'Not filled'}</div>
                    </div>
                  </div>
                  <div className="qf-snapshot-row">
                    <div className="qf-snapshot-icon"><Factory size={14} /></div>
                    <div className="qf-snapshot-text">
                      <div className="qf-snapshot-label">Active Lines</div>
                      <div className="qf-snapshot-value">{activeLines || 'Not filled'}</div>
                    </div>
                  </div>
                  <div className="qf-snapshot-row">
                    <div className="qf-snapshot-icon"><Activity size={14} /></div>
                    <div className="qf-snapshot-text">
                      <div className="qf-snapshot-label">Shutdown / Year</div>
                      <div className="qf-snapshot-value">{shutdownPeriod || 'Not filled'}</div>
                    </div>
                  </div>
                  <div className="qf-snapshot-row">
                    <div className="qf-snapshot-icon"><FileText size={14} /></div>
                    <div className="qf-snapshot-text">
                      <div className="qf-snapshot-label">Production / Day</div>
                      <div className="qf-snapshot-value">{productionPerDay || 'Not filled'}</div>
                    </div>
                  </div>
                  <div className="qf-snapshot-row">
                    <div className="qf-snapshot-icon"><MapPin size={14} /></div>
                    <div className="qf-snapshot-text">
                      <div className="qf-snapshot-label">Location</div>
                      <div className="qf-snapshot-value">{plantLocation || 'Not filled'}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== BOTTOM ACTION BAR (ERP standard creation action bar) ===== */}
        <CreationActionBar
          className="mkt-action-scope"
          onBackToList={onClose}
          backLabel="Back"
          onSaveDraft={!isSubmitted ? saveDraft : null}
          draftLabel={preview ? 'Save Changes' : 'Save as Draft'}
          onSave={!isSubmitted ? saveAndContinue : null}
          saveLabel="Save & Continue"
          onSubmit={!isSubmitted ? submitForm : null}
          submitLabel="Submit"
          extraRight={
            <button
              type="button"
              className="erp-create-btn"
              onClick={() => {
                const vd = fullVisit || {
                  visitNo: meta.visitNo || visit?.visitNo,
                  companyName: visit?.companyName || meta.companyName,
                  customerName: visit?.customerName || meta.customerName,
                  location: visit?.location || meta.location,
                  scheduleDate: dateOfVisit,
                  contactPerson: visit?.contactPerson || meta.contactPerson,
                };
                printQForm({ ...buildPayload(), id: formId, formNo: formDisplayId }, vd);
              }}
              disabled={saving}
            >
              <Printer size={14} /> Print / Download
            </button>
          }
          disabled={saving}
        />
      </div>
    </div>
  );
}

// ============================== Print Styles ==============================

const QF_PRINT_CSS = `
@media print {
  @page { margin: 15mm 12mm; size: A4; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { background: #fff !important; margin: 0 !important; padding: 0 !important; font-size: 10pt !important; }
  .no-print, .qtn-form-footer, .qf-toolbar-right, .qf-page-head-icon { display: none !important; }
  .qtn-create-page { background: #fff !important; padding: 0 !important; margin: 0 !important; }
  .qtn-create-inner { padding: 0 !important; margin: 0 !important; }
  .qtn-sidebar-form { display: none !important; }
  .qtn-create-grid { grid-template-columns: 1fr !important; gap: 8px !important; }
  .qtn-card { box-shadow: none !important; border: 1px solid #e2e8f0 !important; break-inside: avoid; page-break-inside: avoid; margin-bottom: 8px !important; padding: 10px !important; }
  .qf-table-wrap { overflow: visible !important; }
  table { width: 100% !important; border-collapse: collapse !important; font-size: 9pt !important; }
  table th, table td { padding: 4px 6px !important; border: 1px solid #cbd5e1 !important; text-align: left !important; vertical-align: top !important; word-wrap: break-word !important; overflow-wrap: break-word !important; }
  table th { background: #F3F4F6 !important; font-weight: 700 !important; font-size: 8.5pt !important; white-space: nowrap !important; }
  .qf-page-head h1 { font-size: 16pt !important; margin: 0 0 2px !important; }
  .qf-page-subtitle { font-size: 9pt !important; color: #475569 !important; }
  .qf-sig-wrap { break-inside: avoid !important; page-break-inside: avoid !important; }
  .qf-sig-canvas { border: 1px solid #cbd5e1 !important; max-width: 200px !important; max-height: 60px !important; }
  .qf-section-title { font-size: 10pt !important; border-bottom: 2px solid #0B4A3D !important; padding-bottom: 3px !important; margin-bottom: 6px !important; }
  .qf-field-grid { gap: 4px !important; }
  .qf-field-label { font-size: 8pt !important; }
  .qf-field-value { font-size: 9pt !important; }
}
`;