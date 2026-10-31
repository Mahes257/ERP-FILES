/**
 * tests/sales-delete-permissions.test.js
 * ------------------------------------------------------------------
 * Sales · the delete actions vs the backend SALES_DELETE authority.
 *
 *   AUTHORITY  the frontend capability IS the backend's own role → permission
 *              map — ADMIN and MANAGER hold SALES_DELETE, USER does not — and
 *              it is asserted against RolePermissions.java, so the two cannot
 *              drift apart, and against UserRole.java, so a new role cannot be
 *              introduced without deciding what it may delete
 *   CONTRACT   the server still requires SALES_DELETE on every delete route the
 *              UI mirrors: the single DELETE /{id} plus POST /bulk-delete and
 *              POST /bulk-permanent-delete of all eight Sales document
 *              controllers (and the Sales Order E-Action deletes)
 *   VISIBILITY every delete entry point of the eight document modules — single,
 *              bulk and permanent, on their list, view and design surfaces —
 *              sits behind that one capability, on both the row/header menus
 *              and the bulk action bar; the only deliberate exception is the
 *              quotation's ATTACHED-document delete, which is the Documents
 *              module's own DOCUMENT_DELETE action
 *   NON-VACUOUS the entry-point scanner is itself tested, so a silently
 *              unguarded delete cannot pass by accident
 *
 * The scanner recognises the shapes the Sales module actually uses for a delete
 * entry point: a menu/action item (`key: 'delete'` / `key: 'permanentDelete'`),
 * a confirmation opened straight from a bulk button
 * (`setConfirm({ type: 'delete' …`) and the E-Action list's own row / bulk
 * delete buttons. Handler sites (`case 'delete':`) are not entry points.
 *
 * Run: node --test tests/sales-delete-permissions.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { hasSalesDelete, SALES_DELETE_ROLES } from '../src/utils/salesPermissions.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const BACKEND = 'erp-backend/src/main/java/com/vishatech/erp/';
const ROLE_PERMISSIONS = `${BACKEND}security/RolePermissions.java`;
const USER_ROLE = `${BACKEND}entity/UserRole.java`;
const CONTEXT = 'src/components/Common/CurrentUserContext.jsx';

/** The eight Sales document controllers whose delete actions the UI mirrors. */
const CONTROLLERS = [
  'SalesOrderController',
  'QuotationController',
  'SalesContractController',
  'InvoiceController',
  'ProformaInvoiceController',
  'DeliveryChallanController',
  'CreditNoteController',
  'PaymentReceiptController'
];

// ── the capability ────────────────────────────────────────────────────────

describe('Sales delete · which role holds the authority', () => {
  it('grants SALES_DELETE to ADMIN and MANAGER and withholds it from USER', () => {
    assert.equal(hasSalesDelete('ADMIN'), true);
    assert.equal(hasSalesDelete('MANAGER'), true);
    assert.equal(hasSalesDelete('USER'), false);
  });

  it('is case-insensitive, tolerates padding and fails closed on anything unknown', () => {
    assert.equal(hasSalesDelete('admin'), true);
    assert.equal(hasSalesDelete(' Manager '), true);
    assert.equal(hasSalesDelete(''), false);
    assert.equal(hasSalesDelete(null), false);
    assert.equal(hasSalesDelete(undefined), false);
    assert.equal(hasSalesDelete('VIEWER'), false);
    assert.equal(hasSalesDelete('SUPERUSER'), false);
    assert.equal(hasSalesDelete(0), false);
  });

  it('is the backend map itself — read out of RolePermissions.java', () => {
    const src = read(ROLE_PERMISSIONS);
    const admin = src.slice(src.indexOf('case ADMIN ->'), src.indexOf('case MANAGER ->'));
    const manager = src.slice(src.indexOf('case MANAGER ->'), src.indexOf('case USER ->'));
    const user = src.slice(src.indexOf('case USER ->'));

    // ADMIN receives every permission, so SALES_DELETE is included by
    // construction rather than by being listed.
    assert.match(admin, /EnumSet\.allOf\(Permission\.class\)/);
    assert.equal(admin.includes('SALES_DELETE'), false);
    // MANAGER lists it, USER never mentions it.
    assert.match(manager, /Permission\.SALES_DELETE,/);
    assert.equal(user.includes('SALES_DELETE'), false);

    assert.deepEqual(SALES_DELETE_ROLES, ['ADMIN', 'MANAGER']);
  });

  it('decides every role the application can actually hand the UI', () => {
    const roles = [...read(USER_ROLE).matchAll(/^ {4}([A-Z_]+),?$/gm)].map((m) => m[1]);
    assert.deepEqual(roles, ['ADMIN', 'MANAGER', 'USER']);
    // A role added to the backend must be decided here too — never undefined.
    for (const role of roles) assert.equal(typeof hasSalesDelete(role), 'boolean');
  });
});

