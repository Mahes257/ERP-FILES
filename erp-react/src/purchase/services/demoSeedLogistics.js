/**
 * purchase/services/demoSeedLogistics.js
 * ------------------------------------------------------------------
 * Coherent Indian industrial procurement logistics demo dataset.
 * Seed data for manufacturing, shipments, GRNs, inspections and
 * inventory records.
 * ------------------------------------------------------------------
 */
import {
  SHIPMENT_STATUS, GRN_STATUS, INSPECTION_STATUS, INVENTORY_TYPE,
  PACKING_STATUS
} from './logistics';

/* ================================================================== */
/*  MANUFACTURING / PACKING SEED                                      */
/* ================================================================== */

export function buildManufacturingSeed() {
  return [
    {
      id: 'MFR-2026-014', packingNo: 'MFR-2026-014', poNo: 'PO-2026-0340',
      product: 'Hot rolled steel sheets 3mm', vendor: 'Tata Steel', qty: 8000, packedQty: 8000,
      status: PACKING_STATUS.READY_TO_SHIP,
      startDate: '2026-07-28', expectedDate: '2026-08-20',
      notes: 'Ready for dispatch.',
      createdAt: '2026-07-28T08:00:00Z'
    },
    {
      id: 'MFR-2026-013', packingNo: 'MFR-2026-013', poNo: 'PO-2026-0338',
      product: 'LED lighting fixtures', vendor: 'Havells India', qty: 85, packedQty: 70,
      status: PACKING_STATUS.PACKED,
      startDate: '2026-07-25', expectedDate: '2026-08-25',
      notes: 'Packing in progress.',
      createdAt: '2026-07-25T08:00:00Z'
    },
    {
      id: 'MFR-2026-012', packingNo: 'MFR-2026-012', poNo: 'PO-2026-0337',
      product: 'Forged flanges DN150/DN100', vendor: 'Tata Steel', qty: 70, packedQty: 63,
      status: PACKING_STATUS.PACKED,
      startDate: '2026-07-20', expectedDate: '2026-08-10',
      notes: '',
      createdAt: '2026-07-20T08:00:00Z'
    },
    {
      id: 'MFR-2026-011', packingNo: 'MFR-2026-011', poNo: 'PO-2026-0341',
      product: 'CRCA coils 1.2mm', vendor: 'JSW Steel', qty: 15000, packedQty: 6750,
      status: PACKING_STATUS.IN_PRODUCTION,
      startDate: '2026-07-24', expectedDate: '2026-08-15',
      notes: 'Rolling schedule confirmed.',
      createdAt: '2026-07-24T08:00:00Z'
    },
    {
      id: 'MFR-2026-010', packingNo: 'MFR-2026-010', poNo: 'PO-2026-0334',
      product: 'Calibration gauges', vendor: 'Godrej Consumer', qty: 5, packedQty: 2,
      status: PACKING_STATUS.IN_PRODUCTION,
      startDate: '2026-07-22', expectedDate: '2026-09-01',
      notes: '',
      createdAt: '2026-07-22T08:00:00Z'
    }
  ];
}

/* ================================================================== */
/*  SHIPMENT SEED                                                     */
/* ================================================================== */

