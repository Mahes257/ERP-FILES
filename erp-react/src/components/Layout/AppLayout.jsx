import { createPortal } from 'react-dom';
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Settings, Moon, Sun, Bell, LogOut, Search, Menu, Clock, ChevronDown, CalendarDays,
  PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import authService, { clearAuth, getStoredRefreshToken, getStoredUser } from '../../services/authService';
import { useTheme, usePendingApprovals, useNotifications, PageLoader } from '../Common';
import { useLocalAutoLogin } from '../Auth/localAutoLoginContext';
import SalesNav from './SalesNav';
import SidebarNotificationBell from './SidebarNotificationBell';
import NotificationBell from '../../purchase/components/NotificationBell';
import { prefetchIntentProps, usePrefetchOnIntent, useWarmModuleContainers, useWarmNeighbourhood } from '../../utils/routePrefetch';
import { clearMarketingAccess } from '../../marketing/access/useMarketingAccess';
import { clearSalesAccess } from '../../sales/access/useSalesAccess';
import { clearPurchaseAccess } from '../../purchase/access/usePurchaseAccess';
import useStickyPageHeader from '../../hooks/useStickyPageHeader';
import { useAllocatedCount } from '../../pages/calendar/calendarAllocatedCount';
import './AppLayout.css';

const PAGE_TITLES = [
  { pattern: /^\/dashboard/, title: 'Dashboard' },
  { pattern: /^\/contacts/, title: 'Contacts' },
  { pattern: /^\/crm/, title: 'Leads' },
  { pattern: /^\/sales$/, title: 'Sales Execution' },
  { pattern: /^\/sales\/dashboard/, title: 'Sales Dashboard' },
  { pattern: /^\/leads\/(new|\d+\/edit)/, title: 'Leads' },
  { pattern: /^\/leads/, title: 'Leads' },
  { pattern: /^\/clients/, title: 'Clients' },
  { pattern: /^\/followups/, title: 'Follow-ups' },
  { pattern: /^\/marketing\/settings/, title: 'Marketing Settings' },
  { pattern: /^\/marketing\/dashboard/, title: 'Marketing Dashboard' },
  { pattern: /^\/marketing\/calendar/, title: 'Calendar' },
  { pattern: /^\/marketing\/follow-ups/, title: 'Visit Follow-up / Extension' },
  { pattern: /^\/marketing\/visits/, title: 'Marketing Visit Entry' },
  { pattern: /^\/marketing\/q-forms/, title: 'Q Forms' },
  { pattern: /^\/marketing\/travel-scheduler/, title: 'Travel Scheduler' },
  { pattern: /^\/marketing\/travel-planners/, title: 'Travel Registry' },
  { pattern: /^\/marketing\/expenses/, title: 'Marketing Expenses' },
  { pattern: /^\/marketing\/map/, title: 'Marketing Map' },
  { pattern: /^\/marketing/, title: 'Offline Marketing' },
  { pattern: /^\/cprs/, title: 'CPR' },
  { pattern: /^\/cost-workouts/, title: 'Cost Workout' },
  { pattern: /^\/profit-workouts/, title: 'Profit Workout' },
  { pattern: /^\/quotations/, title: 'Sales Execution' },
  { pattern: /^\/sales-contracts/, title: 'Sales Execution' },
  { pattern: /^\/sales-orders/, title: 'Sales Execution' },
  { pattern: /^\/delivery-challans/, title: 'Sales Execution' },
  { pattern: /^\/proforma-invoices/, title: 'Sales Execution' },
  { pattern: /^\/invoices/, title: 'Sales Execution' },
  { pattern: /^\/payment-receipts/, title: 'Sales Execution' },
  { pattern: /^\/credit-notes/, title: 'Sales Execution' },
  { pattern: /^\/documents/, title: 'Documents' },
  { pattern: /^\/sales\/reports/, title: 'Sales Reports' },
  { pattern: /^\/sales\/settings/, title: 'Sales Settings' },
  { pattern: /^\/production\/$/, title: 'Production Dashboard' },
  { pattern: /^\/production\/orders/, title: 'Production Work Orders' },
  { pattern: /^\/production\/technical-verification/, title: 'Technical Verification' },
  { pattern: /^\/production\/drawings/, title: 'Drawings' },
  { pattern: /^\/production\/models/, title: 'Models' },
  { pattern: /^\/production\/casting/, title: 'Casting' },
  { pattern: /^\/production\/fabrication/, title: 'Fabrication' },
  { pattern: /^\/production\/assembly/, title: 'Assembly' },
  { pattern: /^\/production\/quality/, title: 'Quality' },
  { pattern: /^\/production\/packing/, title: 'Packing' },
  { pattern: /^\/production\/dispatch/, title: 'Dispatch' },
  { pattern: /^\/production\/documents/, title: 'Documents' },
  { pattern: /^\/production\/reports/, title: 'Production Reports' },
  { pattern: /^\/production\/settings/, title: 'Production Settings' },
  { pattern: /^\/production/, title: 'Production' },
  // Settings area: the Advanced Settings landing page plus its destinations.
  // More specific patterns come first — PAGE_TITLES is read with .find().
  { pattern: /^\/settings\/financial/, title: 'Financial Settings' },
  { pattern: /^\/settings/, title: 'Settings' },
  { pattern: /^\/notifications/, title: 'Notifications' }
];