describe('Sales delete · one shared capability in the user context', () => {
  it('derives canDeleteSales from the shared rule instead of comparing roles inline', () => {
    const src = read(CONTEXT);
    assert.match(src, /import \{ hasSalesDelete \} from '\.\.\/\.\.\/utils\/salesPermissions';/);
    assert.match(src, /const canDeleteSales = hasSalesDelete\(role\);/);
    assert.match(
      src,
      /return \{ currentUser: user, isAdmin, isManager, role, canDeleteSales \};/
    );
  });

  it('leaves the pre-existing approval flags exactly as they were', () => {
    const src = read(CONTEXT);
    assert.match(src, /const isAdmin = role === 'ADMIN';/);
    assert.match(src, /const isManager = role === 'MANAGER' \|\| role === 'ADMIN';/);
  });
});

// ── the backend routes the gates mirror ───────────────────────────────────

describe('Sales delete · the server still requires SALES_DELETE', () => {
  for (const controller of CONTROLLERS) {
    it(`${controller} guards its single, bulk and permanent delete routes`, () => {
      const src = read(`${BACKEND}controller/${controller}.java`);
      const guarded = (annotation) =>
        src.includes(
          `    @PreAuthorize("hasAuthority('SALES_DELETE')")\n    ${annotation}`
        );
      assert.ok(guarded('@DeleteMapping("/{id}")'), `${controller} single delete must require SALES_DELETE`);
      assert.ok(guarded('@PostMapping("/bulk-delete")'), `${controller} bulk delete must require SALES_DELETE`);
      assert.ok(
        guarded('@PostMapping("/bulk-permanent-delete")'),
        `${controller} bulk permanent delete must require SALES_DELETE`
      );
    });
  }

  it('the Sales Order E-Action deletes require SALES_DELETE too', () => {
    const src = read(`${BACKEND}controller/SalesOrderController.java`);
    for (const mapping of ['@DeleteMapping("/{id}/e-actions/{actionId}")', '@DeleteMapping("/e-actions/{actionId}")']) {
      assert.ok(
        src.includes(`    @PreAuthorize("hasAuthority('SALES_DELETE')")\n    ${mapping}`),
        `${mapping} must require SALES_DELETE`
      );
    }
  });
});

// ── visibility ────────────────────────────────────────────────────────────

