import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Users, UserPlus, PhoneCall,
  ClipboardList, FileCheck2, FileSearch, Receipt, TrendingUp,
  FileText, Handshake, ShoppingCart, PackageCheck, Factory, ShieldCheck, Package, Truck, FileInput, FileOutput, CreditCard, Wallet,
  Megaphone, MapPin, CalendarDays, ClipboardSignature, DollarSign, Navigation, Settings, LayoutDashboard,
  Flame, Layers, BarChart3, Box, Hammer, ClipboardCheck, Wrench,
  PieChart, Building2, Mail, FolderOpen, ListTodo
} from 'lucide-react';
import { PURCHASE_CATEGORIES } from '../../purchase/constants/menu';
import { prefetchIntentProps } from '../../utils/routePrefetch';
import useMarketingAccess from '../../marketing/access/useMarketingAccess';
import useSalesAccess from '../../sales/access/useSalesAccess';
import { allows as salesAllows, canViewModule as canViewSalesModule } from '../../sales/access/catalog';
import useProductionAccess from '../../production/access/useProductionAccess';
import { allows as productionAllows } from '../../production/access/catalog';
import usePurchaseAccess from '../../purchase/access/usePurchaseAccess';
import { allows as purchaseAllows } from '../../purchase/access/catalog';
import usePurchaseSidebarCounts from '../../purchase/hooks/usePurchaseSidebarCounts';
import useSalesSidebarCounts from '../../sales/hooks/useSalesSidebarCounts';
import useProductionSidebarCounts from '../../production/hooks/useProductionSidebarCounts';
import useMarketingSidebarCounts from '../../marketing/hooks/useMarketingSidebarCounts';

/**
 * ===== SIDEBAR NAVIGATION (PR Pattern) =====
 *
 * Reproduces the exact sidebar behaviour from the PR (Purchase Requisition)
 * implementation:
 *
 *  NavGroup  — top-level collapsible module (Marketing, Sales)
 *  NavSubGroup — second-level collapsible category within a NavGroup
 *  LeafItem  — third-level navigation item with optional count badge
 *
 * Behaviour:
 *  - Route-aware active state (highlighted item matches URL)
 *  - Auto-expand parent on route change (the category containing the
 *    current page expands automatically)
 *  - Accordion: only one sub-group open at a time within each NavGroup
 *  - User toggle wins over route-based auto-expand
 *  - Parent highlighting when any child is active
 *  - Pending-count badges on leaf items
 *  - Collapsed sidebar shows only icons (no labels)
 */

/* ── Icons ──────────────────────────────────────────────────────────────── */

const ICONS = {
  Users, UserPlus, PhoneCall,
  ClipboardList, FileCheck2, FileSearch, Receipt, TrendingUp,
  FileText, Handshake, ShoppingCart, PackageCheck, Factory, ShieldCheck,
  Package, Truck, FileInput, FileOutput, CreditCard, Wallet,
  Megaphone, MapPin, CalendarDays, ClipboardSignature, DollarSign,
  Navigation, Settings, LayoutDashboard, BarChart3
};

/* ── Data: Marketing, Sales & Production trees ─────────────────────────── */

