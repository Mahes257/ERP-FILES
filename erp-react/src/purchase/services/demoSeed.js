/**
 * purchase/services/demoSeed.js
 * ------------------------------------------------------------------
 * Coherent Indian industrial procurement demo dataset for the Purchase
 * ERP module. Each function returns an array of seed records.
 * ------------------------------------------------------------------
 */
import {
  APPROVAL_STATUS, PR_STATUS, RFQ_STATUS,
  PO_STATUS, INVOICE_STATUS,
  VENDOR_STATUS, VENDOR_RECORD_STATE
} from '../constants';
import { calcDocumentTotals } from '../utils/purchase';

/* ================================================================== */
/*  VENDOR SEED                                                       */
/* ================================================================== */

export function buildVendorSeed() {
  return [
    {
      id: 'V-0001', name: 'Tata Steel', registrationDate: '2018-04-12',
      category: 'Steel & Metals', city: 'Jamshedpur', state: 'Jharkhand',
      email: 'procurement@tatasteel.com', phone: '+91-657-2431051',
      website: 'https://www.tatasteel.com', gstin: '20AAACT2728Q1ZX',
      address: 'PO Sakchi, Jamshedpur 831001, Jharkhand',
      notes: 'Strategic supplier for structural and flat steel products.',
      status: VENDOR_STATUS.APPROVED, rating: 4.3,
      paymentTerms: '30 Days', currency: 'INR', leadTimeDays: 14,
      onTimeDelivery: 92, orders: 34, spend: 18500000,
      latitude: 22.8046, longitude: 86.2029,
      formattedAddress: 'PO Sakchi, Jamshedpur, Jharkhand 831001',
      googleMapsUrl: 'https://maps.google.com/?q=22.8046,86.2029',
      recordState: VENDOR_RECORD_STATE.ACTIVE,
      attachments: [], comments: [],
      createdAt: '2018-04-12T09:00:00Z',
      activity: [{ type: 'create', label: 'Vendor registered', actor: 'System', timestamp: '2018-04-12T09:00:00Z' }]
    },
    {
      id: 'V-0002', name: 'JSW Steel', registrationDate: '2019-07-20',
      category: 'Steel & Metals', city: 'Bellary', state: 'Karnataka',
      email: 'sales@jswsteel.in', phone: '+91-8392-246800',
      website: 'https://www.jswsteel.in', gstin: '29AAACJ1234M1Z6',
      address: 'Vijayanagar Works, Bellary 583275, Karnataka',
      notes: 'Cold-rolled and galvanised product specialist.',
      status: VENDOR_STATUS.APPROVED, rating: 4.1,
      paymentTerms: '30 Days', currency: 'INR', leadTimeDays: 12,
      onTimeDelivery: 88, orders: 22, spend: 12300000,
      latitude: 15.1366, longitude: 76.9164,
      formattedAddress: 'Vijayanagar Works, Bellary, Karnataka 583275',
      googleMapsUrl: 'https://maps.google.com/?q=15.1366,76.9164',
      recordState: VENDOR_RECORD_STATE.ACTIVE,
      attachments: [], comments: [],
      createdAt: '2019-07-20T09:00:00Z',
      activity: [{ type: 'create', label: 'Vendor registered', actor: 'System', timestamp: '2019-07-20T09:00:00Z' }]
    },
    {
      id: 'V-0003', name: 'Siemens India', registrationDate: '2017-01-15',
      category: 'Electrical & Automation', city: 'Mumbai', state: 'Maharashtra',
      email: 'industrial@siemens.co.in', phone: '+91-22-39760000',
      website: 'https://www.siemens.co.in', gstin: '27AABCS1234A1Z8',
      address: 'Plot No. A-37, MIDC, Andheri East, Mumbai 400093',
      notes: 'OEM for VFDs, PLCs and industrial automation components.',
      status: VENDOR_STATUS.APPROVED, rating: 4.5,
      paymentTerms: '45 Days', currency: 'INR', leadTimeDays: 21,
      onTimeDelivery: 95, orders: 18, spend: 8900000,
      latitude: 19.1197, longitude: 72.8841,
      formattedAddress: 'MIDC Andheri East, Mumbai, Maharashtra 400093',
      googleMapsUrl: 'https://maps.google.com/?q=19.1197,72.8841',
      recordState: VENDOR_RECORD_STATE.ACTIVE,
      attachments: [], comments: [],
      createdAt: '2017-01-15T09:00:00Z',
      activity: [{ type: 'create', label: 'Vendor registered', actor: 'System', timestamp: '2017-01-15T09:00:00Z' }]
    },
    {
      id: 'V-0004', name: 'Bharat Forge', registrationDate: '2018-09-05',
      category: 'Forgings & Castings', city: 'Pune', state: 'Maharashtra',
      email: 'orders@bharatforge.com', phone: '+91-20-67044000',
      website: 'https://www.bharatforge.com', gstin: '27AABCB5678N1Z3',
      address: 'Mundhwa, Pune 411036, Maharashtra',
      notes: 'Critical forging supplier for pipeline and automotive components.',
      status: VENDOR_STATUS.APPROVED, rating: 4.0,
      paymentTerms: '30 Days', currency: 'INR', leadTimeDays: 18,
      onTimeDelivery: 85, orders: 15, spend: 6700000,
      latitude: 18.5679, longitude: 73.9143,
      formattedAddress: 'Mundhwa, Pune, Maharashtra 411036',
      googleMapsUrl: 'https://maps.google.com/?q=18.5679,73.9143',
      recordState: VENDOR_RECORD_STATE.ACTIVE,
      attachments: [], comments: [],
      createdAt: '2018-09-05T09:00:00Z',
      activity: [{ type: 'create', label: 'Vendor registered', actor: 'System', timestamp: '2018-09-05T09:00:00Z' }]
    },
    {
      id: 'V-0005', name: 'Havells India', registrationDate: '2019-02-28',
      category: 'Electrical & Automation', city: 'Noida', state: 'Uttar Pradesh',
      email: 'corporate@havells.com', phone: '+91-120-4685000',
      website: 'https://www.havells.com', gstin: '09AABCH3456P1Z1',
      address: 'Havells House, L-1, Sector B, Knowledge Park-I, Noida 201301',
      notes: 'Electrical switchgear and lighting supplier.',
      status: VENDOR_STATUS.APPROVED, rating: 4.2,
      paymentTerms: '30 Days', currency: 'INR', leadTimeDays: 10,
      onTimeDelivery: 91, orders: 28, spend: 4200000,
      latitude: 28.4595, longitude: 77.0266,
      formattedAddress: 'Knowledge Park-I, Noida, Uttar Pradesh 201301',
      googleMapsUrl: 'https://maps.google.com/?q=28.4595,77.0266',
      recordState: VENDOR_RECORD_STATE.ACTIVE,
      attachments: [], comments: [],
      createdAt: '2019-02-28T09:00:00Z',
      activity: [{ type: 'create', label: 'Vendor registered', actor: 'System', timestamp: '2019-02-28T09:00:00Z' }]
    },
    {
      id: 'V-0006', name: 'Bosch India', registrationDate: '2018-06-10',
      category: 'Auto Components', city: 'Bangalore', state: 'Karnataka',
      email: 'supply@bosch.co.in', phone: '+91-80-67512200',
      website: 'https://www.bosch.co.in', gstin: '29AABCB7890Q1Z5',
      address: '7/10, Adugodi, Hosur Road, Bangalore 560030',
      notes: 'PPE, automotive spares and industrial components.',
      status: VENDOR_STATUS.APPROVED, rating: 4.4,
      paymentTerms: '15 Days', currency: 'INR', leadTimeDays: 7,
      onTimeDelivery: 94, orders: 12, spend: 3100000,
      latitude: 12.9170, longitude: 77.6228,
      formattedAddress: 'Hosur Road, Adugodi, Bangalore 560030',
      googleMapsUrl: 'https://maps.google.com/?q=12.9170,77.6228',
      recordState: VENDOR_RECORD_STATE.ACTIVE,
      attachments: [], comments: [],
      createdAt: '2018-06-10T09:00:00Z',
      activity: [{ type: 'create', label: 'Vendor registered', actor: 'System', timestamp: '2018-06-10T09:00:00Z' }]
    },
    {
      id: 'V-0007', name: 'Godrej Consumer', registrationDate: '2020-03-18',
      category: 'FMCG Supplies', city: 'Mumbai', state: 'Maharashtra',
      email: 'trade@godrejcp.com', phone: '+91-22-61885000',
      website: 'https://www.godrejconsumer.com', gstin: '27AABCG4567R1Z2',
      address: 'Pirojshanagar, Vikhroli West, Mumbai 400079',
      notes: 'Instruments, FMCG supplies and calibration equipment.',
      status: VENDOR_STATUS.APPROVED, rating: 3.9,
      paymentTerms: '15 Days', currency: 'INR', leadTimeDays: 10,
      onTimeDelivery: 90, orders: 8, spend: 1800000,
      latitude: 19.1356, longitude: 72.9153,
      formattedAddress: 'Vikhroli West, Mumbai, Maharashtra 400079',
      googleMapsUrl: 'https://maps.google.com/?q=19.1356,72.9153',
      recordState: VENDOR_RECORD_STATE.ACTIVE,
      attachments: [], comments: [],
      createdAt: '2020-03-18T09:00:00Z',
      activity: [{ type: 'create', label: 'Vendor registered', actor: 'System', timestamp: '2020-03-18T09:00:00Z' }]
    },
    {
      id: 'V-0008', name: 'Crompton Greaves', registrationDate: '2019-11-08',
      category: 'Electrical & Automation', city: 'Mumbai', state: 'Maharashtra',
      email: 'info@crompton.co.in', phone: '+91-22-22810600',
      website: 'https://www.crompton.co.in', gstin: '27AABCC7890S1Z4',
      address: 'Mumbai Samachar Marg, Fort, Mumbai 400001',
      notes: 'Motors, pumps and electrical distribution equipment.',
      status: VENDOR_STATUS.APPROVED, rating: 3.8,
      paymentTerms: '30 Days', currency: 'INR', leadTimeDays: 14,
      onTimeDelivery: 82, orders: 10, spend: 2500000,
      latitude: 18.9343, longitude: 72.8354,
      formattedAddress: 'Fort, Mumbai, Maharashtra 400001',
      googleMapsUrl: 'https://maps.google.com/?q=18.9343,72.8354',
      recordState: VENDOR_RECORD_STATE.ACTIVE,
      attachments: [], comments: [],
      createdAt: '2019-11-08T09:00:00Z',
      activity: [{ type: 'create', label: 'Vendor registered', actor: 'System', timestamp: '2019-11-08T09:00:00Z' }]
    },
    {
      id: 'V-0009', name: 'Dell Technologies', registrationDate: '2018-08-22',
      category: 'IT & Office Equipment', city: 'Bangalore', state: 'Karnataka',
      email: 'enterprise@dell.com', phone: '+91-80-47184000',
      website: 'https://www.dell.com', gstin: '29AABCD1234T1Z7',
      address: 'Bagmane Tech Park, CV Raman Nagar, Bangalore 560093',
      notes: 'IT hardware, servers and enterprise storage solutions.',
      status: VENDOR_STATUS.APPROVED, rating: 4.6,
      paymentTerms: '7 Days', currency: 'INR', leadTimeDays: 5,
      onTimeDelivery: 97, orders: 14, spend: 5600000,
      latitude: 12.9789, longitude: 77.6608,
      formattedAddress: 'CV Raman Nagar, Bangalore, Karnataka 560093',
      googleMapsUrl: 'https://maps.google.com/?q=12.9789,77.6608',
      recordState: VENDOR_RECORD_STATE.ACTIVE,
      attachments: [], comments: [],
      createdAt: '2018-08-22T09:00:00Z',
      activity: [{ type: 'create', label: 'Vendor registered', actor: 'System', timestamp: '2018-08-22T09:00:00Z' }]
    },
    {
      id: 'V-0010', name: 'L&T', registrationDate: '2017-05-30',
      category: 'Engineering & Construction', city: 'Mumbai', state: 'Maharashtra',
      email: 'projects@larsentoubro.com', phone: '+91-22-67525656',
      website: 'https://www.larsentoubro.com', gstin: '27AABCL5678U1Z9',
      address: 'L&T House, N.M. Marg, Ballard Estate, Mumbai 400001',
      notes: 'Heavy engineering, construction and project execution.',
      status: VENDOR_STATUS.APPROVED, rating: 4.2,
      paymentTerms: '45 Days', currency: 'INR', leadTimeDays: 21,
      onTimeDelivery: 87, orders: 6, spend: 9200000,
      latitude: 18.9279, longitude: 72.8391,
      formattedAddress: 'Ballard Estate, Mumbai, Maharashtra 400001',
      googleMapsUrl: 'https://maps.google.com/?q=18.9279,72.8391',
      recordState: VENDOR_RECORD_STATE.ACTIVE,
      attachments: [], comments: [],
      createdAt: '2017-05-30T09:00:00Z',
      activity: [{ type: 'create', label: 'Vendor registered', actor: 'System', timestamp: '2017-05-30T09:00:00Z' }]
    }
  ];
}