export function buildShipmentSeed() {
  return [
    {
      id: 'SHP-2026-021', shipmentNo: 'SHP-2026-021',
      poNo: 'PO-2026-0338', packingNo: 'MFR-2026-013', vendor: 'Havells India',
      carrier: 'Blue Dart Freight', mode: 'Road',
      dispatchDate: '2026-08-01', etd: '2026-08-01', eta: '2026-08-06',
      destination: 'Plant A Store, Pune',
      status: SHIPMENT_STATUS.IN_TRANSIT,
      trackingNo: 'BDT-88412', notes: '',
      receivedOn: '',
      createdAt: '2026-08-01T10:00:00Z'
    },
    {
      id: 'SHP-2026-020', shipmentNo: 'SHP-2026-020',
      poNo: 'PO-2026-0337', packingNo: 'MFR-2026-012', vendor: 'Tata Steel',
      carrier: 'VRL Logistics', mode: 'Road',
      dispatchDate: '2026-07-31', etd: '2026-07-31', eta: '2026-08-09',
      destination: 'Plant B Store, Mumbai',
      status: SHIPMENT_STATUS.IN_TRANSIT,
      trackingNo: 'VRL-22140', notes: 'Multi-drop load.',
      receivedOn: '',
      createdAt: '2026-07-31T10:00:00Z'
    },
    {
      id: 'SHP-2026-019', shipmentNo: 'SHP-2026-019',
      poNo: 'PO-2026-0336', packingNo: '', vendor: 'Bosch India',
      carrier: 'Delhivery', mode: 'Road',
      dispatchDate: '2026-07-28', etd: '2026-07-28', eta: '2026-08-02',
      destination: 'Central Store, Chennai',
      status: SHIPMENT_STATUS.DELIVERED,
      trackingNo: 'DLV-55607', notes: '',
      receivedOn: '2026-08-02',
      createdAt: '2026-07-28T10:00:00Z'
    },
    {
      id: 'SHP-2026-018', shipmentNo: 'SHP-2026-018',
      poNo: 'PO-2026-0339', packingNo: '', vendor: 'Dell Technologies',
      carrier: 'DTDC Express', mode: 'Air',
      dispatchDate: '2026-07-30', etd: '2026-07-30', eta: '2026-08-03',
      destination: 'IT Store, Bangalore',
      status: SHIPMENT_STATUS.DELIVERED,
      trackingNo: 'DTDC-90112', notes: '',
      receivedOn: '2026-08-03',
      createdAt: '2026-07-30T10:00:00Z'
    },
    {
      id: 'SHP-2026-017', shipmentNo: 'SHP-2026-017',
      poNo: 'PO-2026-0335', packingNo: '', vendor: 'Crompton Greaves',
      carrier: 'Blue Dart Freight', mode: 'Road',
      dispatchDate: '2026-07-29', etd: '2026-07-29', eta: '2026-08-05',
      destination: 'Plant A Store, Pune',
      status: SHIPMENT_STATUS.DELAYED,
      trackingNo: 'BDT-77120', notes: 'Weather delay at hub.',
      receivedOn: '',
      createdAt: '2026-07-29T10:00:00Z'
    },
    {
      id: 'SHP-2026-016', shipmentNo: 'SHP-2026-016',
      poNo: 'PO-2026-0340', packingNo: 'MFR-2026-014', vendor: 'Tata Steel',
      carrier: 'VRL Logistics', mode: 'Rail',
      dispatchDate: '', etd: '2026-08-18', eta: '2026-08-25',
      destination: 'Plant A Store, Pune',
      status: SHIPMENT_STATUS.PENDING,
      trackingNo: '', notes: 'Awaiting packing completion.',
      receivedOn: '',
      createdAt: '2026-07-25T10:00:00Z'
    }
  ];
}

/* ================================================================== */
/*  GRN SEED                                                          */
/* ================================================================== */