const SALES_NAV_TREE = [
  // ── Marketing ─────────────────────────────────────────────────────────
  {
    key: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    children: [
      // `countKey` + `countSource: 'marketing'` drive the pending-work badge
      // (marketing/hooks/useMarketingSidebarCounts): Marketing records waiting
      // on a person — Draft, Pending or Pending Approval.
      { key: 'marketingHub', label: 'Offline Marketing', path: '/marketing', countKey: 'offlineMarketing', countSource: 'marketing', match: (p) => p === '/marketing' || (p.startsWith('/marketing') && !p.startsWith('/marketing/dashboard') && !p.startsWith('/marketing/settings') && !p.startsWith('/marketing/travel') && !p.startsWith('/marketing/follow') && !p.startsWith('/marketing/q-form') && !p.startsWith('/marketing/expenses') && !p.startsWith('/marketing/calendar') && !p.startsWith('/marketing/visit') && !p.startsWith('/marketing/map')) },
      { key: 'marketingSettings', label: 'Marketing Settings', icon: Settings, path: '/marketing/settings', match: (p) => p.startsWith('/marketing/settings') },
    ],
  },
  // ── Sales ─────────────────────────────────────────────────────────────
  {
    key: 'sales',
    label: 'Sales',
    icon: LayoutDashboard,
    children: [
      // Order is significant — the sidebar renders these top to bottom:
      // Sales Dashboard → CRM → CPR → Sales Execution → Documents →
      // Sales Reports → Sales Settings. Labels, icons, paths, match rules
      // and active-state behaviour are unchanged; only the sequence differs.
      { key: 'salesDashboard', label: 'Sales Dashboard', icon: BarChart3, path: '/sales/dashboard', match: (p) => p.startsWith('/sales/dashboard') },
      // CRM — single parent module with internal tabs.
      // `countKey` + `countSource` drive the pending badge (sales/hooks/
      // useSalesSidebarCounts): open follow-ups.
      {
        key: 'crm',
        label: 'CRM',
        icon: Users,
        path: '/crm',
        countKey: 'crm',
        countSource: 'sales',
        // /contacts belongs to CRM too: the Contacts submodule is a CRM tab with
        // its own deep-linkable route, so the sidebar must stay highlighted there.
        match: (p) => p.startsWith('/crm') || p.startsWith('/leads') || p.startsWith('/clients') || p.startsWith('/contacts') || p.startsWith('/followups'),
      },
      // CPR — single parent module with internal tabs
      {
        key: 'cpr',
        label: 'CPR',
        icon: ClipboardList,
        path: '/cprs',
        countKey: 'cpr',
        countSource: 'sales',
        match: (p) => p.startsWith('/cpr') || p.startsWith('/cprs') || p.startsWith('/cost-workouts') || p.startsWith('/profit-workouts'),
      },
      // Sales Execution — single parent module with internal tabs
      {
        key: 'salesExec',
        label: 'Sales Execution',
        icon: TrendingUp,
        path: '/sales',
        countKey: 'salesExec',
        countSource: 'sales',
        match: (p) => p === '/sales' || p.startsWith('/sales?') || p.startsWith('/quotations') || p.startsWith('/sales-contracts') || p.startsWith('/sales-orders') || p.startsWith('/proforma-invoices') || p.startsWith('/delivery-challans') || p.startsWith('/invoices') || p.startsWith('/credit-notes') || p.startsWith('/payment-receipts'),
      },
      // Flat entries (no children — like PR's Dashboard / Settings within Purchase)
      // No `countKey`: the shared Documents repository shows no pending badge in
      // the Sales group (CRM / CPR / Sales Execution are the badged entries).
      { key: 'documents', label: 'Documents', path: '/documents', match: (p) => p.startsWith('/documents') },
      { key: 'salesReports', label: 'Sales Reports', path: '/sales/reports', match: (p) => p.startsWith('/sales/reports') },
      { key: 'salesSettings', label: 'Sales Settings', path: '/sales/settings', match: (p) => p.startsWith('/sales/settings') },
    ],
  },
  // ── Purchase ─────────────────────────────────────────────────────────
  {
    key: 'purchase',
    label: 'Purchase',
    icon: ShoppingCart,
    children: PURCHASE_CATEGORIES.map((category) => {
      const categoryIcons = {
        PieChart,
        Building2,
        Mail,
        FolderOpen,
        ListTodo,
        ClipboardList,
        FileText,
        Receipt,
        Truck,
        BarChart3,
        Settings,
      };
      const CategoryIcon = categoryIcons[category.icon] || ShoppingCart;
      return {
        key: category.key,
        label: category.label,
        icon: CategoryIcon,
        path: category.href,
        // The category's pending-count key (constants/menu.js). Entries without
        // one (Dashboard, Reports, Settings) carry no pending workload and
        // therefore never render a badge.
        countKey: category.countKey,
        countSource: 'purchase',
        match: (p) => p === category.href || p.startsWith(`${category.href}/`),
      };
    }),
  },
  // ── Production ────────────────────────────────────────────────────────
  // Static flat submenu: every item is defined here and always rendered the
  // moment the group opens. The current route only drives the active/highlight
  // state — it never changes which child items exist.
  {
    key: 'production',
    label: 'Production',
    icon: Factory,
    children: [
      { key: 'prodDashboard', label: 'Production', icon: Factory, path: '/production', match: (p) => p === '/production' },
      // `countKey` + `countSource: 'production'` drive the pending-work badge
      // (production/hooks/useProductionSidebarCounts). Dashboard, Reports and
      // Settings carry none: they have no pending workload.
      { key: 'prodOrders', label: 'Production Work Orders', icon: FileCheck2, path: '/production/orders', countKey: 'orders', countSource: 'production', match: (p) => p.startsWith('/production/orders') },
      { key: 'prodTv', label: 'Technical Verification', icon: ShieldCheck, path: '/production/technical-verification', countKey: 'technicalVerification', countSource: 'production', match: (p) => p.startsWith('/production/technical-verification') },
      { key: 'prodDrawings', label: 'Drawings', icon: FileText, path: '/production/drawings', countKey: 'drawings', countSource: 'production', match: (p) => p.startsWith('/production/drawings') },
      { key: 'prodModels', label: 'Models', icon: Box, path: '/production/models', countKey: 'models', countSource: 'production', match: (p) => p.startsWith('/production/models') },
      { key: 'prodCasting', label: 'Casting', icon: Flame, path: '/production/casting', countKey: 'casting', countSource: 'production', match: (p) => p.startsWith('/production/casting') },
      { key: 'prodFabrication', label: 'Fabrication', icon: Layers, path: '/production/fabrication', countKey: 'fabrication', countSource: 'production', match: (p) => p.startsWith('/production/fabrication') },
      // Machine Shop — the machining stages between Fabrication and Assembly.
      // The module has always been routable at /production/machine-shop (and is
      // linked from order journeys, KPI cards and the Machine Utilization
      // report), but this sidebar entry was missing, so the page could only be
      // reached by deep link. Placed here to match the department order used by
      // the parameter/master option lists.
      { key: 'prodMachineShop', label: 'Machine Shop', icon: Wrench, path: '/production/machine-shop', countKey: 'machineShop', countSource: 'production', match: (p) => p.startsWith('/production/machine-shop') },
      { key: 'prodAssembly', label: 'Assembly', icon: Hammer, path: '/production/assembly', countKey: 'assembly', countSource: 'production', match: (p) => p.startsWith('/production/assembly') },
      { key: 'prodQuality', label: 'Quality', icon: ClipboardCheck, path: '/production/quality', countKey: 'quality', countSource: 'production', match: (p) => p.startsWith('/production/quality') },
      { key: 'prodPacking', label: 'Packing', icon: Package, path: '/production/packing', countKey: 'packing', countSource: 'production', match: (p) => p.startsWith('/production/packing') },
      { key: 'prodDispatch', label: 'Dispatch', icon: Truck, path: '/production/dispatch', countKey: 'dispatch', countSource: 'production', match: (p) => p.startsWith('/production/dispatch') },
      // Documents — the Production module's own document explorer, the counterpart
      // of the Sales group's Documents entry. It reuses the existing document
      // repository; no Production entry is renamed, reordered or removed.
      // No `countKey`: the Production document explorer shows no pending badge
      // (the badged Production entries are the work queues above it).
      { key: 'prodDocuments', label: 'Documents', icon: FolderOpen, path: '/production/documents', match: (p) => p.startsWith('/production/documents') },
      { key: 'prodReports', label: 'Reports', icon: BarChart3, path: '/production/reports', match: (p) => p.startsWith('/production/reports') },
      { key: 'prodSettings', label: 'Settings', icon: Settings, path: '/production/settings', match: (p) => p.startsWith('/production/settings') },
    ],
  },
];