/* ================================================================== */
/*  PR SEED                                                           */
/* ================================================================== */

function baseActivity(date, requester, options = {}) {
  const acts = [
    { type: 'create', label: 'Requisition created', actor: requester, timestamp: `${date}T09:45:00Z` }
  ];
  if (options.submitted) {
    acts.push({ type: 'submit', label: 'Submitted for approval', actor: requester, timestamp: `${date}T12:30:00Z` });
  }
  if (options.approved) {
    acts.push({
      type: 'approve',
      label: 'Approved by ' + (options.approver || 'Sanjay Kumar'),
      actor: options.approver || 'Sanjay Kumar',
      timestamp: options.approvalDate || `${date}T14:10:00Z`
    });
  }
  if (options.rejected) {
    acts.push({
      type: 'reject',
      label: 'Rejected by ' + (options.approver || 'Meera Joshi'),
      actor: options.approver || 'Meera Joshi',
      timestamp: options.approvalDate || `${date}T15:20:00Z`
    });
  }
  if (options.returned) {
    acts.push({
      type: 'return',
      label: 'Returned to requester by ' + (options.approver || 'Meera Joshi'),
      actor: options.approver || 'Meera Joshi',
      timestamp: options.returnDate || `${date}T15:20:00Z`,
      note: options.returnNote || 'Please review and resubmit.'
    });
  }
  if (options.review) {
    acts.push({
      type: 'review',
      label: 'Technical review completed',
      actor: options.reviewer || 'Sanjay Kumar',
      timestamp: options.reviewDate || `${date}T16:00:00Z`,
      note: options.reviewNote || ''
    });
  }
  if (options.po) {
    acts.push({
      type: 'po',
      label: 'Purchase Order raised',
      actor: 'Kavita Rao',
      timestamp: options.poDate || `${date}T16:00:00Z`
    });
  }
  if (options.rfq) {
    acts.push({
      type: 'rfq',
      label: 'RFQ ' + (options.rfqNo || 'RFQ-2026-XXXX') + ' created',
      actor: options.rfqActor || 'Kavita Rao',
      timestamp: options.rfqDate || `${date}T16:00:00Z`
    });
  }
  return acts;
}

