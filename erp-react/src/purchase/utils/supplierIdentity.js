/**
 * purchase/utils/supplierIdentity.js
 * ------------------------------------------------------------------
 * Pure helpers for the ERP Supplier Master. Every vendor record is a
 * single master row; these functions keep the record's structured
 * blocks (legal / tax / addresses / contacts / banks / credit /
 * contracts / categories) consistent with the legacy flat fields
 * (name / email / phone / address / category / gstin ...) that the
 * rest of the Purchase module still reads.
 *
 * Nothing here touches services or storage — safe to import from
 * forms, pages and unit tests.
 * ------------------------------------------------------------------
 */
import {
  SUPPLIER_CONTRACT_STATUS, SUPPLIER_ADDRESS_TYPES
} from '../constants';

/** Collapses whitespace + case for vendor-name comparisons. */
export function normalizeVendorText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Loose vendor-name equality used across the module: exact match wins,
 * then a both-ways substring match so legacy document names like
 * "Tata Steel Ltd" still resolve to the "Tata Steel" master record
 * (mirrors the RFQ service's resolveVendorByName).
 */
export function vendorNameMatches(nameA, nameB) {
  const a = normalizeVendorText(nameA);
  const b = normalizeVendorText(nameB);
  if (!a || !b) return false;
  if (a === b) return true;
  /* Strip common legal suffixes before the substring check so
     "Tata Steel Pvt Ltd" and "Tata Steel" agree without needing a
     full includes() on both sides (which would also match the
     unrelated "JSW Steel" against "Tata Steel"). */
  const bare = (value) =>
    value
      .replace(/\b(private limited|pvt\.?\s*ltd|public limited|ltd|llp|limited|incorporated|inc|co|company|corp)\.?\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const bareA = bare(a);
  const bareB = bare(b);
  return Boolean(
    bareA &&
      bareB &&
      (bareA.length >= 4 || bareB.length >= 4) &&
      (bareA.includes(bareB) || bareB.includes(bareA))
  );
}

/** True when a document record references the given supplier master. */
export function recordMatchesVendor(record = {}, vendor = {}) {
  if (!vendor) return false;
  if (vendor.id && record.vendorId && String(record.vendorId) === String(vendor.id)) return true;
  const recordName = record.vendor || record.vendorName || '';
  return vendorNameMatches(recordName, vendor.name);
}

/** Stable-ish id for a repeatable supplier block row. */
export function newSupplierBlockId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Registered-office block derived from the legacy flat address fields. */
export function registeredOfficeBlock(record = {}) {
  const hasFlatAddress =
    [record.address, record.city, record.state, record.postalCode, record.country].some(
      (value) => String(value || '').trim() !== ''
    );
  if (!hasFlatAddress) return null;
  return {
    id: 'registered-office',
    type: SUPPLIER_ADDRESS_TYPES[0], // Registered Office
    line: record.address || '',
    address: record.address || '',
    city: record.city || '',
    state: record.state || '',
    postalCode: record.postalCode || '',
    country: record.country || '',
    email: record.email || '',
    phone: record.phone || '',
    isDefault: true
  };
}

/** Primary-contact block derived from the legacy flat contact fields. */
export function primaryContactBlock(record = {}) {
  if (!record.email && !record.phone) return null;
  return {
    id: 'primary-contact',
    name: record.contactName || record.legalName || record.name || '',
    designation: record.contactDesignation || 'Primary Contact',
    role: 'Primary Contact',
    email: record.email || '',
    phone: record.phone || '',
    isPrimary: true
  };
}

const rowsWithId = (list) =>
  (Array.isArray(list) ? list : []).filter((row) => row && row.id);

/**
 * Returns a deep clone of the vendor record with every supplier-master
 * block present and consistent. Legacy records (created before the
 * master upgrade) get their blocks derived from the flat fields; the
 * persisted record is never rewritten here — the view is stable and
 * rebuilds on every read.
 */
export function ensureSupplierBlocks(record = {}) {
  const registered = registeredOfficeBlock(record);
  const primary = primaryContactBlock(record);
  const flatCategory = String(record.category || '').trim();
  const extraCategories = (Array.isArray(record.categories) ? record.categories : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const additionalAddresses = (Array.isArray(record.addresses) ? record.addresses : [])
    .filter((row) => row && row.id !== 'registered-office');
  const additionalContacts = (Array.isArray(record.contacts) ? record.contacts : [])
    .filter((row) => row && row.id !== 'primary-contact');

  const credit = record.creditLimit && typeof record.creditLimit === 'object'
    ? record.creditLimit
    : {};

  const contracts = (Array.isArray(record.contracts) ? record.contracts : [])
    .filter((row) => row && row.id)
    .map((contract) => ({
      ...contract,
      status: contract.status || SUPPLIER_CONTRACT_STATUS.DRAFT
    }));

  return {
    ...record,
    /* Legal / registration identity */
    legalName: record.legalName || record.name || '',
    legalType: record.legalType || '',
    cin: record.cin || '',
    incorporationDate: record.incorporationDate || record.registrationDate || '',
    msmeRegNo: record.msmeRegNo || '',
    msmeType: record.msmeType || '',
    /* Tax details */
    tan: record.tan || '',
    /* Operational flag — a supplier can be Approved yet temporarily
       inactive; archived suppliers are never active. */
    active: record.active !== false && record.recordState !== 'archived',
    /* Category list — the master's category (primary) plus extras. */
    category: flatCategory || (extraCategories[0] || ''),
    categories: flatCategory
      ? Array.from(new Set([flatCategory, ...extraCategories]))
      : extraCategories,
    /* Registered office (flat, map-linked) + additional addresses. */
    addresses: registered
      ? [registered, ...additionalAddresses]
      : additionalAddresses,
    /* Primary contact (flat email/phone) + additional contacts. */
    contacts: primary
      ? [primary, ...additionalContacts]
      : additionalContacts,
    bankDetails: rowsWithId(record.bankDetails),
    contracts,
    creditLimit: {
      amount: Number(credit.amount) || 0,
      currency: credit.currency || record.currency || 'INR',
      days: Number(credit.days) || 0
    }
  };
}

/**
 * Resolves a vendor reference (by master id, or by master name) into a
 * master record. `records` is any iterable of master records.
 */
export function resolveVendor(records, { id, name } = {}) {
  const list = Array.isArray(records) ? records : [];
  if (id) {
    const byId = list.find((entry) => entry && String(entry.id) === String(id));
    if (byId) return byId;
  }
  if (!name) return null;
  return (
    list.find((entry) => entry && vendorNameMatches(entry.name, name)) ||
    list.find((entry) => entry && entry.name && name.includes(entry.name)) ||
    null
  );
}