export function buildGrnSeed() {
  return [
    {
      id: 'GRN-2026-042', grnNo: 'GRN-2026-042',
      poNo: 'PO-2026-0337', shipmentNo: 'SHP-2026-020', vendor: 'Tata Steel Ltd',
      warehouse: 'Plant B Store, Mumbai',
      receivedOn: '', status: GRN_STATUS.EXPECTED,
      items: [
        { product: 'Forged flange DN150', qty: 15, received: 0 },
        { product: 'Forged flange DN100', qty: 10, received: 0 }
      ],
      createdAt: '2026-08-05T11:00:00Z', receivedAt: ''
    },
    {
      id: 'GRN-2026-041', grnNo: 'GRN-2026-041',
      poNo: 'PO-2026-0339', shipmentNo: 'SHP-2026-018', vendor: 'Dell Technologies',
      warehouse: 'IT Store, Bangalore',
      receivedOn: '2026-08-03', status: GRN_STATUS.PENDING_INSPECTION,
      items: [
        { product: 'Dell Latitude 7450', qty: 12, received: 12 },
        { product: 'Extended battery pack', qty: 12, received: 12 }
      ],
      createdAt: '2026-08-03T11:00:00Z', receivedAt: '2026-08-03'
    },
    {
      id: 'GRN-2026-040', grnNo: 'GRN-2026-040',
      poNo: 'PO-2026-0336', shipmentNo: 'SHP-2026-019', vendor: 'Bosch India',
      warehouse: 'Central Store, Chennai',
      receivedOn: '2026-08-02', status: GRN_STATUS.RECEIVED,
      items: [
        { product: 'Safety shoes (steel toe)', qty: 40, received: 40 },
        { product: 'Safety helmet', qty: 50, received: 50 }
      ],
      createdAt: '2026-08-02T11:00:00Z', receivedAt: '2026-08-02'
    },
    {
      id: 'GRN-2026-039', grnNo: 'GRN-2026-039',
      poNo: 'PO-2026-0335', shipmentNo: 'SHP-2026-017', vendor: 'Crompton Greaves',
      warehouse: 'Plant A Store, Pune',
      receivedOn: '2026-08-01', status: GRN_STATUS.RECEIVED,
      items: [
        { product: 'Managed switch 24 port', qty: 3, received: 3 }
      ],
      createdAt: '2026-08-01T11:00:00Z', receivedAt: '2026-08-01'
    },
    {
      id: 'GRN-2026-038', grnNo: 'GRN-2026-038',
      poNo: 'PO-2026-0337', shipmentNo: 'SHP-2026-020', vendor: 'Tata Steel Ltd',
      warehouse: 'Plant B Store, Mumbai',
      receivedOn: '2026-08-04', status: GRN_STATUS.RECEIVED,
      items: [
        { product: 'Forged flange DN150', qty: 25, received: 25 },
        { product: 'Forged flange DN100', qty: 20, received: 20 }
      ],
      createdAt: '2026-08-04T11:00:00Z', receivedAt: '2026-08-04'
    },
    {
      id: 'GRN-2026-037', grnNo: 'GRN-2026-037',
      poNo: 'PO-2026-0338', shipmentNo: 'SHP-2026-021', vendor: 'Havells India',
      warehouse: 'Plant A Store, Pune',
      receivedOn: '', status: GRN_STATUS.EXPECTED,
      items: [
        { product: 'LED bulkhead 20W', qty: 60, received: 0 },
        { product: 'LED high bay 200W', qty: 25, received: 0 }
      ],
      createdAt: '2026-07-28T11:00:00Z', receivedAt: ''
    }
  ];
}

/* ================================================================== */
/*  INSPECTION SEED                                                   */
/* ================================================================== */

export function buildInspectionSeed() {
  return [
    {
      id: 'QC-2026-032', inspectionNo: 'QC-2026-032',
      grnNo: 'GRN-2026-041', poNo: 'PO-2026-0339',
      vendor: 'Dell Technologies', inspectedOn: '',
      status: INSPECTION_STATUS.PENDING, defects: 0,
      inspector: 'Meera Joshi', notes: 'Visual inspection scheduled.',
      items: [
        { product: 'Dell Latitude 7450', receivedQty: 12, inspectedQty: 0, acceptedQty: 0, rejectedQty: 0 },
        { product: 'Extended battery pack', receivedQty: 12, inspectedQty: 0, acceptedQty: 0, rejectedQty: 0 }
      ],
      createdAt: '2026-08-03T12:00:00Z'
    },
    {
      id: 'QC-2026-031', inspectionNo: 'QC-2026-031',
      grnNo: 'GRN-2026-040', poNo: 'PO-2026-0336',
      vendor: 'Bosch India', inspectedOn: '2026-08-02',
      status: INSPECTION_STATUS.PASSED, defects: 0,
      inspector: 'Meera Joshi', notes: 'All batches conform.',
      items: [
        { product: 'Safety shoes (steel toe)', receivedQty: 40, inspectedQty: 40, acceptedQty: 40, rejectedQty: 0 },
        { product: 'Safety helmet', receivedQty: 50, inspectedQty: 50, acceptedQty: 50, rejectedQty: 0 }
      ],
      createdAt: '2026-08-02T12:00:00Z'
    },
    {
      id: 'QC-2026-030', inspectionNo: 'QC-2026-030',
      grnNo: 'GRN-2026-039', poNo: 'PO-2026-0335',
      vendor: 'Crompton Greaves', inspectedOn: '2026-08-01',
      status: INSPECTION_STATUS.PASSED, defects: 0,
      inspector: 'Sanjay Kumar', notes: '',
      items: [
        { product: 'Managed switch 24 port', receivedQty: 3, inspectedQty: 3, acceptedQty: 3, rejectedQty: 0 }
      ],
      createdAt: '2026-08-01T12:00:00Z'
    },
    {
      id: 'QC-2026-029', inspectionNo: 'QC-2026-029',
      grnNo: 'GRN-2026-038', poNo: 'PO-2026-0337',
      vendor: 'Tata Steel Ltd', inspectedOn: '2026-08-04',
      status: INSPECTION_STATUS.PASSED, defects: 0,
      inspector: 'Meera Joshi', notes: 'Flanges meet spec.',
      items: [
        { product: 'Forged flange DN150', receivedQty: 25, inspectedQty: 25, acceptedQty: 25, rejectedQty: 0 },
        { product: 'Forged flange DN100', receivedQty: 20, inspectedQty: 20, acceptedQty: 20, rejectedQty: 0 }
      ],
      createdAt: '2026-08-04T12:00:00Z'
    },
    {
      id: 'QC-2026-028', inspectionNo: 'QC-2026-028',
      grnNo: 'GRN-2026-037', poNo: 'PO-2026-0338',
      vendor: 'Havells India', inspectedOn: '',
      status: INSPECTION_STATUS.PENDING, defects: 0,
      inspector: 'Sanjay Kumar', notes: '',
      items: [
        { product: 'LED bulkhead 20W', receivedQty: 0, inspectedQty: 0, acceptedQty: 0, rejectedQty: 0 },
        { product: 'LED high bay 200W', receivedQty: 0, inspectedQty: 0, acceptedQty: 0, rejectedQty: 0 }
      ],
      createdAt: '2026-07-29T12:00:00Z'
    }
  ];
}