export function buildRequisitionSeed() {
  return [
    {
      id: 'PR-0045', prNo: 'PR-2026-0045',
      title: 'Hot rolled steel sheets for chassis line',
      department: 'Production', project: 'Unit 2 Expansion', requester: 'Rahul Sharma',
      buyer: 'Kavita Rao', vendor: 'Tata Steel', currency: 'INR', priority: 'High',
      terms: '30 Days', gstType: 'Inter-State (IGST)',
      company: 'ABC Manufacturing Pvt Ltd', branch: 'Pune Branch',
      expectedDate: '2026-08-20', date: '2026-08-04', createdAt: '2026-08-04T09:30:00Z',
      status: PR_STATUS.DRAFT, approvalStatus: APPROVAL_STATUS.PENDING,
      discount: 2, charges: 0,
      notes: 'Material required before the second shift line changeover.',
      internalNotes: 'Verify certified mill test certificate at goods receipt.',
      comments: [{ id: 'cmt-4501', author: 'Rahul Sharma', text: 'Awaiting updated vendor quotation for the 3mm HR coil.', createdAt: '2026-08-04T11:00:00Z' }],
      attachments: [],
      items: [
        { itemCode: 'HR-3MM', product: 'Hot rolled steel sheet 3mm (IS 2062 E250)', category: 'Raw Material', hsn: '7208', uom: 'Kg', qty: 8000, rate: 24.5, discount: '', gstRate: 18, remarks: 'Mill edge acceptable' },
        { itemCode: 'MS-6MM', product: 'MS plate 6mm', category: 'Raw Material', hsn: '7208', uom: 'Kg', qty: 1200, rate: 28, discount: '', gstRate: 18, remarks: '' }
      ],
      activity: baseActivity('2026-08-04', 'Rahul Sharma')
    },
    {
      id: 'PR-0044', prNo: 'PR-2026-0044',
      title: 'Desktop PCs for accounts team',
      department: 'IT', project: 'IT Infrastructure Upgrade', requester: 'Priya Patel',
      buyer: 'Rahul Sharma', vendor: 'Dell Technologies', currency: 'INR', priority: 'Medium',
      terms: '7 Days', gstType: 'Intra-State (CGST+SGST)',
      company: 'ABC Auto Components Ltd', branch: 'Head Office',
      expectedDate: '2026-08-15', date: '2026-08-03', createdAt: '2026-08-03T10:15:00Z',
      status: PR_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.PENDING,
      discount: 0, charges: 0,
      notes: 'Replace aging desktops in the accounts department.',
      internalNotes: '',
      comments: [],
      attachments: [],
      items: [
        { itemCode: 'PC-DT-01', product: 'Dell OptiPlex 7020 Tower', category: 'IT & Office Equipment', hsn: '8471', uom: 'Nos', qty: 15, rate: 5800, discount: '', gstRate: 18, remarks: 'i7 14th gen, 16GB RAM, 512GB SSD' },
        { itemCode: 'PC-MON-01', product: 'Dell 24 inch monitor', category: 'IT & Office Equipment', hsn: '8528', uom: 'Nos', qty: 15, rate: 1200, discount: '', gstRate: 18, remarks: 'FHD IPS panel' }
      ],
      activity: baseActivity('2026-08-03', 'Priya Patel', { submitted: true })
    },
    {
      id: 'PR-0043', prNo: 'PR-2026-0043',
      title: 'Electrical spares for conveyor motors',
      department: 'Maintenance', project: 'Annual Maintenance', requester: 'Amit Verma',
      buyer: 'Priya Patel', vendor: 'Siemens India', currency: 'INR', priority: 'High',
      terms: '15 Days', gstType: 'Inter-State (IGST)',
      company: 'ABC Manufacturing Pvt Ltd', branch: 'Pune Branch',
      expectedDate: '2026-08-12', date: '2026-08-01', createdAt: '2026-08-01T08:20:00Z',
      status: PR_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.PENDING,
      discount: 0, charges: 0,
      notes: 'Urgent requirement for line 3 conveyor drive replacement.',
      internalNotes: '',
      comments: [],
      attachments: [],
      items: [
        { itemCode: 'VFD-15KW', product: 'VFD drive 15 kW', category: 'Electrical & Automation', hsn: '8504', uom: 'Nos', qty: 2, rate: 14500, discount: '', gstRate: 18, remarks: 'Siemens SINAMICS G120 or equivalent' },
        { itemCode: 'CTR-65A', product: 'Power contactor 65A', category: 'Electrical & Automation', hsn: '8536', uom: 'Nos', qty: 3, rate: 850, discount: '', gstRate: 18, remarks: '3-pole AC-3' }
      ],
      activity: baseActivity('2026-08-01', 'Amit Verma', { submitted: true })
    },
    {
      id: 'PR-0041', prNo: 'PR-2026-0041',
      title: 'PLC modules for automated line',
      department: 'Production', project: 'Automation', requester: 'Aarav Khanna',
      buyer: 'Priya Patel', vendor: 'Siemens India', currency: 'INR', priority: 'Critical',
      terms: '30 Days', gstType: 'Inter-State (IGST)',
      company: 'ABC Manufacturing Pvt Ltd', branch: 'Pune Branch',
      expectedDate: '2026-08-25', date: '2026-07-28', createdAt: '2026-07-28T11:00:00Z',
      status: PR_STATUS.TECHNICAL_REVIEW, approvalStatus: APPROVAL_STATUS.APPROVED,
      discount: 0, charges: 500,
      notes: 'Required for the new automated assembly line commissioning.',
      internalNotes: 'Technical review in progress — verify firmware compatibility.',
      comments: [{ id: 'cmt-4101', author: 'Aarav Khanna', text: 'Need Siemens S7-1500 series, not S7-1200.', createdAt: '2026-07-29T10:30:00Z' }],
      attachments: [],
      items: [
        { itemCode: 'PLC-CPU', product: 'Siemens S7-1500 CPU 1515-2 PN', category: 'Electrical & Automation', hsn: '8537', uom: 'Nos', qty: 1, rate: 285000, discount: '', gstRate: 18, remarks: 'Firmware V2.9.4' },
        { itemCode: 'PLC-IO', product: 'SM 321 DI 32x24VDC', category: 'Electrical & Automation', hsn: '8537', uom: 'Nos', qty: 4, rate: 12800, discount: '', gstRate: 18, remarks: 'Digital input module' },
        { itemCode: 'PLC-PROG', product: 'TIA Portal V18 license', category: 'Electrical & Automation', hsn: '8523', uom: 'Pack', qty: 1, rate: 65000, discount: '', gstRate: 18, remarks: 'Professional floating license' }
      ],
      activity: [
        ...baseActivity('2026-07-28', 'Aarav Khanna', { submitted: true, approved: true, approver: 'Sanjay Kumar', approvalDate: '2026-07-29T14:00:00Z' }),
        { type: 'review', label: 'Technical review started', actor: 'Sanjay Kumar', timestamp: '2026-07-30T09:00:00Z', note: 'Checking firmware compatibility with existing S7-1500 PLCs.' }
      ]
    },
    {
      id: 'PR-0039', prNo: 'PR-2026-0039',
      title: 'Forged flanges for pipeline project',
      department: 'Projects', project: 'New Plant Setup', requester: 'Vikram Singh',
      buyer: 'Kavita Rao', vendor: 'L&T', currency: 'INR', priority: 'High',
      terms: '30 Days', gstType: 'Inter-State (IGST)',
      company: 'ABC Manufacturing Pvt Ltd', branch: 'Pune Branch',
      expectedDate: '2026-08-10', date: '2026-07-22', createdAt: '2026-07-22T09:00:00Z',
      status: PR_STATUS.READY_FOR_RFQ, approvalStatus: APPROVAL_STATUS.APPROVED,
      discount: 2, charges: 750,
      notes: 'Per approved drawing F-2271 rev C.',
      internalNotes: '',
      comments: [],
      attachments: [],
      items: [
        { itemCode: 'FL-DN150', product: 'Forged flange DN150', category: 'Forgings & Castings', hsn: '7307', uom: 'Nos', qty: 40, rate: 1850, discount: '', gstRate: 18, remarks: 'PN16, RF, IS 2062' },
        { itemCode: 'FL-DN100', product: 'Forged flange DN100', category: 'Forgings & Castings', hsn: '7307', uom: 'Nos', qty: 30, rate: 1250, discount: '', gstRate: 18, remarks: 'PN16, RF, IS 2062' }
      ],
      activity: baseActivity('2026-07-22', 'Vikram Singh', { submitted: true, approved: true, approver: 'Sanjay Kumar', approvalDate: '2026-07-23T10:00:00Z', review: true, reviewer: 'Sanjay Kumar', reviewDate: '2026-07-24T14:00:00Z', reviewNote: 'Approved per drawing F-2271 rev C.' })
    },
    {
      id: 'PR-0038', prNo: 'PR-2026-0038',
      title: 'LED lighting for stores block',
      department: 'Stores', project: 'Annual Maintenance', requester: 'Kavita Rao',
      buyer: 'Amit Verma', vendor: 'Havells India', currency: 'INR', priority: 'Medium',
      terms: '30 Days', gstType: 'Intra-State (CGST+SGST)',
      company: 'ABC Auto Components Ltd', branch: 'Pune Branch',
      expectedDate: '2026-08-25', date: '2026-07-20', createdAt: '2026-07-20T10:00:00Z',
      status: PR_STATUS.READY_FOR_RFQ, approvalStatus: APPROVAL_STATUS.APPROVED,
      discount: 3, charges: 0,
      notes: 'Replace sodium vapor lamps with LED fixtures.',
      internalNotes: '',
      comments: [],
      attachments: [],
      items: [
        { itemCode: 'LED-BH-20', product: 'LED bulkhead 20W', category: 'Electrical & Automation', hsn: '9405', uom: 'Nos', qty: 60, rate: 420, discount: '', gstRate: 18, remarks: 'IP65, 6500K daylight' },
        { itemCode: 'LED-HB-200', product: 'LED high bay 200W', category: 'Electrical & Automation', hsn: '9405', uom: 'Nos', qty: 25, rate: 1550, discount: '', gstRate: 18, remarks: 'IP65, 6500K, pendant mount' }
      ],
      activity: baseActivity('2026-07-20', 'Kavita Rao', { submitted: true, approved: true, approver: 'Sanjay Kumar', approvalDate: '2026-07-21T11:00:00Z', review: true, reviewer: 'Sanjay Kumar', reviewDate: '2026-07-22T14:00:00Z', reviewNote: 'Technical specs verified.' })
    },
    {
      id: 'PR-0037', prNo: 'PR-2026-0037',
      title: 'Calibration gauges for QC lab',
      department: 'Quality', project: 'Compliance & Safety', requester: 'Sneha Iyer',
      buyer: 'Arjun Mehta', vendor: 'Godrej Consumer', currency: 'INR', priority: 'Medium',
      terms: '15 Days', gstType: 'Intra-State (CGST+SGST)',
      company: 'ABC Manufacturing Pvt Ltd', branch: 'Pune Branch',
      expectedDate: '2026-09-01', date: '2026-07-18', createdAt: '2026-07-18T09:30:00Z',
      status: PR_STATUS.READY_FOR_RFQ, approvalStatus: APPROVAL_STATUS.APPROVED,
      discount: 0, charges: 0,
      notes: 'NABL calibration certificates required for all instruments.',
      internalNotes: '',
      comments: [],
      attachments: [],
      items: [
        { itemCode: 'CAL-CAL-01', product: 'Digital caliper 150mm', category: 'Instruments & Calibration', hsn: '9017', uom: 'Nos', qty: 4, rate: 3200, discount: '', gstRate: 18, remarks: '0.01mm resolution, NABL cert' },
        { itemCode: 'CAL-HT-01', product: 'Hardness tester kit', category: 'Instruments & Calibration', hsn: '9024', uom: 'Nos', qty: 1, rate: 5200, discount: '', gstRate: 18, remarks: 'Rockwell B/C scale' }
      ],
      activity: baseActivity('2026-07-18', 'Sneha Iyer', { submitted: true, approved: true, approver: 'Sanjay Kumar', approvalDate: '2026-07-19T14:00:00Z', review: true, reviewer: 'Sanjay Kumar', reviewDate: '2026-07-20T11:00:00Z', reviewNote: 'NABL compliance confirmed.' })
    },
    {
      id: 'PR-0040', prNo: 'PR-2026-0040',
      title: 'CRCA coils for stamping line',
      department: 'Production', project: 'Unit 2 Expansion', requester: 'Arjun Mehta',
      buyer: 'Kavita Rao', vendor: 'JSW Steel', currency: 'INR', priority: 'High',
      terms: '30 Days', gstType: 'Inter-State (IGST)',
      company: 'ABC Manufacturing Pvt Ltd', branch: 'Pune Branch',
      expectedDate: '2026-08-15', date: '2026-07-15', createdAt: '2026-07-15T10:00:00Z',
      status: PR_STATUS.CONVERTED, approvalStatus: APPROVAL_STATUS.APPROVED,
      discount: 1, charges: 500,
      notes: 'CRCA grade for sheet metal stamping. Converted to RFQ-2026-0008.',
      internalNotes: '',
      comments: [],
      attachments: [],
      items: [
        { itemCode: 'CRCA-12', product: 'CRCA coil 1.2mm', category: 'Raw Material', hsn: '7209', uom: 'Kg', qty: 15000, rate: 18, discount: '', gstRate: 18, remarks: 'Full hard, un-annealed' },
        { itemCode: 'CRCA-08', product: 'CRCA sheet 0.8mm', category: 'Raw Material', hsn: '7209', uom: 'Kg', qty: 5000, rate: 20, discount: '', gstRate: 18, remarks: 'For body panels' }
      ],
      activity: [
        ...baseActivity('2026-07-15', 'Arjun Mehta', { submitted: true, approved: true, approver: 'Sanjay Kumar', approvalDate: '2026-07-16T10:00:00Z', review: true, reviewer: 'Sanjay Kumar', reviewDate: '2026-07-17T14:00:00Z', reviewNote: 'Approved.' }),
        { type: 'rfq', label: 'RFQ RFQ-2026-0008 created', actor: 'Kavita Rao', timestamp: '2026-07-25T10:00:00Z' }
      ]
    },
    {
      id: 'PR-0034', prNo: 'PR-2026-0034',
      title: 'Welding consumables for production',
      department: 'Production', project: 'General Operations', requester: 'Sanjay Kumar',
      buyer: 'Arjun Mehta', vendor: 'Bharat Forge', currency: 'INR', priority: 'Low',
      terms: '15 Days', gstType: 'Inter-State (IGST)',
      company: 'ABC Manufacturing Pvt Ltd', branch: 'Pune Branch',
      expectedDate: '2026-08-05', date: '2026-07-10', createdAt: '2026-07-10T08:00:00Z',
      status: PR_STATUS.PO_RAISED, approvalStatus: APPROVAL_STATUS.APPROVED,
      discount: 0, charges: 0,
      notes: 'Monthly replenishment of welding rods and wire.',
      internalNotes: '',
      comments: [],
      attachments: [],
      items: [
        { itemCode: 'WLD-ER70', product: 'ER70S-6 welding wire 1.2mm', category: 'Consumables', hsn: '7217', uom: 'Kg', qty: 200, rate: 85, discount: '', gstRate: 18, remarks: 'CO2 shielding' },
        { itemCode: 'WLD-E6013', product: 'E6013 welding electrode 3.15mm', category: 'Consumables', hsn: '7217', uom: 'Kg', qty: 150, rate: 65, discount: '', gstRate: 18, remarks: 'Rutile coating' }
      ],
      activity: [
        ...baseActivity('2026-07-10', 'Sanjay Kumar', { submitted: true, approved: true, approver: 'Meera Joshi', approvalDate: '2026-07-11T10:00:00Z' }),
        { type: 'po', label: 'Purchase Order PO-2026-0335 raised', actor: 'Kavita Rao', timestamp: '2026-07-12T09:00:00Z' }
      ]
    },
    {
      id: 'PR-0036', prNo: 'PR-2026-0036',
      title: 'Civil materials for plant expansion',
      department: 'Projects', project: 'New Plant Setup', requester: 'Rohan Desai',
      buyer: 'Kavita Rao', vendor: 'L&T', currency: 'INR', priority: 'Medium',
      terms: '30 Days', gstType: 'Inter-State (IGST)',
      company: 'ABC Manufacturing Pvt Ltd', branch: 'Pune Branch',
      expectedDate: '2026-08-30', date: '2026-07-08', createdAt: '2026-07-08T10:30:00Z',
      status: PR_STATUS.RETURNED, approvalStatus: APPROVAL_STATUS.PENDING,
      discount: 0, charges: 0,
      notes: 'Returned for revision — please update quantities per revised drawing.',
      internalNotes: '',
      comments: [{ id: 'cmt-3601', author: 'Meera Joshi', text: 'Returned — quantities do not match the revised civil drawing DR-2026-045.', createdAt: '2026-07-09T15:20:00Z' }],
      attachments: [],
      items: [
        { itemCode: 'CVL-OPC', product: 'OPC 43 cement', category: 'Consumables', hsn: '2523', uom: 'Ton', qty: 50, rate: 380, discount: '', gstRate: 28, remarks: 'For foundation work' },
        { itemCode: 'CVL-TMT', product: 'TMT bar 16mm', category: 'Raw Material', hsn: '7214', uom: 'Ton', qty: 12, rate: 52000, discount: '', gstRate: 18, remarks: 'Fe 500D grade' }
      ],
      activity: [
        ...baseActivity('2026-07-08', 'Rohan Desai', { submitted: true }),
        { type: 'return', label: 'Returned to requester by Meera Joshi', actor: 'Meera Joshi', timestamp: '2026-07-09T15:20:00Z', note: 'Quantities do not match the revised civil drawing DR-2026-045.' }
      ]
    },
    {
      id: 'PR-0035', prNo: 'PR-2026-0035',
      title: 'Armoured cables for new panel',
      department: 'Maintenance', project: 'Factory Upgrade', requester: 'Neha Gupta',
      buyer: 'Amit Verma', vendor: 'Havells India', currency: 'INR', priority: 'Low',
      terms: '30 Days', gstType: 'Inter-State (IGST)',
      company: 'ABC Manufacturing Pvt Ltd', branch: 'Pune Branch',
      expectedDate: '2026-08-20', date: '2026-07-05', createdAt: '2026-07-05T09:00:00Z',
      status: PR_STATUS.REJECTED, approvalStatus: APPROVAL_STATUS.REJECTED,
      discount: 0, charges: 0,
      notes: 'Rejected — existing cable inventory is sufficient for the planned upgrade.',
      internalNotes: '',
      comments: [{ id: 'cmt-3501', author: 'Meera Joshi', text: 'Rejected — stores has 500m of 3C×2.5sq mm in stock. Reuse existing.', createdAt: '2026-07-06T15:20:00Z' }],
      attachments: [],
      items: [
        { itemCode: 'CBL-3C25', product: 'FR-LSH armoured cable 3C×2.5 sq mm', category: 'Electrical & Automation', hsn: '8544', uom: 'Meter', qty: 500, rate: 42, discount: '', gstRate: 18, remarks: 'IS 1554 PVC insulated' },
        { itemCode: 'CBL-3C10', product: 'FR-LSH armoured cable 3C×10 sq mm', category: 'Electrical & Automation', hsn: '8544', uom: 'Meter', qty: 200, rate: 120, discount: '', gstRate: 18, remarks: 'IS 1554 PVC insulated' }
      ],
      activity: [
        ...baseActivity('2026-07-05', 'Neha Gupta', { submitted: true }),
        { type: 'reject', label: 'Rejected by Meera Joshi', actor: 'Meera Joshi', timestamp: '2026-07-06T15:20:00Z', note: 'Stores has 500m of 3C x 2.5sq mm in stock. Reuse existing.' }
      ]
    },
    {
      id: 'PR-0042', prNo: 'PR-2026-0042',
      title: 'Hydraulic hoses for press shop',
      department: 'Maintenance', project: 'General Operations', requester: 'Rohan Desai',
      buyer: 'Amit Verma', vendor: 'Bosch India', currency: 'INR', priority: 'High',
      terms: '15 Days', gstType: 'Intra-State (CGST+SGST)',
      company: 'ABC Manufacturing Pvt Ltd', branch: 'Pune Branch',
      expectedDate: '2026-08-20', date: '2026-07-12', createdAt: '2026-07-12T08:30:00Z',
      status: PR_STATUS.CONVERTED, approvalStatus: APPROVAL_STATUS.APPROVED,
      discount: 0, charges: 0,
      notes: '6000 psi hydraulic hoses for the 800T press. Converted to RFQ-2026-0001.',
      internalNotes: '',
      comments: [],
      attachments: [],
      items: [
        { itemCode: 'HYD-HSE-DN19', product: 'Hydraulic hose DN19', category: 'Auto Components', hsn: '4009', uom: 'Meter', qty: 200, rate: 285, discount: '', gstRate: 18, remarks: 'EN 853 2SN DN19' },
        { itemCode: 'HYD-QC-G12', product: 'Quick coupling G1/2', category: 'Auto Components', hsn: '7307', uom: 'Nos', qty: 40, rate: 430, discount: '', gstRate: 18, remarks: 'ISO 7241-1 B series' }
      ],
      activity: [
        ...baseActivity('2026-07-12', 'Rohan Desai', { submitted: true, approved: true, approver: 'Sanjay Kumar', approvalDate: '2026-07-13T14:00:00Z' }),
        { type: 'rfq', label: 'RFQ RFQ-2026-0001 created', actor: 'Amit Verma', timestamp: '2026-07-14T10:00:00Z' }
      ]
    }
  ];
}