/** The delete ENTRY POINT shapes the Sales module uses (handlers excluded). */
const ENTRY_PATTERNS = [
  /key: '(?:delete|permanentDelete)'/g,
  /setConfirm\(\{ type: '(?:delete|permanentDelete)'/g,
  /setConfirmRow\(row\)/g,
  /setConfirmBulk\(true\)/g
];

/** How many characters before an entry point its guard may sit. */
const GUARD_WINDOW = 700;

/** A switch case that handles a chosen action — never an entry point itself. */
const HANDLER = /case '(?:delete|permanentDelete)':/;

const GUARD = 'canDeleteSales';

/**
 * Every delete entry point in `source` that is NOT preceded by the capability
 * guard — i.e. a delete a plain USER could still reach.
 */
function unguardedDeleteEntryPoints(source) {
  const hits = [];
  for (const pattern of ENTRY_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const handlerRegion = source.slice(Math.max(0, match.index - 220), match.index);
      if (HANDLER.test(handlerRegion)) continue;
      const guardRegion = source.slice(Math.max(0, match.index - GUARD_WINDOW), match.index);
      if (!guardRegion.includes(GUARD)) hits.push(match.index);
    }
  }
  return hits.sort((a, b) => a - b);
}

/** The eight Sales document modules, across every surface that can delete. */
const SURFACES = [
  {
    file: 'src/components/SalesTable/SalesListPage.jsx',
    modules: 'Sales Orders, Invoices, Proforma Invoices, Delivery Challans, Credit Notes, Payment Receipts',
    surface: 'list (row menu + bulk bar)'
  },
  {
    file: 'src/components/SalesDetail/SalesViewPage.jsx',
    modules: 'the same six modules',
    surface: 'view (header + ⋯ More menu)'
  },
  {
    file: 'src/components/SalesDesign/SalesDocumentDesign.jsx',
    modules: 'the same six modules plus Sales Contracts',
    surface: 'design workspace (⋯ More menu)'
  },
  {
    file: 'src/pages/sales/QuotationListPage.jsx',
    modules: 'Quotations',
    surface: 'list (row menu + bulk bar)'
  },
  {
    file: 'src/pages/sales/QuotationViewPage.jsx',
    modules: 'Quotations',
    surface: 'view (header actions)',
    // The one deliberate exemption — the attached-documents menu. Its reason is
    // asserted in "exempts exactly one delete, and for the right reason" below.
    exempt: 1
  },
  {
    file: 'src/pages/sales/QuotationDesign.jsx',
    modules: 'Quotations',
    surface: 'design workspace (document menu)'
  },
  {
    file: 'src/pages/sales/SalesContractListPage.jsx',
    modules: 'Sales Contracts',
    surface: 'list (row menu + bulk bar)'
  },
  {
    file: 'src/pages/sales/SalesContractViewPage.jsx',
    modules: 'Sales Contracts',
    surface: 'view (⋯ More menu)'
  },
  {
    file: 'src/pages/sales/EActionViewPage.jsx',
    modules: 'Sales Order E-Actions',
    surface: 'view (⋯ More menu)'
  },
  {
    file: 'src/pages/sales/CpoEActions.jsx',
    modules: 'Sales Order E-Actions',
    surface: 'list (row action + bulk action)'
  }
];

describe('Sales delete · unauthorized visibility', () => {
  for (const { file, modules, surface, exempt = 0 } of SURFACES) {
    it(`${file} — ${modules} · ${surface}`, () => {
      const src = read(file);

      // The capability is read from the shared user context, never guessed.
      assert.match(src, /useCurrentUser/, `${file} must read the shared capability`);
      assert.match(src, /canDeleteSales/, `${file} must gate on canDeleteSales`);

      // ...and every delete on this surface is behind it, bar the documented
      // exemption below.
      const hits = unguardedDeleteEntryPoints(src);
      assert.equal(
        hits.length,
        exempt,
        `${file} lets a caller without SALES_DELETE reach ${hits.length} delete entry point(s); expected ${exempt}`
      );
    });
  }

  it('holds even though the delete handlers themselves still exist (features kept)', () => {
    // The guards hide the entry points; they never remove the capability, so an
    // authorised caller keeps every workflow. Each surface must therefore still
    // CONTAIN the delete entry points, just behind the guard.
    for (const { file } of SURFACES) {
      const src = read(file);
      const guarded = /canDeleteSales/.test(src);
      const entryPoints = ENTRY_PATTERNS.some((p) => {
        p.lastIndex = 0;
        return p.test(src);
      });
      assert.ok(guarded && entryPoints, `${file} must keep its guarded delete entry points`);
    }
  });

  it('exempts exactly one delete, and for the right reason', () => {
    // The quotation view also lists ATTACHED DOCUMENTS; deleting one is the
    // Documents module's own delete (DOCUMENT_DELETE), so SALES_DELETE is the
    // wrong authority for it and it must stay ungated by this capability.
    const file = 'src/pages/sales/QuotationViewPage.jsx';
    const src = read(file);
    const hits = unguardedDeleteEntryPoints(src);
    assert.equal(hits.length, 1);

    const menuStart = src.indexOf('const docMenuItems');
    assert.ok(menuStart > -1 && hits[0] > menuStart, 'the exempt delete must be the attached-documents menu');
    assert.match(
      src.slice(menuStart),
      /\{ key: 'delete', label: 'Delete', icon: Trash2, danger: true \}\n  \];/,
      'the exempt delete must be the attached-documents menu entry'
    );
  });

  it('reacts to an unguarded delete — the scanner is not vacuous', () => {
    const open = "    items.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });\n";
    const guarded =
      "    if (canDeleteSales) {\n      items.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });\n    }\n";

    assert.equal(unguardedDeleteEntryPoints(open).length, 1);
    assert.deepEqual(unguardedDeleteEntryPoints(guarded), []);
    // A guarded bulk button is accepted, an unguarded one is not.
    assert.equal(unguardedDeleteEntryPoints("onClick={() => setConfirm({ type: 'delete', ids })}\n").length, 1);
    assert.deepEqual(
      unguardedDeleteEntryPoints("canDeleteSales && <button onClick={() => setConfirm({ type: 'delete', ids })} />\n"),
      []
    );
    // ...and a handler is never mistaken for an entry point.
    assert.deepEqual(
      unguardedDeleteEntryPoints("      case 'delete':\n        setConfirm({ type: 'delete', ids });\n"),
      []
    );
  });
});