// Sidebar preference — persisted exactly like the theme ('erp-theme').
const SIDEBAR_OPEN_KEY = 'erp-sidebar-open';

/**
 * The sidebar's click-chosen state, read once at mount. The toggle button is the
 * only control (no pointer event opens or closes the rail), so this value is the
 * whole state: '0' means the user collapsed it, anything else is the open rail.
 */
function getInitialSidebarOpen() {
  try {
    return localStorage.getItem(SIDEBAR_OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

/* The menu's own scroll offset, held outside the component so that a remount of
   the shell cannot lose the user's place in a long menu. */
let sidebarNavScrollTop = 0;

function useMediaQuery(query, onChange) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handleChange = () => {
      setMatches(mql.matches);
      onChange?.(mql.matches);
    };
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [query, onChange]);

  return matches;
}

function NavItem({ icon: Icon, label, active, onClick, onTipStart, onTipEnd, hidden, disabled, path }) {
  const intent = usePrefetchOnIntent(path);
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      onMouseEnter={onTipStart}
      onMouseLeave={onTipEnd}
      onFocus={(event) => {
        onTipStart?.(event);
        intent.onFocus(event);
      }}
      onBlur={(event) => {
        onTipEnd?.(event);
        intent.onBlur(event);
      }}
      onPointerEnter={intent.onPointerEnter}
      onPointerLeave={intent.onPointerLeave}
      className={`sb-nav-item${active ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      disabled={disabled}
      title={disabled ? `${label} (Coming Soon)` : undefined}
    >
      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="sb-label">{label}</span>
      {disabled && <span className="sb-coming-soon-badge">Coming Soon</span>}
    </button>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  // Live per-module + parent totals of records awaiting approval across the
  // approval-enabled modules (CPR with its Technical Verification / Cost /
  // Profit Workouts, Quotations, Sales Contracts, Sales Orders, Credit Notes).
  // Backend-computed by GET /approvals/summary.
  const {
    counts: pendingCounts,
    customerPurchaseRequest,
    salesExecution,
    production,
    purchase
  } = usePendingApprovals();
  // The sidebar's "Pending Approvals" badge is ONE aggregate for the whole ERP:
  // the Sales parents (CPR family + Sales Execution) plus the Production
  // approval queues. Every number comes from the backend summary and a pending
  // record belongs to exactly one module, so nothing is counted twice.
  const salesPendingApprovalCount = Number(customerPurchaseRequest || 0) + Number(salesExecution || 0);
  // Backend-gated by the authority that can action each status: the two
  // approval queues need PRODUCTION_APPROVE, released 'Pending' work orders
  // need PRODUCTION_EDIT. A user who can do neither receives 0, so the badge
  // never claims work they cannot do.
  const productionPendingApprovalCount = Number(production || 0);
  // Purchase approval queues (PR / Vendor / RFQ / PO / Invoice), already gated
  // by PURCHASE_APPROVE on the server.
  const purchasePendingApprovalCount = Number(purchase || 0);
  const pendingApprovalCount = salesPendingApprovalCount + productionPendingApprovalCount + purchasePendingApprovalCount;
  // The badge is one entry for the whole ERP, so it opens the dedicated
  // Pending Approvals page: one list of every genuine, still-actionable
  // approval from every module (GET /approvals/pending), each row linking to
  // the record where its own approval action lives.
  const pendingApprovalsPath = '/pending-approvals';
  const { unreadCount: notificationUnreadCount } = useNotifications();

  const [mobileOpen, setMobileOpen] = useState(false);
  // Desktop open/collapsed state. Only the toggle button changes it, and the
  // chosen state stays until the next click.
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarOpen);
  const [tooltip, setTooltip] = useState(null);
  const [menuSearch, setMenuSearch] = useState('');
  const [topUserOpen, setTopUserOpen] = useState(false);

  // Navigation chunk warming (uses the shared shell, so it survives route
  // changes): the routes reachable from the current screen, plus the heavy
  // module route tables once, while the browser is idle.
  useWarmNeighbourhood(location.pathname);
  useWarmModuleContainers();

  const handleMediaChange = useCallback((mobile) => {
    // A tooltip shown for a pointer that no longer exists would otherwise stick.
    setTooltip(null);
    if (!mobile) {
      // Back on desktop the rail follows the user's own open/collapsed choice.
      setMobileOpen(false);
    }
  }, []);

  const isMobile = useMediaQuery('(max-width: 768px)', handleMediaChange);

  // Local auto-login mode (backend-gated, this machine only): there is no
  // sign-in page locally, so signing out restores the configured session and
  // returns to the Dashboard instead of routing to /signin.
  const { enabled: localAutoLoginEnabled, signIn: localAutoLoginSignIn } = useLocalAutoLogin();

  const user = getStoredUser();
  const expanded = isMobile ? mobileOpen : sidebarOpen;

  const asideRef = useRef(null);
  const navRef = useRef(null);
  const hamburgerRef = useRef(null);
  const workspaceRef = useRef(null);
  const topUserRef = useRef(null);

  // Keep each page's top control section (breadcrumb, title, actions, tabs,
  // filters, search) pinned under the topbar while its content scrolls.
  useStickyPageHeader(workspaceRef);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && isMobile && mobileOpen) {
        setMobileOpen(false);
        hamburgerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    if (isMobile && mobileOpen) {
      asideRef.current?.focus();
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return undefined;
  }, [isMobile, mobileOpen]);

  // Close the top-right profile menu when clicking outside it.
  useEffect(() => {
    if (!topUserOpen) return undefined;
    const onDocMouseDown = (e) => {
      if (topUserRef.current && !topUserRef.current.contains(e.target)) {
        setTopUserOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [topUserOpen]);

  // Close the profile menu whenever the route changes.
  useEffect(() => {
    setTopUserOpen(false);
  }, [location.pathname]);

  // Remember the open/collapsed choice the way the theme is remembered.
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_OPEN_KEY, sidebarOpen ? '1' : '0');
    } catch {
      // storage unavailable - the choice still applies for this session
    }
  }, [sidebarOpen]);

  /**
   * Keep the menu's scroll position across navigation.
   *
   * `.sb-nav` is a scroll container of its own. A route change re-renders it — one
   * group auto-opens for the new active item, the group the user just left closes,
   * and the browser clamps the offset whenever the content gets shorter. A
   * collapsed rail hides the group bodies altogether, which zeroes it outright, so
   * the position is only recorded while the rail is open and is re-applied after
   * each route change and each re-expand. The extra frame re-asserts it after the
   * menu's own post-route effects (group auto-expand/collapse) have resized it.
   */
  const handleNavScroll = (event) => {
    if (!expanded) return; // a clamped-to-0 rail is not a position the user chose
    sidebarNavScrollTop = event.currentTarget.scrollTop;
  };

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav || !expanded) return undefined;
    nav.scrollTop = sidebarNavScrollTop;
    const frame = requestAnimationFrame(() => {
      nav.scrollTop = sidebarNavScrollTop;
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded, location.pathname]);

  const go = (path) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
    if (menuSearch) setMenuSearch('');
  };

  const handleSignOut = () => {
    setTopUserOpen(false);
    // Best-effort server-side revocation of the refresh token, then clear the
    // local session regardless of network state.
    const refreshToken = getStoredRefreshToken();
    if (refreshToken) {
      authService.logout(refreshToken).catch(() => {});
    }
    clearAuth();
    // Marketing and Sales permissions are held in memory only: drop them so the
    // next session can never inherit the previous user's access.
    clearMarketingAccess();
    clearSalesAccess();
    clearPurchaseAccess();
    if (localAutoLoginEnabled) {
      // No sign-in page in local mode: start a fresh genuine session for the
      // configured account and land on the Dashboard.
      localAutoLoginSignIn()
        .then((ok) => navigate(ok ? '/dashboard' : '/signin', { replace: true }))
        .catch(() => navigate('/signin', { replace: true }));
      return;
    }
    navigate('/signin', { replace: true });
  };

  const handleOpenSettings = () => {
    setTopUserOpen(false);
    navigate('/settings');
  };

  /**
   * The standalone Calendar URL, as an absolute path.
   *
   * The header renders this as a real link with `target="_blank"`, not a
   * scripted `window.open`: a user-activated link is the one form of new-tab
   * navigation the browser never treats as a blocked popup, and `rel="noopener
   * noreferrer"` gives the new document the same isolation without letting it
   * reach back into this ERP page.
   */
  const calendarHref = `${import.meta.env.BASE_URL || '/'}calendar`;

  /* The Calendar's "Today Allocated" count, read from the same event list,
     ERP feed and pending-time rule the Calendar page uses. `count` is null
     until a real read settles, so the badge never shows a guessed zero. */
  const allocated = useAllocatedCount();

  const showTip = (e, label) => {
    if (isMobile || expanded) {
      setTooltip(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ label, x: rect.right + 12, y: rect.top + rect.height / 2 });
  };

  const hideTip = () => setTooltip(null);

  const activeMenu = location.pathname === '/dashboard' || location.pathname === '/' ? 'Dashboard' : '';

  const title = PAGE_TITLES.find((entry) => entry.pattern.test(location.pathname))?.title || 'Dashboard';

  const avatarLetter = (user?.fullName || 'A').charAt(0).toUpperCase();

  /**
   * Open/close the sidebar. This button is the ONLY control — no pointer event
   * opens or closes the rail — and the chosen state is kept until the next click.
   * On mobile it is the same open/close as the topbar hamburger.
   */
  const toggleSidebar = () => {
    if (isMobile) {
      setMobileOpen((open) => !open);
      return;
    }
    setSidebarOpen((open) => !open);
  };

  const showTipDashboard = (e) => showTip(e, 'Dashboard');
  const showTipToggle = (e) => showTip(e, expanded ? 'Collapse sidebar' : 'Expand sidebar');
  const showTipDark = (e) => showTip(e, 'Dark Mode');
  const showTipBell = (e) => showTip(e, 'Notifications');
  const showTipSignOut = (e) => showTip(e, 'Sign Out');

  // Menu search filter (mirrors VT.Sidebar.filterMenu in the original ERP):
  // items whose label (or a group's child label) contains the query stay visible;
  // groups with a matching child auto-expand while a query is active (the new
  // SalesNav handles this internally for the SALES tree).
  const query = menuSearch.trim().toLowerCase();
  const matchQ = (text) => !query || text.toLowerCase().includes(query);

  return (
    <div className="app-shell flex bg-app font-sans antialiased text-slate-800">
      <aside
        id="app-sidebar"
        ref={asideRef}
        className={`app-sidebar${expanded ? ' expanded' : ''}${isMobile ? ' app-sidebar--mobile' : ''}${isMobile && mobileOpen ? ' is-open' : ''}`}
        aria-label="Sidebar navigation"
        tabIndex={isMobile ? -1 : undefined}
        inert={isMobile ? !mobileOpen : undefined}
        onMouseLeave={() => setTooltip(null)}
      >
        <div className="sb-top">
          {/* Brand */}
          <div className="sb-logo">
            <div className="sb-brand-mark"><div className="sb-brand-dot" /></div>
            <span className="sb-label sb-logo-text">VISHAK TECH</span>
            {/* Sidebar open/close. Stays mounted and reachable in both states. */}
            <button
              type="button"
              className="sb-toggle"
              onClick={toggleSidebar}
              aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
              aria-expanded={expanded}
              aria-controls="app-sidebar"
              onMouseEnter={showTipToggle}
              onMouseLeave={hideTip}
            >
              {expanded
                ? <PanelLeftClose className="w-4 h-4 shrink-0" aria-hidden="true" />
                : <PanelLeftOpen className="w-4 h-4 shrink-0" aria-hidden="true" />}
            </button>
          </div>

          {/* User profile */}
          <div className="sb-profile">
            <div className="sb-avatar" aria-hidden="true">{avatarLetter}</div>
            <div className="sb-profile-info">
              <span className="sb-profile-name">{user?.fullName || 'Admin User'}</span>
              <span className="sb-profile-role">{user?.role || 'Administrator'}</span>
            </div>
          </div>

          {/* Menu search */}
          <div className="sb-search">
            <div className="relative flex items-center">
              <Search className="absolute left-3 w-3.5 h-3.5 text-[#0B4A3D]" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search menu..."
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                className="sb-search-input"
                aria-label="Search menu"
              />
            </div>
          </div>

          {/* Navigation */}
          <nav className="sb-nav" aria-label="Primary" ref={navRef} onScroll={handleNavScroll}>
            <NavItem
              icon={LayoutDashboard}
              label="Dashboard"
              active={activeMenu === 'Dashboard'}
              path="/dashboard"
              onClick={() => go('/dashboard')}
              onTipStart={showTipDashboard}
              onTipEnd={hideTip}
              hidden={!matchQ('Dashboard')}
            />
            {/* NEW SALES NAVIGATION (from-scratch tree — see SalesNav.jsx) */}
            <SalesNav
              pathname={location.pathname}
              search={location.search}
              query={query}
              counts={{
                crm: pendingCounts.leads + pendingCounts.clients + pendingCounts.followups,
                leads: pendingCounts.leads,
                clients: pendingCounts.clients,
                followups: pendingCounts.followups,
                cpr: customerPurchaseRequest,
                cprMain: pendingCounts.cpr,
                cprTv: pendingCounts.cprTv,
                costWorkout: pendingCounts.costWorkout,
                profitWorkout: pendingCounts.profitWorkout,
                salesExec: salesExecution,
                quotations: pendingCounts.quotation,
                salesContracts: pendingCounts.salesContract,
                cpo: pendingCounts.salesOrder,
                proformaInvoices: pendingCounts.proformaInvoice,
                deliveryChallans: pendingCounts.deliveryChallan,
                invoices: pendingCounts.invoice,
                creditNotes: pendingCounts.creditNote,
                paymentReceipts: pendingCounts.paymentReceipt
              }}
              onNavigate={go}
            />


          </nav>
        </div>

        {/* Bottom utilities */}
        <div className="sb-bottom">
          <button
            type="button"
            onClick={toggleTheme}
            className={`sb-nav-item${isDark ? ' is-active is-theme-toggle' : ''}`}
            onMouseEnter={showTipDark}
            onMouseLeave={hideTip}
            aria-label="Dark Mode"
            aria-pressed={isDark}
          >
            {isDark ? <Sun className="w-4 h-4 shrink-0" aria-hidden="true" /> : <Moon className="w-4 h-4 shrink-0" aria-hidden="true" />}
            <span className="sb-label">Dark Mode</span>
          </button>
          <button
            type="button"
            className="sb-nav-item"
            onClick={() => go(pendingApprovalsPath)}
            {...prefetchIntentProps(pendingApprovalsPath)}
            onMouseEnter={(e) => showTip(e, 'Pending Approvals')}
            onMouseLeave={hideTip}
            aria-label={`Pending Approvals (${pendingApprovalCount})`}
            title={
              pendingApprovalCount > 0
                ? `${pendingApprovalCount} pending approval(s) — Sales ${salesPendingApprovalCount}, Production ${productionPendingApprovalCount}, Purchase ${purchasePendingApprovalCount}`
                : 'No pending approvals across Sales, Production or Purchase'
            }
          >
            <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="sb-label">Pending Approvals</span>
            {/* Always visible, including 0: the badge is the ERP-wide
                aggregate, not a "new item" indicator. */}
            <SidebarNotificationBell count={pendingApprovalCount} showZero />
          </button>
          <button
            type="button"
            className="sb-nav-item"
            onClick={() => go('/notifications')}
            {...prefetchIntentProps('/notifications')}
            onMouseEnter={showTipBell}
            onMouseLeave={hideTip}
            aria-label={`Notifications${notificationUnreadCount > 0 ? ` (${notificationUnreadCount} unread)` : ''}`}
          >
            <Bell className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="sb-label">Notifications</span>
            {notificationUnreadCount > 0 && (
              <SidebarNotificationBell count={notificationUnreadCount} />
            )}
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="sb-nav-item sb-nav-item--danger"
            onMouseEnter={showTipSignOut}
            onMouseLeave={hideTip}
            aria-label="Sign Out"
          >
            <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="sb-label">Sign Out</span>
          </button>
        </div>
      </aside>

      {isMobile && mobileOpen && (
        <div className="sb-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      {/* Workspace */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="app-topbar h-14 shrink-0">
          {isMobile && (
            <button
              ref={hamburgerRef}
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              className="p-2 -ml-2 rounded-md text-slate-500 hover:bg-slate-100 transition-colors"
              aria-label="Open sidebar"
              aria-expanded={mobileOpen}
              aria-controls="app-sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <span className="app-topbar-title">{title}</span>
          <div className="app-topbar-actions">
            {/* Calendar lives just left of Dark Mode. It opens the standalone
                calendar page in its OWN browser tab (a real link, so the browser
                never blocks it as a popup), leaving the ERP page the user is
                working on exactly as it was. */}
            <a
              href={calendarHref}
              target="_blank"
              rel="noopener noreferrer"
              className="topbar-icon-btn topbar-calendar-btn"
              aria-label={allocated.count == null
                ? 'Calendar'
                : `Calendar — ${allocated.count} today allocated`}
              title={allocated.count == null
                ? 'Calendar'
                : `Calendar — ${allocated.count} today allocated`}
            >
              <CalendarDays className="w-4 h-4" />
              {allocated.count != null && (
                <span className="topbar-calendar-count" aria-hidden="true">
                  {allocated.count}
                </span>
              )}
            </a>
            <button
              type="button"
              onClick={toggleTheme}
              className="topbar-icon-btn"
              aria-label="Dark Mode"
              aria-pressed={isDark}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <NotificationBell />
            <span className="topbar-sep" aria-hidden="true" />
            <div className="topbar-user-wrap" ref={topUserRef}>
              <button
                type="button"
                className="topbar-user-btn"
                onClick={() => setTopUserOpen((o) => !o)}
                aria-expanded={topUserOpen}
                aria-haspopup="menu"
              >
                <span className="topbar-user-avatar">{avatarLetter}</span>
                <span className="topbar-user-name hidden sm:inline">{user?.fullName || 'Admin User'}</span>
                <ChevronDown className="topbar-user-chevron" />
              </button>
              {topUserOpen && (
                <div className="topbar-user-menu" role="menu">
                  <button
                    type="button"
                    className="topbar-user-menu-item"
                    role="menuitem"
                    onClick={handleOpenSettings}
                  >
                    <Settings className="w-4 h-4" /> Settings
                  </button>
                  <button
                    type="button"
                    className="topbar-user-menu-item text-danger"
                    role="menuitem"
                    onClick={handleSignOut}
                  >
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="app-workspace-content flex-1 min-w-0" ref={workspaceRef}>
          {/* Content-area Suspense boundary: a route whose lazy chunk is
              still downloading shows the loader INSIDE the workspace while
              the sidebar, topbar, theme, session and websocket state stay
              mounted — navigating between modules never re-initialises the
              application shell. */}
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      {!expanded &&
        tooltip &&
        createPortal(
          <span className="sb-tooltip" role="tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
            {tooltip.label}
          </span>,
          document.body
        )}
    </div>
  );
}