/* ================================================================== */
/*  RFQ SEED                                                          */
/* ================================================================== */

const DEFAULT_COMMERCIAL_TERMS = {
  paymentTerms: '30 Days',
  deliveryTerms: '30 Days',
  warranty: '12 Months',
  taxRate: 18,
  freight: 'Included in Price',
  insurance: 'Buyer Arranges'
};

export function buildRfqSeed() {
  return [
    {
      id: 'RFQ-2026-0008', rfqNo: 'RFQ-2026-0008',
      title: 'CRCA coils for stamping line',
      description: 'CRCA grade coils for the sheet metal stamping line at Unit 2. Vendors must quote full-hard un-annealed CRCA coils per IS 513.',
      reference: 'PR-2026-0040', category: 'Steel & Metals',
      department: 'Production', project: 'Unit 2 Expansion', requester: 'Kavita Rao', buyer: 'Amit Verma',
      priority: 'High', validity: 30,
      vendors: ['Tata Steel', 'JSW Steel', 'Bharat Forge'],
      vendorCount: 3, dueDate: '2026-08-06', status: RFQ_STATUS.SENT,
      currency: 'INR', createdAt: '2026-07-25T10:00:00Z', sentAt: '2026-07-26T09:00:00Z',
      commercialTerms: { ...DEFAULT_COMMERCIAL_TERMS, paymentTerms: '30 Days' },
      notes: 'Fast-track procurement. Delivery before line changeover.',
      attachments: [],
      items: [
        { product: 'CRCA coil 1.2mm', hsn: '7209', uom: 'Kg', qty: 15000, rate: 18, requiredDate: '2026-08-15', specification: 'Full hard, un-annealed', expectedRate: 18 },
        { product: 'CRCA sheet 0.8mm', hsn: '7209', uom: 'Kg', qty: 5000, rate: 20, requiredDate: '2026-08-15', specification: 'For body panels', expectedRate: 20 }
      ],
      comments: [{ id: 'cm-8001', author: 'Amit Verma', createdAt: '2026-07-26T10:00:00Z', text: 'Confirm freight is included in the landed cost.' }],
      activity: [{ type: 'create', label: 'RFQ-2026-0008 created', actor: 'Kavita Rao', timestamp: '2026-07-25T10:00:00Z' }, { type: 'send', label: 'RFQ sent to 3 vendors', actor: 'Amit Verma', timestamp: '2026-07-26T09:00:00Z' }]
    },
    {
      id: 'RFQ-2026-0007', rfqNo: 'RFQ-2026-0007',
      title: 'VFD drives and contactors',
      description: 'OEM VFD drives and power contactors for the conveyor upgrade. Warranty must be minimum 12 months with on-site commissioning.',
      reference: 'PR-2026-0043', category: 'Electrical & Automation',
      department: 'Maintenance', project: 'Annual Maintenance', requester: 'Amit Verma', buyer: 'Priya Patel',
      priority: 'High', validity: 30,
      vendors: ['Siemens India', 'Havells India'],
      vendorCount: 2, dueDate: '2026-08-01', status: RFQ_STATUS.SENT,
      currency: 'INR', createdAt: '2026-07-29T10:00:00Z', sentAt: '2026-07-30T09:30:00Z',
      commercialTerms: { ...DEFAULT_COMMERCIAL_TERMS, warranty: '18 Months' },
      notes: 'OEM spares, warranty minimum 12 months.',
      attachments: [],
      items: [
        { product: 'VFD drive 15 kW', hsn: '8504', uom: 'Nos', qty: 2, rate: 14500, requiredDate: '2026-08-10', specification: 'Siemens SINAMICS or equivalent', expectedRate: 14500 },
        { product: 'Power contactor 65A', hsn: '8536', uom: 'Nos', qty: 3, rate: 850, requiredDate: '2026-08-10', specification: '3-pole AC-3 65A', expectedRate: 850 }
      ],
      comments: [],
      activity: [{ type: 'create', label: 'RFQ-2026-0007 created', actor: 'Priya Patel', timestamp: '2026-07-29T10:00:00Z' }, { type: 'send', label: 'RFQ sent to 2 vendors', actor: 'Priya Patel', timestamp: '2026-07-30T09:30:00Z' }]
    },
    {
      id: 'RFQ-2026-0003', rfqNo: 'RFQ-2026-0003',
      title: 'SS pipes for pneumatic lines',
      description: 'SS 304 seamless pipes for the pneumatic distribution manifold. Hydro-test certificate required.',
      reference: 'PR-2026-0038', category: 'Steel & Metals',
      department: 'Engineering', project: 'General Operations', requester: 'Arjun Mehta', buyer: 'Priya Patel',
      priority: 'Critical', validity: 30,
      vendors: ['Tata Steel', 'JSW Steel', 'Bharat Forge'],
      vendorCount: 3, dueDate: '2026-07-29', status: RFQ_STATUS.EVALUATION,
      currency: 'INR', createdAt: '2026-07-18T09:30:00Z', sentAt: '2026-07-19T09:00:00Z',
      commercialTerms: { ...DEFAULT_COMMERCIAL_TERMS, deliveryTerms: '15 Days' },
      notes: 'Seamless grade mandatory, hydro-test certificate required.',
      attachments: [],
      items: [
        { product: 'SS 304 seamless pipe 50NB', hsn: '7304', uom: 'Meter', qty: 120, rate: 1150, requiredDate: '2026-08-05', specification: 'SCH 40, ASTM A312', expectedRate: 1150 },
        { product: 'SS 304 seamless pipe 25NB', hsn: '7304', uom: 'Meter', qty: 80, rate: 640, requiredDate: '2026-08-05', specification: 'SCH 40, ASTM A312', expectedRate: 640 }
      ],
      comments: [{ id: 'cm-3001', author: 'Priya Patel', createdAt: '2026-07-22T14:05:00Z', text: 'Tata Steel quote within budget — validate lead time claim.' }],
      activity: [{ type: 'create', label: 'RFQ-2026-0003 created', actor: 'Priya Patel', timestamp: '2026-07-18T09:30:00Z' }, { type: 'send', label: 'RFQ sent to 3 vendors', actor: 'Priya Patel', timestamp: '2026-07-19T09:00:00Z' }]
    },
    {
      id: 'RFQ-2026-0005', rfqNo: 'RFQ-2026-0005',
      title: 'Forged flanges for pipeline project',
      description: 'Forged carbon-steel flanges per approved drawing F-2271 rev C for the compressed-air pipeline.',
      reference: 'PR-2026-0039', category: 'Forgings & Castings',
      department: 'Projects', project: 'New Plant Setup', requester: 'Vikram Singh', buyer: 'Kavita Rao',
      priority: 'High', validity: 30,
      vendors: ['Tata Steel', 'Bharat Forge'],
      vendorCount: 2, dueDate: '2026-07-28', status: RFQ_STATUS.AWARDED,
      currency: 'INR', createdAt: '2026-07-20T10:00:00Z', sentAt: '2026-07-21T10:00:00Z',
      awardedVendor: 'Tata Steel', awardedQuoteId: 'QT-002', awardedValue: 128938.6, awardedAt: '2026-07-26T11:30:00Z',
      commercialTerms: { ...DEFAULT_COMMERCIAL_TERMS },
      notes: 'Approved drawing F-2271 rev C applies.',
      items: [
        { product: 'Forged flange DN150', hsn: '7307', uom: 'Nos', qty: 40, rate: 1850, requiredDate: '2026-07-30', specification: 'PN16, RF, IS 2062', expectedRate: 1850 },
        { product: 'Forged flange DN100', hsn: '7307', uom: 'Nos', qty: 30, rate: 1250, requiredDate: '2026-07-30', specification: 'PN16, RF, IS 2062', expectedRate: 1250 }
      ],
      comments: [],
      activity: [{ type: 'create', label: 'RFQ-2026-0005 created', actor: 'Kavita Rao', timestamp: '2026-07-20T10:00:00Z' }, { type: 'send', label: 'RFQ sent to 2 vendors', actor: 'Kavita Rao', timestamp: '2026-07-21T10:00:00Z' }, { type: 'award', label: 'Awarded to Tata Steel', actor: 'Kavita Rao', timestamp: '2026-07-26T11:30:00Z' }]
    },
    {
      id: 'RFQ-2026-0004', rfqNo: 'RFQ-2026-0004',
      title: 'LED lighting for stores block',
      description: 'LED bulkhead and high-bay luminaires for the stores block electrical upgrade.',
      reference: 'PR-2026-0038', category: 'Electrical & Automation',
      department: 'Stores', project: 'Annual Maintenance', requester: 'Kavita Rao', buyer: 'Amit Verma',
      priority: 'Medium', validity: 30,
      vendors: ['Havells India', 'Crompton Greaves'],
      vendorCount: 2, dueDate: '2026-07-25', status: RFQ_STATUS.CLOSED,
      currency: 'INR', createdAt: '2026-07-19T10:00:00Z',
      commercialTerms: { ...DEFAULT_COMMERCIAL_TERMS, warranty: '18 Months' },
      notes: '',
      items: [
        { product: 'LED bulkhead 20W', hsn: '9405', uom: 'Nos', qty: 60, rate: 420, requiredDate: '2026-07-28', specification: 'IP65, 6500K', expectedRate: 420 },
        { product: 'LED high bay 200W', hsn: '9405', uom: 'Nos', qty: 25, rate: 1550, requiredDate: '2026-07-28', specification: 'IP65, 6500K, pendant', expectedRate: 1550 }
      ],
      comments: [],
      activity: [{ type: 'create', label: 'RFQ-2026-0004 created', actor: 'Amit Verma', timestamp: '2026-07-19T10:00:00Z' }]
    },
    {
      id: 'RFQ-2026-0006', rfqNo: 'RFQ-2026-0006',
      title: 'Calibration instruments for QC lab',
      description: 'Digital calipers and hardness tester kits for the QC laboratory with NABL calibration certificates.',
      reference: 'PR-2026-0037', category: 'Instruments & Calibration',
      department: 'Quality', project: 'Compliance & Safety', requester: 'Sneha Iyer', buyer: 'Arjun Mehta',
      priority: 'Medium', validity: 30,
      vendors: ['Havells India', 'Crompton Greaves'],
      vendorCount: 2, dueDate: '2026-08-10', status: RFQ_STATUS.DRAFT,
      currency: 'INR', createdAt: '2026-07-25T10:00:00Z',
      commercialTerms: { ...DEFAULT_COMMERCIAL_TERMS, warranty: '12 Months' },
      notes: 'NABL calibration certificate mandatory.',
      attachments: [],
      items: [
        { product: 'Digital caliper 150mm', hsn: '9017', uom: 'Nos', qty: 4, rate: 3200, requiredDate: '2026-08-15', specification: '0.01mm resolution, NABL cert', expectedRate: 3200 },
        { product: 'Hardness tester kit', hsn: '9024', uom: 'Nos', qty: 1, rate: 5200, requiredDate: '2026-08-15', specification: 'Rockwell B/C scale', expectedRate: 5200 }
      ],
      comments: [],
      activity: [{ type: 'create', label: 'RFQ-2026-0006 created', actor: 'Sneha Iyer', timestamp: '2026-07-25T10:00:00Z' }]
    },
    {
      id: 'RFQ-2026-0002', rfqNo: 'RFQ-2026-0002',
      title: 'Office furniture for plant admin block',
      description: 'Workstations and seating for the new admin block. Cancelled due to budget realignment.',
      reference: 'PR-2026-0033', category: 'IT & Office Equipment',
      department: 'Admin', project: 'General Operations', requester: 'Meera Joshi', buyer: 'Sanjay Kumar',
      priority: 'Low', validity: 30,
      vendors: ['Godrej Consumer'],
      vendorCount: 1, dueDate: '2026-07-20', status: RFQ_STATUS.CANCELLED,
      currency: 'INR', createdAt: '2026-07-15T10:00:00Z',
      commercialTerms: { ...DEFAULT_COMMERCIAL_TERMS },
      notes: 'Cancelled — scope deferred to next financial year.',
      items: [
        { product: 'Executive workstation', hsn: '9403', uom: 'Nos', qty: 12, rate: 18500, requiredDate: '2026-07-30', specification: '1600x700 laminate', expectedRate: 18500 }
      ],
      attachments: [
        { id: 'rfq-att-0002-1', name: 'Office_Furniture_Spec.pdf', type: 'pdf', size: 302200, uploadedAt: '2026-07-15T11:00:00Z', uploadedBy: 'Meera Joshi' },
        { id: 'rfq-att-0002-2', name: 'Workstation_Drawing_v2.dwg', type: 'dwg', size: 891000, uploadedAt: '2026-07-15T11:05:00Z', uploadedBy: 'Meera Joshi' }
      ],
      comments: [],
      activity: [{ type: 'create', label: 'RFQ-2026-0002 created', actor: 'Sanjay Kumar', timestamp: '2026-07-15T10:00:00Z' }]
    },
    {
      id: 'RFQ-2026-0009', rfqNo: 'RFQ-2026-0009',
      title: 'Wireless mouse for office',
      description: 'Wireless optical mouse for standard office use. Ergonomic design preferred.',
      reference: 'PR-2026-0050', category: 'IT Hardware',
      department: 'IT', project: 'Office Setup', requester: 'Neha Gupta', buyer: 'Kavita Rao',
      priority: 'Medium', validity: 30,
      vendors: ['Tata Steel', 'L&T'],
      vendorCount: 2, dueDate: '2026-09-01', status: RFQ_STATUS.SENT,
      currency: 'INR', createdAt: '2026-08-10T10:00:00Z', sentAt: '2026-08-11T09:00:00Z',
      commercialTerms: { ...DEFAULT_COMMERCIAL_TERMS, paymentTerms: '30 Days' },
      notes: 'Bulk order for office workstation rollout.',
      attachments: [],
      items: [
        { product: 'Wireless mouse', hsn: '8471', uom: 'Nos', qty: 1, rate: 400, requiredDate: '2026-09-15', specification: 'Optical, 2.4GHz wireless', expectedRate: 400 }
      ],
      comments: [],
      activity: [{ type: 'create', label: 'RFQ-2026-0009 created', actor: 'Kavita Rao', timestamp: '2026-08-10T10:00:00Z' }, { type: 'send', label: 'RFQ sent to 2 vendors', actor: 'Kavita Rao', timestamp: '2026-08-11T09:00:00Z' }]
    },
    {
      id: 'RFQ-2026-0001', rfqNo: 'RFQ-2026-0001',
      title: 'Hydraulic hoses and couplings',
      description: 'Hydraulic hose assemblies and quick couplings for the press shop. Currently in internal technical review.',
      reference: 'PR-2026-0042', category: 'Auto Components',
      department: 'Maintenance', project: 'General Operations', requester: 'Rohan Desai', buyer: 'Amit Verma',
      priority: 'High', validity: 30,
      vendors: ['Bosch India', 'Bharat Forge'],
      vendorCount: 2, dueDate: '2026-08-14', status: RFQ_STATUS.PENDING_APPROVAL,
      currency: 'INR', createdAt: '2026-07-14T10:00:00Z',
      commercialTerms: { ...DEFAULT_COMMERCIAL_TERMS, freight: 'Included in Price' },
      notes: '6000 psi working pressure, crimped ends per ISO 12151-1.',
      items: [
        { product: 'Hydraulic hose DN19', hsn: '4009', uom: 'Meter', qty: 200, rate: 285, requiredDate: '2026-08-20', specification: 'EN 853 2SN DN19', expectedRate: 285 },
        { product: 'Quick coupling G1/2', hsn: '7307', uom: 'Nos', qty: 40, rate: 430, requiredDate: '2026-08-20', specification: 'ISO 7241-1 B series', expectedRate: 430 }
      ],
      comments: [],
      activity: [{ type: 'create', label: 'RFQ-2026-0001 created', actor: 'Amit Verma', timestamp: '2026-07-14T10:00:00Z' }]
    }
  ];
}

