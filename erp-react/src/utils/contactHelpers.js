/**
 * CRM → Contacts: the pure parts of the list.
 *
 * The Contacts table must reflect what MySQL really holds, so everything that
 * can be derived is derived here and kept out of the component:
 *
 *   * CONTACT_COLUMNS — the ten columns of the Contacts table, with the sort
 *     keys the backend accepts for each. "Associated Lead" and "Associated
 *     Client" sort on the joined records (leadName/clientName), not on an id.
 *   * CONTACT_FILTERS — the toolbar filters; every value is sent to the real
 *     /contacts endpoint as a query parameter, so filtering happens server-side
 *     over the persisted rows (never over the downloaded page).
 *   * contactAssociation(row) — the relationship state of one contact. A lead is
 *     NOT a client, so a captured lead contact reports "lead" until the lead is
 *     converted, and then "lead+client" once the client reference exists.
 *   * contactRowActions(row) — the actions offered for a row. An association is
 *     only offered when the contact really has it, so the UI can never navigate
 *     to a lead/client that does not exist.
 */

export const CONTACT_COLUMNS = [
  { key: 'name', label: 'Contact Name', sortable: true, sortField: 'name' },
  { key: 'businessName', label: 'Business Name', sortable: true, sortField: 'businessName' },
  { key: 'contactType', label: 'Contact Type', sortable: true, sortField: 'contactType' },
  { key: 'designation', label: 'Designation', sortable: true, sortField: 'designation' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'leadId', label: 'Associated Lead', sortable: true, sortField: 'leadName' },
  { key: 'clientId', label: 'Associated Client', sortable: true, sortField: 'clientName' },
  { key: 'status', label: 'Status', sortable: true, sortField: 'status' },
  { key: 'actions', label: 'Actions' }
];

export const CONTACT_FILTERS = [
  {
    key: 'contactType',
    label: 'Contact Type',
    type: 'select',
    options: [
      { value: '', label: 'All Types' },
      { value: 'Primary', label: 'Primary' },
      { value: 'Secondary', label: 'Secondary' }
    ]
  },
  {
    key: 'association',
    label: 'Association',
    type: 'select',
    options: [
      { value: '', label: 'All Contacts' },
      { value: 'lead', label: 'Linked to a Lead' },
      { value: 'client', label: 'Linked to a Client' },
      { value: 'standalone', label: 'No Lead and No Client' }
    ]
  },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: '', label: 'All Statuses' },
      { value: 'Active', label: 'Active' },
      { value: 'Inactive', label: 'Inactive' },
      { value: 'Archived', label: 'Archived' },
      { value: 'Deleted', label: 'Deleted' }
    ]
  }
];

/** The real relationship state of a contact row. */
export function contactAssociation(row) {
  const hasLead = Boolean(row?.leadId);
  const hasClient = Boolean(row?.clientId);
  if (hasLead && hasClient) return 'lead+client';
  if (hasLead) return 'lead';
  if (hasClient) return 'client';
  return 'standalone';
}

/**
 * The actions for one contact row, grouped into the same sections the other CRM
 * lists use. A destination is offered only when the contact truly carries that
 * reference (a lead-only contact has no client to open).
 */
export function contactRowActions(row) {
  const actions = [
    { section: 'CONTACT' },
    { key: 'viewContact', label: 'View Contact' },
    { key: 'editContact', label: 'Edit Contact' },
    { key: 'openInNewTab', label: 'Open in New Tab' }
  ];
  if (row?.leadId || row?.clientId) {
    actions.push({ section: 'ASSOCIATIONS' });
    if (row.leadId) actions.push({ key: 'openLead', label: 'Open Associated Lead' });
    if (row.clientId) actions.push({ key: 'openClient', label: 'Open Associated Client' });
  }
  actions.push({ section: 'STATUS' });
  if (row?.status === 'Archived') {
    actions.push({ key: 'restore', label: 'Restore' });
  } else {
    actions.push({ key: 'archive', label: 'Archive' });
    actions.push(
      row?.status === 'Inactive'
        ? { key: 'markActive', label: 'Mark as Active' }
        : { key: 'markInactive', label: 'Mark as Inactive' }
    );
  }
  actions.push({ section: 'OTHER' });
  // Trash is a soft delete (restorable from the Deleted tab) — contacts never
  // take their lead or client down with them.
  actions.push({ key: 'delete', label: 'Move to Trash', danger: true });
  return actions;
}

/** Action keys of a row, in order — handy for assertions and for the page. */
export function contactActionKeys(row) {
  return contactRowActions(row)
    .filter((action) => action.key)
    .map((action) => action.key);
}

/** The next status a toggle action applies (null when the action is not a toggle). */
export function contactStatusFor(actionKey) {
  if (actionKey === 'markActive') return 'Active';
  if (actionKey === 'markInactive') return 'Inactive';
  if (actionKey === 'archive') return 'Archived';
  if (actionKey === 'restore') return 'Active';
  return null;
}