/* ================================================================== */
/*  INVENTORY SEED                                                    */
/* ================================================================== */

export function buildInventorySeed() {
  return [
    {
      id: 'INV-2026-001', sku: 'RM-STL-01',
      product: 'Hot rolled steel sheet 3mm', warehouse: 'Plant A Store',
      before: 24000, delta: 8000, after: 32000,
      type: INVENTORY_TYPE.RECEIPT, reference: 'GRN-2026-041',
      updatedOn: '2026-08-03', updatedBy: 'Stores Team',
      createdAt: '2026-08-03T14:00:00Z'
    },
    {
      id: 'INV-2026-002', sku: 'PPE-SHOE-01',
      product: 'Safety shoes (steel toe)', warehouse: 'Central Store',
      before: 120, delta: 40, after: 160,
      type: INVENTORY_TYPE.RECEIPT, reference: 'GRN-2026-040',
      updatedOn: '2026-08-02', updatedBy: 'Rohan Desai',
      createdAt: '2026-08-02T14:00:00Z'
    },
    {
      id: 'INV-2026-003', sku: 'ELC-SW-01',
      product: 'Managed switch 24 port', warehouse: 'IT Store',
      before: 5, delta: 3, after: 8,
      type: INVENTORY_TYPE.RECEIPT, reference: 'GRN-2026-039',
      updatedOn: '2026-08-01', updatedBy: 'Stores Team',
      createdAt: '2026-08-01T14:00:00Z'
    },
    {
      id: 'INV-2026-004', sku: 'RM-STL-02',
      product: 'CRCA coil 1.2mm', warehouse: 'Plant A Store',
      before: 32000, delta: 15000, after: 47000,
      type: INVENTORY_TYPE.RECEIPT, reference: 'PO-2026-0341',
      updatedOn: '2026-08-02', updatedBy: 'Rohan Desai',
      createdAt: '2026-08-02T14:00:00Z'
    },
    {
      id: 'INV-2026-005', sku: 'FGC-FL-01',
      product: 'Forged flange DN150', warehouse: 'Plant B Store',
      before: 200, delta: 40, after: 240,
      type: INVENTORY_TYPE.ADJUSTMENT, reference: 'Cycle count',
      updatedOn: '2026-08-01', updatedBy: 'Stores Team',
      createdAt: '2026-08-01T14:00:00Z'
    },
    {
      id: 'INV-2026-006', sku: 'PPE-HEL-01',
      product: 'Safety helmet', warehouse: 'Central Store',
      before: 90, delta: 10, after: 80,
      type: INVENTORY_TYPE.ISSUE, reference: 'Dept issue',
      updatedOn: '2026-07-31', updatedBy: 'Rohan Desai',
      createdAt: '2026-07-31T14:00:00Z'
    }
  ];
}