/* ================================================================== */
/*  QUOTATION SEED                                                    */
/* ================================================================== */

const QUOTE_RATES = {
  'Tata Steel': { factor: 1.0, discount: 2 },
  'JSW Steel': { factor: 0.96, discount: 1.5 },
  'Bharat Forge': { factor: 1.04, discount: 1 },
  'Siemens India': { factor: 1.0, discount: 0 },
  'Havells India': { factor: 0.92, discount: 2.5 },
  'Godrej Consumer': { factor: 0.9, discount: 1 },
  'Crompton Greaves': { factor: 0.94, discount: 1.5 },
  'Bosch India': { factor: 1.05, discount: 1 },
  'L&T': { factor: 0.95, discount: 1.5 }
};

const VENDOR_RATINGS = {
  'Tata Steel': 4.3,
  'JSW Steel': 4.1,
  'Bharat Forge': 4.0,
  'Siemens India': 4.5,
  'Havells India': 4.2,
  'Godrej Consumer': 3.9,
  'Crompton Greaves': 3.8,
  'Bosch India': 4.4,
  'L&T': 4.2
};

function buildQuotationItems(rfqItems, vendorName) {
  const rates = QUOTE_RATES[vendorName] || { factor: 1.0, discount: 0 };
  return rfqItems.map((item) => ({
    ...item,
    rate: Math.round(item.rate * rates.factor * 100) / 100,
    discount: rates.discount
  }));
}