/* ── Purchase destinations → their Access Management area ──────────────── */

const PURCHASE_NAV_AREAS = {
  'purchase-dashboard': 'dashboard',
  'work-queue': 'workQueue',
  'purchase-requisition': 'requisition',
  'vendor-management': 'vendors',
  'rfq-quotations': 'rfq',
  'purchase-orders': 'orders',
  logistics: 'logistics',
  'purchase-invoices': 'invoices',
  'purchase-documents': 'documents',
  'purchase-reports': 'reports',
  'purchase-settings': 'settings'
};

/* ── Production destinations → their Access Management area ─────────────── */

const PRODUCTION_NAV_AREAS = {
  prodDashboard: 'dashboard',
  prodOrders: 'orders',
  prodTv: 'technicalVerification',
  prodDrawings: 'drawings',
  prodModels: 'models',
  prodCasting: 'casting',
  prodFabrication: 'fabrication',
  prodMachineShop: 'machineShop',
  prodAssembly: 'assembly',
  prodQuality: 'quality',
  prodPacking: 'packing',
  prodDispatch: 'dispatch',
  prodDocuments: 'documents',
  prodReports: 'reports',
  prodSettings: 'settings'
};

/* ── Helpers ────────────────────────────────────────────────────────────── */

/**
 * Find the best-matching leaf and all ancestor keys for the given pathname.
 * Returns { leaf, ancestors } where ancestors is the chain of group/subgroup
 * keys from root to the leaf's parent.
 */
