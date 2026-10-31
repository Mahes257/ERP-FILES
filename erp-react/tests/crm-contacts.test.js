/**
 * tests/crm-contacts.test.js
 * ------------------------------------------------------------------
 * CRM → Contacts: the submodule lists REAL contact rows captured by the Lead
 * form, keeps primary and secondary people separate, and never offers an
 * association a contact does not have.
 *
 *   HELPERS   the list's columns, server-side filters and row actions, plus the
 *             relationship state of a contact
 *   CONTRACT  the page talks to the real /contacts API (never a mock array), the
 *             route/tab wiring makes Contacts a first-class CRM submodule, and
 *             the backend capture/sync/conversion hooks are the ones the lead
 *             and client services actually call
 *
 * Run: node --test tests/crm-contacts.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CONTACT_COLUMNS,
  CONTACT_FILTERS,
  contactActionKeys,
  contactAssociation,
  contactRowActions,
  contactStatusFor
} from '../src/utils/contactHelpers.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const PAGE = 'src/pages/crm/Contacts.jsx';
const SERVICE = 'src/services/contactService.js';
const HELPER = 'src/utils/contactHelpers.js';
const APP = 'src/App.jsx';
const NAV = 'src/components/Layout/SalesNav.jsx';
const HUB = 'src/pages/crm/CRMHub.jsx';

const LEAD_ONLY = { id: 1, name: 'Asha', leadId: 12, clientId: null, status: 'Active' };
const CONVERTED = { id: 2, name: 'Kiran', leadId: 13, clientId: 44, status: 'Active' };
const STANDALONE = { id: 3, name: 'Manual Person', leadId: null, clientId: null, status: 'Inactive' };

describe('columns and filters of the Contacts table', () => {
  it('shows the ten required columns in the order the CRM expects', () => {
    assert.deepEqual(
      CONTACT_COLUMNS.map((c) => c.label),
      [
        'Contact Name',
        'Business Name',
        'Contact Type',
        'Designation',
        'Phone',
        'Email',
        'Associated Lead',
        'Associated Client',
        'Status',
        'Actions'
      ]
    );
  });

  it('sorts the association columns on the associated records, not on their ids', () => {
    const byKey = Object.fromEntries(CONTACT_COLUMNS.map((c) => [c.key, c]));
    assert.equal(byKey.leadId.sortField, 'leadName');
    assert.equal(byKey.clientId.sortField, 'clientName');
    // Phone/Email/actions are not sortable — the backend exposes no sort for them.
    assert.equal(byKey.phone.sortable, undefined);
    assert.equal(byKey.email.sortable, undefined);
    assert.equal(byKey.actions.sortable, undefined);
  });

  it('filters contact type, association and status on the server', () => {
    assert.deepEqual(CONTACT_FILTERS.map((f) => f.key), ['contactType', 'association', 'status']);
    const association = CONTACT_FILTERS.find((f) => f.key === 'association');
    assert.deepEqual(
      association.options.map((o) => o.value),
      ['', 'lead', 'client', 'standalone']
    );
    // The status filter keeps every value the CRM lists use, trash included.
    const status = CONTACT_FILTERS.find((f) => f.key === 'status');
    for (const value of ['Active', 'Inactive', 'Archived', 'Deleted']) {
      assert.ok(status.options.some((o) => o.value === value), `missing ${value}`);
    }
  });
});

describe('a contact keeps its real relationships', () => {
  it('reports a lead contact as lead-only until the lead converts', () => {
    assert.equal(contactAssociation(LEAD_ONLY), 'lead');
    assert.equal(contactAssociation(CONVERTED), 'lead+client');
    assert.equal(contactAssociation(STANDALONE), 'standalone');
    assert.equal(contactAssociation(null), 'standalone');
  });

  it('offers the associated lead but not a client that does not exist', () => {
    const keys = contactActionKeys(LEAD_ONLY);
    assert.ok(keys.includes('openLead'));
    assert.ok(!keys.includes('openClient'));
  });

  it('offers both associations once the contact belongs to a client too', () => {
    const keys = contactActionKeys(CONVERTED);
    assert.ok(keys.includes('openLead'));
    assert.ok(keys.includes('openClient'));
  });

  it('omits the association section entirely for a standalone contact', () => {
    const actions = contactRowActions(STANDALONE);
    assert.ok(!actions.some((a) => a.section === 'ASSOCIATIONS'));
    assert.equal(contactAssociation(STANDALONE), 'standalone');
  });

  it('always offers trash, and only as a soft delete', () => {
    for (const row of [LEAD_ONLY, CONVERTED, STANDALONE]) {
      const actions = contactRowActions(row);
      const trash = actions.find((a) => a.key === 'delete');
      assert.equal(trash.label, 'Move to Trash');
      assert.equal(trash.danger, true);
    }
  });

  it('shows restore only for an archived contact', () => {
    const archived = contactActionKeys({ ...LEAD_ONLY, status: 'Archived' });
    assert.ok(archived.includes('restore'));
    assert.ok(!archived.includes('archive'));
    const active = contactActionKeys(LEAD_ONLY);
    assert.ok(active.includes('archive'));
    assert.ok(!active.includes('restore'));
  });

  it('maps every status toggle to the status the API is asked for', () => {
    assert.equal(contactStatusFor('markInactive'), 'Inactive');
    assert.equal(contactStatusFor('markActive'), 'Active');
    assert.equal(contactStatusFor('archive'), 'Archived');
    assert.equal(contactStatusFor('restore'), 'Active');
    assert.equal(contactStatusFor('viewContact'), null);
  });

  it('keeps the helpers free of any hardcoded contact records', () => {
    const source = read(HELPER);
    assert.ok(!/name:\s*'[A-Z][a-z]+ [A-Z]/.test(source), 'helper must not embed sample people');
    assert.ok(!/localStorage|sessionStorage/.test(source));
  });
});

describe('the page renders persisted data through the real API', () => {
  it('lists through the contacts endpoint with the CRM list component', () => {
    const page = read(PAGE);
    assert.match(page, /endpoint="contacts"/);
    assert.match(page, /contactService/);
    assert.ok(page.includes("from '../../utils/contactHelpers'"));
    // No browser-storage or mock data may stand in for the API.
    assert.ok(!/localStorage|sessionStorage/.test(page));
    assert.ok(!/mock|MOCK|sampleContacts|dummy/i.test(page));
  });

  it('hides genuinely empty optional values instead of printing null/undefined', () => {
    const page = read(PAGE);
    // Every renderer falls back to an em dash.
    for (const field of ['businessName', 'designation', 'phone', 'email']) {
      assert.match(page, new RegExp(`row\\.${field} \\|\\| '—'`), `${field} needs an em-dash fallback`);
    }
    assert.ok(!/>\{row\.\w+\}</.test(page), 'no raw row field may be rendered unguarded');
  });

  it('reloads the list from the server after a status change', () => {
    const page = read(PAGE);
    assert.match(page, /contactService\.setStatus\(row\.id, contactStatusFor\(actionKey\)\)/);
    assert.match(page, /refresh\?\.\(\)/);
  });

  it('calls only real /contacts endpoints from the service', () => {
    const service = read(SERVICE);
    const calls = [...service.matchAll(/api\.(get|post|put|patch|delete)\((['"`])((?:\\.|(?!\2).)*)\2/g)]
      .map(([, method, , path]) => `${method.toUpperCase()} ${path}`);
    assert.equal(calls.length, 16, `expected the full CRUD surface, saw ${calls.length}`);
    for (const call of calls) {
      assert.ok(
        call.includes('/contacts') || call.includes('/${endpoint}'),
        `${call} must target /contacts`
      );
    }
    // The list reads the contacts resource the shared CRM list passes in.
    assert.ok(calls.includes('GET /${endpoint}'));
    assert.ok(calls.includes('GET /contacts/stats'));
    assert.ok(calls.includes('POST /contacts'));
    assert.ok(calls.includes('PUT /contacts/${id}'));
    assert.ok(calls.includes('DELETE /contacts/${id}'));
    assert.ok(calls.includes('GET /contacts/lead/${leadId}'));
    assert.ok(calls.includes('POST /contacts/backfill'));
    assert.ok(!/localStorage|sessionStorage|mock/i.test(service));
  });

  it('surfaces a real API error instead of a fake success', () => {
    const service = read(SERVICE);
    assert.match(service, /normalizeApiError/);
    assert.ok(!/catch\s*\([^)]*\)\s*\{\s*return\s*\{\s*success/.test(service));
  });
});

describe('Contacts is a first-class CRM submodule', () => {
  it('deep-links its own routes', () => {
    const app = read(APP);
    // The routes are still registered with the same path and component; Sales
    // Access Management now wraps each of them in the Contacts View gate (and
    // the create/edit forms in their own action), so the exact string carries
    // the guard as well — the assertion is stricter than before, not looser.
    assert.ok(app.includes('<Route path="/contacts" element={<SalesAccessGuard area="contacts"><Contacts /></SalesAccessGuard>} />'));
    assert.ok(app.includes('<Route path="/contacts/new" element={<SalesAccessGuard area="contacts" action="create"><AddContact /></SalesAccessGuard>} />'));
    assert.ok(app.includes('<Route path="/contacts/:id/edit" element={<SalesAccessGuard area="contacts" action="edit"><EditContact /></SalesAccessGuard>} />'));
    assert.ok(app.includes('<Route path="/contacts/:id" element={<SalesAccessGuard area="contacts"><ContactDetails /></SalesAccessGuard>} />'));
  });

  it('sits between Clients and Follow-ups inside CRM without reordering them', () => {
    const hub = read(HUB);
    assert.match(hub, /label: 'Leads'[\s\S]*label: 'Pipeline'[\s\S]*label: 'Clients'[\s\S]*label: 'Contacts'[\s\S]*label: 'Follow-ups'/);
    assert.ok(hub.includes("{ key: 'contacts', label: 'Contacts'"));
    // The tab is reachable by deep link (/crm?tab=contacts), so the tab key must
    // exist in the hub's own tab list.
    assert.ok(/isTabKey/.test(hub));
  });

  it('keeps the CRM sidebar entry highlighted on the Contacts route', () => {
    const nav = read(NAV);
    assert.match(nav, /p\.startsWith\('\/contacts'\)/);
  });
});

describe('lead capture, sync and conversion hooks exist in the backend', () => {
  // CRM module packages: the Lead / Client / Contact classes live under
  // crm/{service,entity,repository} (see MODULAR_MONOLITH_MIGRATION_PLAN.md).
  const LEAD_SERVICE = 'erp-backend/src/main/java/com/vishatech/erp/crm/service/LeadService.java';
  const CUSTOMER_SERVICE = 'erp-backend/src/main/java/com/vishatech/erp/crm/service/CustomerService.java';
  const CONTACT_SERVICE = 'erp-backend/src/main/java/com/vishatech/erp/crm/service/ContactService.java';
  const CONTACT_ENTITY = 'erp-backend/src/main/java/com/vishatech/erp/crm/entity/Contact.java';
  const CONTACT_REPO = 'erp-backend/src/main/java/com/vishatech/erp/crm/repository/ContactRepository.java';

  it('mirrors a lead on create and on update (never only on create)', () => {
    const lead = read(LEAD_SERVICE);
    const syncs = [...lead.matchAll(/contactService\.syncFromLead\(saved\)/g)];
    assert.ok(syncs.length >= 2, 'create and update must both mirror the lead contacts');
  });

  it('links the same contact rows to the client a lead converts into', () => {
    const customer = read(CUSTOMER_SERVICE);
    assert.match(customer, /linkLeadContactsToClient\(request\.leadId\(\), client\.getId\(\)\)/);
    const service = read(CONTACT_SERVICE);
    assert.match(service, /contact\.setClient\(client\)/);
    // Linking must not insert a second contact row for the same person.
    assert.ok(!/linkLeadContactsToClient[\s\S]{0,600}new Contact\(\)/.test(service));
  });

  it('keeps one row per (lead, contact type) so saves cannot duplicate a person', () => {
    assert.match(read(CONTACT_REPO), /findByLeadIdAndContactType/);
    const service = read(CONTACT_SERVICE);
    assert.match(service, /syncRole\(lead, Contact\.TYPE_PRIMARY/);
    assert.match(service, /syncRole\(lead, Contact\.TYPE_SECONDARY/);
  });

  it('stores real foreign keys and a real primary key, not business names', () => {
    const entity = read(CONTACT_ENTITY);
    assert.match(entity, /@Table\(name = "contacts"\)/);
    assert.match(entity, /@JoinColumn\(name = "lead_id"\)/);
    assert.match(entity, /@JoinColumn\(name = "client_id"\)/);
    assert.match(entity, /@Column\(name = "contact_type"/);
    assert.ok(!/businessName\s*=\s*.*@/i.test(entity));
    assert.match(entity, /TYPE_PRIMARY = "Primary"/);
    assert.match(entity, /TYPE_SECONDARY = "Secondary"/);
  });

  it('never deletes a lead or a client from the contacts service', () => {
    const service = read(CONTACT_SERVICE);
    // Two removals, both of a CONTACT row: the explicit permanent delete, and
    // the stale lead-only mirror whose lead side was cleared. No lead/client
    // row is ever removed here.
    const deletes = [...service.matchAll(/contactRepository\.delete\(/g)].length;
    assert.equal(deletes, 2, 'contact rows are only removed by permanentDelete and the stale-mirror cleanup');
    assert.match(service, /permanentDelete[\s\S]{0,200}contactRepository\.delete\(find\(id\)\)/);
    assert.ok(!/leadRepository\.delete|customerRepository\.delete/.test(service));
  });
});