export function buildQuotationSeed() {
  const allQuotations = [];

  /* --- RFQ-2026-0008 (Sent) - all 3 Received --- */
  const rfq008Items = [
    { product: 'CRCA coil 1.2mm', hsn: '7209', uom: 'Kg', qty: 15000, rate: 18, gstRate: 18 },
    { product: 'CRCA sheet 0.8mm', hsn: '7209', uom: 'Kg', qty: 5000, rate: 20, gstRate: 18 }
  ];
  const rfq008Vendors = ['Tata Steel', 'JSW Steel', 'Bharat Forge'];
  rfq008Vendors.forEach((vendor, idx) => {
    const items = buildQuotationItems(rfq008Items, vendor);
    const totals = calcDocumentTotals(items, QUOTE_RATES[vendor].discount, 0, 'Inter-State (IGST)');
    allQuotations.push({
      id: `QT-${String(1 + idx).padStart(3, '0')}`,
      quotationNo: `QT-${String(1 + idx).padStart(3, '0')}`,
      rfqNo: 'RFQ-2026-0008', prNo: 'PR-2026-0040',
      vendor, vendorRating: VENDOR_RATINGS[vendor],
      freight: 'Included', insurance: 'Included',
      submittedOn: '2026-08-02', validUntil: '2026-09-01',
      currency: 'INR', discount: QUOTE_RATES[vendor].discount, charges: 0,
      items, subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxable: totals.taxable,
      gstTotal: totals.gstTotal,
      total: totals.total,
      leadTime: idx === 0 ? '12 Days' : idx === 1 ? '10 Days' : '14 Days',
      delivery: '30 Days', paymentTerms: '30 Days', warranty: '12 Months',
      score: 0, scoreBreakdown: null,
      status: 'Received', notes: '', createdAt: '2026-08-02T10:00:00Z'
    });
  });

  /* --- RFQ-2026-0007 (Sent) - all 2 Received --- */
  const rfq007Items = [
    { product: 'VFD drive 15 kW', hsn: '8504', uom: 'Nos', qty: 2, rate: 14500, gstRate: 18 },
    { product: 'Power contactor 65A', hsn: '8536', uom: 'Nos', qty: 3, rate: 850, gstRate: 18 }
  ];
  const rfq007Vendors = ['Siemens India', 'Havells India'];
  rfq007Vendors.forEach((vendor, idx) => {
    const items = buildQuotationItems(rfq007Items, vendor);
    const totals = calcDocumentTotals(items, QUOTE_RATES[vendor].discount, 0, 'Inter-State (IGST)');
    allQuotations.push({
      id: `QT-${String(4 + idx).padStart(3, '0')}`,
      quotationNo: `QT-${String(4 + idx).padStart(3, '0')}`,
      rfqNo: 'RFQ-2026-0007', prNo: 'PR-2026-0043',
      vendor, vendorRating: VENDOR_RATINGS[vendor],
      freight: 'Prepaid', insurance: 'Included',
      submittedOn: '2026-08-03', validUntil: '2026-09-02',
      currency: 'INR', discount: QUOTE_RATES[vendor].discount, charges: 0,
      items, subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxable: totals.taxable,
      gstTotal: totals.gstTotal,
      total: totals.total,
      leadTime: idx === 0 ? '14 Days' : '10 Days',
      delivery: '30 Days', paymentTerms: '45 Days', warranty: '18 Months',
      score: 0, scoreBreakdown: null,
      status: 'Received', notes: '', createdAt: '2026-08-03T10:00:00Z'
    });
  });

  /* --- RFQ-2026-0003 (Evaluation) - Tata Accepted, JSW/Bharat Rejected --- */
  const rfq003Items = [
    { product: 'SS 304 seamless pipe 50NB', hsn: '7304', uom: 'Meter', qty: 120, rate: 1150, gstRate: 18 },
    { product: 'SS 304 seamless pipe 25NB', hsn: '7304', uom: 'Meter', qty: 80, rate: 640, gstRate: 18 }
  ];
  const rfq003Vendors = [
    { name: 'Tata Steel', status: 'Accepted' },
    { name: 'JSW Steel', status: 'Rejected' },
    { name: 'Bharat Forge', status: 'Rejected' }
  ];
  rfq003Vendors.forEach((v, idx) => {
    const items = buildQuotationItems(rfq003Items, v.name);
    const totals = calcDocumentTotals(items, QUOTE_RATES[v.name].discount, 0, 'Inter-State (IGST)');
    allQuotations.push({
      id: `QT-${String(6 + idx).padStart(3, '0')}`,
      quotationNo: `QT-${String(6 + idx).padStart(3, '0')}`,
      rfqNo: 'RFQ-2026-0003', prNo: 'PR-2026-0038',
      vendor: v.name, vendorRating: VENDOR_RATINGS[v.name],
      freight: 'Included', insurance: 'Included',
      submittedOn: '2026-07-25', validUntil: '2026-08-24',
      currency: 'INR', discount: QUOTE_RATES[v.name].discount, charges: 0,
      items, subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxable: totals.taxable,
      gstTotal: totals.gstTotal,
      total: totals.total,
      leadTime: idx === 0 ? '10 Days' : idx === 1 ? '8 Days' : '12 Days',
      delivery: '15 Days', paymentTerms: '30 Days', warranty: '12 Months',
      score: 0, scoreBreakdown: null,
      status: v.status, notes: '', createdAt: '2026-07-25T10:00:00Z'
    });
  });

  /* --- RFQ-2026-0005 (Awarded) - Tata Accepted, Bharat Rejected --- */
  const rfq005Items = [
    { product: 'Forged flange DN150', hsn: '7307', uom: 'Nos', qty: 40, rate: 1850, gstRate: 18 },
    { product: 'Forged flange DN100', hsn: '7307', uom: 'Nos', qty: 30, rate: 1250, gstRate: 18 }
  ];
  const rfq005Vendors = [
    { name: 'Tata Steel', status: 'Accepted' },
    { name: 'Bharat Forge', status: 'Rejected' }
  ];
  rfq005Vendors.forEach((v, idx) => {
    const items = buildQuotationItems(rfq005Items, v.name);
    const totals = calcDocumentTotals(items, QUOTE_RATES[v.name].discount, 0, 'Inter-State (IGST)');
    allQuotations.push({
      id: `QT-${String(9 + idx).padStart(3, '0')}`,
      quotationNo: `QT-${String(9 + idx).padStart(3, '0')}`,
      rfqNo: 'RFQ-2026-0005', prNo: 'PR-2026-0039',
      vendor: v.name, vendorRating: VENDOR_RATINGS[v.name],
      freight: 'Included', insurance: 'Included',
      submittedOn: '2026-07-25', validUntil: '2026-08-24',
      currency: 'INR', discount: QUOTE_RATES[v.name].discount, charges: 0,
      items, subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxable: totals.taxable,
      gstTotal: totals.gstTotal,
      total: totals.total,
      leadTime: idx === 0 ? '12 Days' : '15 Days',
      delivery: '30 Days', paymentTerms: '30 Days', warranty: '12 Months',
      score: 0, scoreBreakdown: null,
      status: v.status, notes: '', createdAt: '2026-07-25T10:00:00Z'
    });
  });

  /* --- RFQ-2026-0009 (Sent) - 2 Received --- */
  const rfq009Items = [
    { product: 'Wireless mouse', hsn: '8471', uom: 'Nos', qty: 1, rate: 400, gstRate: 18 }
  ];
  const rfq009Vendors = ['Tata Steel', 'L&T'];
  rfq009Vendors.forEach((vendor, idx) => {
    const items = buildQuotationItems(rfq009Items, vendor);
    const totals = calcDocumentTotals(items, QUOTE_RATES[vendor].discount, 0, 'Inter-State (IGST)');
    allQuotations.push({
      id: `QT-${String(12 + idx).padStart(3, '0')}`,
      quotationNo: `QT-${String(12 + idx).padStart(3, '0')}`,
      rfqNo: 'RFQ-2026-0009', prNo: 'PR-2026-0050',
      vendor, vendorRating: VENDOR_RATINGS[vendor],
      freight: 'Prepaid', insurance: 'Included',
      submittedOn: '2026-08-14', validUntil: '2026-09-13',
      currency: 'INR', discount: QUOTE_RATES[vendor].discount, charges: 0,
      items, subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxable: totals.taxable,
      gstTotal: totals.gstTotal,
      total: totals.total,
      leadTime: idx === 0 ? '7 Days' : '5 Days',
      delivery: '15 Days', paymentTerms: '30 Days', warranty: '12 Months',
      score: 0, scoreBreakdown: null,
      status: 'Received', notes: '', createdAt: '2026-08-14T10:00:00Z'
    });
  });

  return allQuotations;
}