function findActiveRoute(nodes, pathname, ancestors = []) {
  for (const node of nodes) {
    if (node.children) {
      const found = findActiveRoute(node.children, pathname, [...ancestors, node.key]);
      if (found) return found;
    } else if (node.match && node.match(pathname)) {
      return { leaf: node.key, ancestors };
    }
  }
  return null;
}

/** Returns true if the node (or any descendant) matches the search query. */
function matchesQuery(node, query) {
  if (!query) return true;
  if (node.label.toLowerCase().includes(query)) return true;
  return (node.children || []).some((c) => matchesQuery(c, query));
}

/* ── PR-style components ────────────────────────────────────────────────── */

/**
 * NavGroup — top-level collapsible module (e.g. "Marketing", "Sales").
 * PR reference: the "Purchase" NavGroup.
 * Behaviour:
 *  - Click toggles expand/collapse
 *  - is-parent-active when any descendant is route-active
 *  - Chevron rotates with open state
 *  - Tooltip in collapsed mode (handled by parent AppLayout)
 */
function NavGroup({ icon: Icon, label, open, onToggle, children, id, active = false }) {
  return (
    <div className="sb-group" data-open={open}>
      <button
        type="button"
        onClick={onToggle}
        className={`sb-nav-item${active ? ' is-parent-active' : ''}`}
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
      >
        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="sb-label sb-label--flex">{label}</span>
        <span className="sb-chevron-btn" aria-hidden="true">
          <ChevronDown className={`sb-group-chevron${open ? ' rotated' : ''}`} />
        </span>
      </button>
      <div className="sb-group-children" id={id}>
        <div className="sb-group-children-inner">{children}</div>
      </div>
    </div>
  );
}

/**
 * NavSubGroup — second-level collapsible category (e.g. "CRM", "CPR").
 * PR reference: the NavSubGroup used for Purchase sub-categories.
 * Behaviour:
 *  - Accordion: only one sub-group open at a time within its parent
 *  - Active highlight + green left bar when route matches
 *  - Chevron rotates with open state
 */
function NavSubGroup({ icon: Icon, label, open, onToggle, id, children, active = false }) {
  return (
    <div className="sb-subgroup" data-open={open}>
      <button
        type="button"
        onClick={onToggle}
        className={`sb-subitem sb-subitem--group${active ? ' is-active' : ''}`}
        aria-expanded={open}
        aria-controls={id}
        aria-current={active ? 'page' : undefined}
      >
        {Icon && <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />}
        <span className="sb-subitem-label">{label}</span>
        <span className="sb-chevron-btn" aria-hidden="true">
          <ChevronDown className={`sb-subgroup-chevron${open ? ' rotated' : ''}`} />
        </span>
      </button>
      <div className="sb-subgroup-children" id={id}>
        <div className="sb-subgroup-children-inner">{children}</div>
      </div>
    </div>
  );
}

/**
 * LeafItem — third-level navigation item with optional count badge.
 * PR reference: the LeafItem component used for Purchase leaf items.
 * Behaviour:
 *  - Green highlight + left bar when active
 *  - Count badge (orange pulsing when pending > 0)
 *  - Click navigates to the route
 */