/* ================================================================== */
/*  PO SEED                                                           */
/* ================================================================== */

export function buildPurchaseOrderSeed() {
  const pos = [
    {
      poNo: 'PO-2026-0341', title: 'CRCA coils for stamping line',
      vendor: 'JSW Steel', reference: 'PR-2026-0040', prNo: 'PR-2026-0040', rfqNo: 'RFQ-2026-0008',
      orderDate: '2026-07-25', expectedDate: '2026-08-15',
      status: PO_STATUS.APPROVED, approvalStatus: APPROVAL_STATUS.APPROVED,
      terms: '30 Days', discount: 1, charges: 500, notes: 'Fast-track order for critical stock.',
      items: [
        { product: 'CRCA coil 1.2mm', hsn: '7209', uom: 'Kg', qty: 15000, rate: 18, gstRate: 18 },
        { product: 'CRCA sheet 0.8mm', hsn: '7209', uom: 'Kg', qty: 5000, rate: 20, gstRate: 18 }
      ]
    },
    {
      poNo: 'PO-2026-0340', title: 'Hot rolled steel sheets for chassis',
      vendor: 'Tata Steel', reference: 'PR-2026-0041', prNo: 'PR-2026-0041',
      orderDate: '2026-07-30', expectedDate: '2026-08-20',
      status: PO_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.PENDING,
      terms: '30 Days', discount: 2, charges: 0, notes: 'Quarterly slab pricing.',
      items: [
        { product: 'Hot rolled steel sheet 3mm', hsn: '7208', uom: 'Kg', qty: 8000, rate: 24.5, gstRate: 18 },
        { product: 'MS plate 6mm', hsn: '7208', uom: 'Kg', qty: 1200, rate: 28, gstRate: 18 }
      ]
    },
    {
      poNo: 'PO-2026-0339', title: 'Laptop refresh for engineering team',
      vendor: 'Dell Technologies', reference: 'PR-2026-0044', prNo: 'PR-2026-0044',
      orderDate: '2026-07-27', expectedDate: '2026-08-05',
      status: PO_STATUS.COMPLETED, approvalStatus: APPROVAL_STATUS.APPROVED,
      acknowledged: true, acknowledgedAt: '2026-07-28T10:20:00Z', acknowledgedBy: 'Dell Technologies',
      terms: '7 Days', discount: 0, charges: 0, notes: '',
      items: [
        { product: 'Dell Latitude 7450', hsn: '8471', uom: 'Nos', qty: 12, rate: 7200, gstRate: 18 },
        { product: 'Extended battery pack', hsn: '8507', uom: 'Nos', qty: 12, rate: 550, gstRate: 18 }
      ]
    },
    {
      poNo: 'PO-2026-0338', title: 'LED lighting for stores block',
      vendor: 'Havells India', reference: 'PR-2026-0038', prNo: 'PR-2026-0038', rfqNo: 'RFQ-2026-0004',
      orderDate: '2026-07-22', expectedDate: '2026-08-25',
      status: PO_STATUS.PARTIALLY_DELIVERED, approvalStatus: APPROVAL_STATUS.APPROVED,
      terms: '30 Days', discount: 3, charges: 0, notes: '',
      items: [
        { product: 'LED bulkhead 20W', hsn: '9405', uom: 'Nos', qty: 60, rate: 420, gstRate: 18 },
        { product: 'LED high bay 200W', hsn: '9405', uom: 'Nos', qty: 25, rate: 1550, gstRate: 18 }
      ]
    },
    {
      poNo: 'PO-2026-0337', title: 'Forged flanges for pipeline project',
      vendor: 'Tata Steel', reference: 'PR-2026-0039', prNo: 'PR-2026-0039', rfqNo: 'RFQ-2026-0005',
      orderDate: '2026-07-19', expectedDate: '2026-08-10',
      status: PO_STATUS.RELEASED, approvalStatus: APPROVAL_STATUS.APPROVED,
      terms: '30 Days', discount: 2, charges: 750, notes: '',
      items: [
        { product: 'Forged flange DN150', hsn: '7307', uom: 'Nos', qty: 40, rate: 1850, gstRate: 18 },
        { product: 'Forged flange DN100', hsn: '7307', uom: 'Nos', qty: 30, rate: 1250, gstRate: 18 }
      ]
    },
    {
      poNo: 'PO-2026-0336', title: 'Safety footwear and PPE',
      vendor: 'Bosch India', reference: 'PR-2026-0035', prNo: 'PR-2026-0035',
      orderDate: '2026-07-12', expectedDate: '2026-08-18',
      status: PO_STATUS.COMPLETED, approvalStatus: APPROVAL_STATUS.APPROVED,
      acknowledged: true, acknowledgedAt: '2026-07-15T09:10:00Z', acknowledgedBy: 'Bosch India',
      terms: '15 Days', discount: 0, charges: 0, notes: '',
      items: [
        { product: 'Safety shoes (steel toe)', hsn: '6403', uom: 'Pair', qty: 40, rate: 950, gstRate: 12 },
        { product: 'Safety helmet', hsn: '6506', uom: 'Nos', qty: 50, rate: 260, gstRate: 12 }
      ]
    },
    {
      poNo: 'PO-2026-0335', title: 'Network switches for office upgrade',
      vendor: 'Crompton Greaves', reference: 'PR-2026-0034', prNo: 'PR-2026-0034',
      orderDate: '2026-07-08', expectedDate: '2026-08-05',
      status: PO_STATUS.COMPLETED, approvalStatus: APPROVAL_STATUS.APPROVED,
      terms: '15 Days', discount: 0, charges: 0, notes: '',
      items: [
        { product: 'Managed switch 24 port', hsn: '8517', uom: 'Nos', qty: 3, rate: 6200, gstRate: 18 }
      ]
    },
    {
      poNo: 'PO-2026-0334', title: 'Calibration gauges for QC lab',
      vendor: 'Godrej Consumer', reference: 'PR-2026-0037', prNo: 'PR-2026-0037',
      orderDate: '2026-07-01', expectedDate: '2026-09-01',
      status: PO_STATUS.PARTIALLY_DELIVERED, approvalStatus: APPROVAL_STATUS.APPROVED,
      terms: '15 Days', discount: 0, charges: 0, notes: '',
      items: [
        { product: 'Digital caliper 150mm', hsn: '9017', uom: 'Nos', qty: 4, rate: 3200, gstRate: 18 },
        { product: 'Hardness tester kit', hsn: '9024', uom: 'Nos', qty: 1, rate: 5200, gstRate: 18 }
      ]
    }
  ];

  return pos.map((po) => {
    const totals = calcDocumentTotals(po.items, po.discount, po.charges, 'Inter-State (IGST)');
    return {
      id: po.poNo,
      ...po,
      amount: totals.total,
      totals,
      createdAt: `${po.orderDate}T09:30:00Z`,
      activity: [
        { type: 'create', label: `PO ${po.poNo} raised`, actor: 'Kavita Rao', timestamp: `${po.orderDate}T09:30:00Z` },
        ...(po.approvalStatus === APPROVAL_STATUS.APPROVED
          ? [{ type: 'approve', label: 'Approved by Sanjay Kumar', actor: 'Sanjay Kumar', timestamp: `${po.orderDate}T14:00:00Z` }]
          : [])
      ]
    };
  });
}