function LeafItem({ label, count, pending = false, active, onClick, path }) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...prefetchIntentProps(path)}
      className={`sb-leaf${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <span className="sb-leaf-label">{label}</span>
      {count > 0 && (
        <span className={`sb-count-badge${pending ? ' is-pending' : ''}`}>
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * FlatSubItem — a direct child within a NavGroup that has NO children
 * (e.g. "Marketing Dashboard" inside the Marketing group, or "Sales Reports"
 * inside the Sales group).  Uses the same subitem--group style as PR's flat
 * Purchase Dashboard entry.
 *
 * `count` is optional and only passed by the Purchase categories: it renders
 * the SAME badge the third-level leaves use (`.sb-count-badge`, orange and
 * pulsing while the count is positive), right-aligned by the label's
 * `flex: 1`. A zero/absent count renders nothing at all.
 */
function FlatSubItem({ icon: Icon, label, active, onClick, path, count = 0 }) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...prefetchIntentProps(path)}
      className={`sb-subitem sb-subitem--group${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      {Icon && <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />}
      <span className="sb-subitem-label">{label}</span>
      {count > 0 && (
        <span className="sb-count-badge is-pending" aria-label={`${count} pending`}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */

/**
 * SalesNav — the PR-pattern sidebar for Marketing + Sales.
 *
 * Props:
 *  - pathname:  current location.pathname (route-based active state)
 *  - search:    location.search (for ?status=New etc.)
 *  - query:     active menu-search text (filters nodes; groups pin open)
 *  - counts:    pending-approval badge counts keyed by node key
 *  - onNavigate: called with the route when a leaf is clicked
 *
 * The Purchase submenu's per-category badges are read HERE, from the Purchase
 * module's own count store (hooks/usePurchaseSidebarCounts), rather than being
 * threaded in as a prop: the sidebar is the only consumer that needs them, so
 * there is exactly one hop from the store to the badge and no prop that can go
 * missing. They are kept in their own map because Purchase keys such as
 * 'invoices' would otherwise collide with the Sales leaf of the same name.
 */
export default function SalesNav({
  pathname,
  search = '',
  query = '',
  counts = {},
  onNavigate
}) {
  // Marketing Access Management: the module's own destinations are hidden when
  // the user's View permission for them is OFF. The page route and every API
  // behind it are gated independently (MarketingAccessGuard + backend), so this
  // is presentation only — never the access boundary.
  const { can, canViewHub } = useMarketingAccess();
  // Sales Access Management: the same rule for the Sales tree. A destination is
  // hidden when the user's View permission for it is OFF; the page route and
  // every API behind it are gated independently (SalesAccessGuard + backend),
  // so this is presentation only — never the access boundary.
  const { permissions: salesPermissions } = useSalesAccess();
  // Production Access Management: a Production destination is hidden when the
  // user's View permission for its area is OFF; the page route and every API
  // behind it are gated independently (ProductionAccessGuard + backend), so
  // this is presentation only — never the access boundary.
  const { permissions: productionPermissions } = useProductionAccess();
  // Purchase Access Management: a Purchase destination is hidden when the
  // user's View permission for its area is OFF; the page route and every API
  // behind it are gated independently (PurchaseAccessGuard + backend), so this
  // is presentation only — never the access boundary.
  const { permissions: purchasePermissions } = usePurchaseAccess();
  // Per-submodule pending counts for the Purchase group (shared store: one
  // deferred, cached, single-flight batch that refreshes on Purchase writes).
  const { counts: purchaseCounts } = usePurchaseSidebarCounts();
  // The same, for the Sales group: CRM / CPR / Sales Execution.
  const { counts: salesCounts } = useSalesSidebarCounts();
  // And for the Production group: pending work per submodule.
  const { counts: productionCounts } = useProductionSidebarCounts();
  // And for the Marketing group: records waiting on a person.
  const { counts: marketingCounts } = useMarketingSidebarCounts();
  const visibleTree = useMemo(() => SALES_NAV_TREE
    .map((group) => {
      if (group.key === 'marketing') {
        const children = (group.children || []).filter((child) => {
          if (child.key === 'marketingHub') return canViewHub;
          if (child.key === 'marketingSettings') return can('settings', 'view');
          return true;
        });
        return { ...group, children };
      }
      if (group.key === 'sales') {
        const children = (group.children || []).filter((child) => {
          switch (child.key) {
            case 'salesDashboard': return salesAllows(salesPermissions, 'dashboard', 'view');
            case 'crm': return canViewSalesModule(salesPermissions, 'crm');
            case 'cpr': return canViewSalesModule(salesPermissions, 'cpr');
            case 'salesExec': return canViewSalesModule(salesPermissions, 'salesExec');
            case 'documents': return salesAllows(salesPermissions, 'documents', 'view');
            case 'salesReports': return salesAllows(salesPermissions, 'reports', 'view');
            case 'salesSettings': return salesAllows(salesPermissions, 'settings', 'view');
            default: return true;
          }
        });
        return { ...group, children };
      }
      if (group.key === 'production') {
        const children = (group.children || []).filter((child) => {
          const area = PRODUCTION_NAV_AREAS[child.key];
          return area ? productionAllows(productionPermissions, area, 'view') : true;
        });
        return { ...group, children };
      }
      if (group.key === 'purchase') {
        const children = (group.children || []).filter((child) => {
          const area = PURCHASE_NAV_AREAS[child.key];
          return area ? purchaseAllows(purchasePermissions, area, 'view') : true;
        });
        return { ...group, children };
      }
      return group;
    })
    .filter((group) => !group.children || group.children.length > 0),
  [can, canViewHub, salesPermissions, productionPermissions, purchasePermissions]);

  // ── State ────────────────────────────────────────────────────────────
  // NavGroup open state: one per top-level group (marketing, sales).
  // null = follow the route (auto-open while inside the module);
  // true/false = explicit user choice that wins over the route.
  const [groupOpen, setGroupOpen] = useState({});

  // Sub-group accordion: only one sub-group open at a time within a group.
  // User clicks only; the route never opens a sub-group (see effect below).
  const [openSubGroup, setOpenSubGroup] = useState({});

  // ── Route-aware active state ─────────────────────────────────────────
  const routeState = useMemo(() => {
    const path = pathname;
    let bestLeaf = null;
    let bestGroupKey = null;
    let bestSubGroupKey = null;

    for (const group of SALES_NAV_TREE) {
      if (!group.children) continue;
      for (const child of group.children) {
        if (child.children) {
          // Sub-group (e.g. CRM → Leads, Clients, Follow-ups)
          for (const leaf of child.children) {
            if (leaf.match && leaf.match(path)) {
              if (!bestLeaf || (leaf.path && bestLeaf.path && leaf.path.length > bestLeaf.path.length) || (!bestLeaf.path)) {
                bestLeaf = leaf;
                bestGroupKey = group.key;
                bestSubGroupKey = child.key;
              }
            }
          }
        } else {
          // Flat entry (e.g. Sales Reports inside Sales)
          if (child.match && child.match(path)) {
            if (!bestLeaf || (child.path && bestLeaf.path && child.path.length > bestLeaf.path.length) || (!bestLeaf.path)) {
              bestLeaf = child;
              bestGroupKey = group.key;
            }
          }
        }
      }
    }

    const activeGroups = new Set();
    const activeSubGroups = new Set();
    if (bestGroupKey) activeGroups.add(bestGroupKey);
    if (bestSubGroupKey) activeSubGroups.add(bestSubGroupKey);

    return { leaf: bestLeaf, bestGroupKey, bestSubGroupKey, activeGroups, activeSubGroups };
  }, [pathname]);

  const activeLeafKey = routeState.leaf?.key;

  // ── Auto-expand sub-group on route change ────────────────────────────
  // PR pattern: the section containing the current route auto-expands
  // so the active child is always visible. This runs on ROUTE CHANGE only
  // — it picks exactly one sub-group and never fights the user's
  // click-to-toggle.
  useEffect(() => {
    if (routeState.bestSubGroupKey) {
      const timer = setTimeout(() => {
        setOpenSubGroup((prev) => ({ ...prev, [routeState.bestSubGroupKey]: true }));
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [routeState.bestSubGroupKey]);

  // ── Auto-expand NavGroup on route change ─────────────────────────────
  // PR pattern: while inside a module, the group stays open unless the
  // user explicitly toggled it. Leaving the module clears the user toggle
  // so re-entering auto-opens.
  const wasInGroupRef = useRef({});
  useEffect(() => {
    for (const group of SALES_NAV_TREE) {
      const isInside = routeState.activeGroups.has(group.key);
      const wasInside = wasInGroupRef.current[group.key] || false;

      if (wasInside && !isInside) {
        // Left the module — clear user toggle so re-entering auto-opens
        setGroupOpen((prev) => {
          const next = { ...prev };
          delete next[group.key]; // null/undefined = follow route
          return next;
        });
      }
      wasInGroupRef.current[group.key] = isInside;
    }
  }, [routeState.activeGroups]);

  // ── Group open state (PR pattern) ───────────────────────────────────
  // null/undefined = follow the route (auto-open while inside the module)
  // true/false = explicit user choice that wins over the route
  const getGroupOpen = useCallback((groupKey) => {
    const userChoice = groupOpen[groupKey];
    if (userChoice !== undefined) return userChoice;
    // Follow the route
    return routeState.activeGroups.has(groupKey);
  }, [groupOpen, routeState.activeGroups]);

  const toggleGroup = useCallback((groupKey) => {
    setGroupOpen((prev) => {
      const currentlyOpen = prev[groupKey] !== undefined ? prev[groupKey] : routeState.activeGroups.has(groupKey);
      return { ...prev, [groupKey]: !currentlyOpen };
    });
  }, [routeState.activeGroups]);

  // ── Sub-group toggle (accordion — one at a time per group) ───────────
  const toggleSubGroup = useCallback((groupKey, subGroupKey) => {
    if (query) return; // inert while searching
    setOpenSubGroup((prev) => {
      const current = prev[subGroupKey];
      return { ...prev, [subGroupKey]: !current };
    });
  }, [query]);

  // ── Navigate ────────────────────────────────────────────────────────
  const navigateTo = useCallback((path) => {
    onNavigate(path);
  }, [onNavigate]);

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <>
      {visibleTree.map((group) => {
        if (!matchesQuery(group, query)) return null;
        const GroupIcon = group.icon;
        const groupIsOpen = getGroupOpen(group.key);
        const isGroupActive = routeState.activeGroups.has(group.key);

        return (
          <NavGroup
            key={group.key}
            icon={GroupIcon}
            label={group.label}
            open={groupIsOpen}
            active={isGroupActive}
            onToggle={() => toggleGroup(group.key)}
            id={`sb-${group.key}`}
          >
            {(group.children || []).map((child) => {
              if (!matchesQuery(child, query)) return null;

              // Flat entry (no children) — like PR's Dashboard within Purchase
              if (!child.children) {
                const flatActive = activeLeafKey === child.key;
                const ChildIcon = child.icon || group.icon;
                // Each module's counts live in its own store, so keys such as
                // 'invoices' can never collide across modules.
                const countSource = child.countSource === 'purchase'
                  ? purchaseCounts
                  : child.countSource === 'production'
                    ? productionCounts
                    : child.countSource === 'marketing'
                      ? marketingCounts
                      : salesCounts;
                const flatCount = child.countKey
                  ? Number(countSource?.[child.countKey] || 0)
                  : 0;
                return (
                  <FlatSubItem
                    key={child.key}
                    icon={ChildIcon}
                    label={child.label}
                    active={flatActive}
                    path={child.path}
                    count={flatCount}
                    onClick={() => navigateTo(child.path)}
                  />
                );
              }

              // Sub-group (e.g. CRM, CPR, Sales Execution)
              const isSubGroupRouteActive = routeState.activeSubGroups.has(child.key);
              const subGroupOpen = query ? true : Boolean(openSubGroup[child.key]);

              return (
                <NavSubGroup
                  key={child.key}
                  icon={child.icon}
                  label={child.label}
                  active={isSubGroupRouteActive}
                  open={subGroupOpen}
                  onToggle={() => toggleSubGroup(group.key, child.key)}
                  id={`sb-${group.key}-${child.key}`}
                >
                  {(child.children || []).map((leaf) => {
                    if (!matchesQuery(leaf, query)) return null;
                    return (
                      <LeafItem
                        key={leaf.key}
                        label={leaf.label}
                        count={counts?.[leaf.key]}
                        pending={counts?.[leaf.key] > 0}
                        active={activeLeafKey === leaf.key}
                        path={leaf.path}
                        onClick={() => navigateTo(leaf.path)}
                      />
                    );
                  })}
                </NavSubGroup>
              );
            })}
          </NavGroup>
        );
      })}
    </>
  );
}