/* ================================================================== */
/*  INVOICE SEED                                                      */
/* ================================================================== */

export function buildInvoiceSeed() {
  return [
    {
      id: 'VINV-2026-0006', invoiceNo: 'VINV-2026-0006',
      poNo: 'PO-2026-0339', vendor: 'Dell Technologies',
      invoiceDate: '2026-08-02', dueDate: '2026-08-09',
      amount: 86400, gst: 15552, total: 101952,
      status: INVOICE_STATUS.PAID, paymentMethod: 'Bank Transfer',
      paymentDate: '2026-08-05', notes: 'Full settlement for laptop refresh.',
      paidAmount: 101952, createdAt: '2026-08-02T10:15:00Z'
    },
    {
      id: 'VINV-2026-0005', invoiceNo: 'VINV-2026-0005',
      poNo: 'PO-2026-0338', vendor: 'Havells India',
      invoiceDate: '2026-07-30', dueDate: '2026-08-29',
      amount: 63975, gst: 11515.5, total: 75490.5,
      status: INVOICE_STATUS.PARTIAL, paymentMethod: 'Cheque',
      paymentDate: '2026-08-01', notes: '50% paid on receipt of first batch.',
      paidAmount: 37745.25, createdAt: '2026-07-30T10:15:00Z'
    },
    {
      id: 'VINV-2026-0004', invoiceNo: 'VINV-2026-0004',
      poNo: 'PO-2026-0341', vendor: 'JSW Steel',
      invoiceDate: '2026-08-01', dueDate: '2026-08-31',
      amount: 270000, gst: 48600, total: 318600,
      status: INVOICE_STATUS.APPROVED, paymentMethod: 'Bank Transfer',
      paymentDate: '', notes: 'Awaiting payment approval.',
      paidAmount: 0, createdAt: '2026-08-01T10:15:00Z'
    },
    {
      id: 'VINV-2026-0003', invoiceNo: 'VINV-2026-0003',
      poNo: 'PO-2026-0340', vendor: 'Tata Steel',
      invoiceDate: '2026-08-03', dueDate: '2026-09-02',
      amount: 229600, gst: 41328, total: 270928,
      status: INVOICE_STATUS.SUBMITTED, paymentMethod: 'Bank Transfer',
      paymentDate: '', notes: 'Under three-way match.',
      paidAmount: 0, createdAt: '2026-08-03T10:15:00Z'
    },
    {
      id: 'VINV-2026-0002', invoiceNo: 'VINV-2026-0002',
      poNo: 'PO-2026-0336', vendor: 'Bosch India',
      invoiceDate: '2026-07-28', dueDate: '2026-08-12',
      amount: 51200, gst: 6144, total: 57344,
      status: INVOICE_STATUS.PAID, paymentMethod: 'UPI',
      paymentDate: '2026-07-30', notes: '',
      paidAmount: 57344, createdAt: '2026-07-28T10:15:00Z'
    },
    {
      id: 'VINV-2026-0001', invoiceNo: 'VINV-2026-0001',
      poNo: 'PO-2026-0335', vendor: 'Crompton Greaves',
      invoiceDate: '2026-07-25', dueDate: '2026-08-09',
      amount: 18600, gst: 3348, total: 21948,
      status: INVOICE_STATUS.OVERDUE, paymentMethod: 'Cheque',
      paymentDate: '', notes: 'Payment window missed, follow up with finance.',
      paidAmount: 0, createdAt: '2026-07-25T10:15:00Z'
    }
  ];
}
