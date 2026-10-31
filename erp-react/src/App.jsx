import { Suspense, lazy, useEffect, useLayoutEffect, useRef } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider, ApiErrorProvider, ErrorBoundary, ErrorPage, PageLoader, ThemeProvider, ExchangeRateProvider, PendingApprovalProvider, NotificationProvider, CurrentUserProvider } from './components/Common';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import LocalAutoLoginGate from './components/Auth/LocalAutoLoginGate';
import { useLocalAutoLogin } from './components/Auth/localAutoLoginContext';
import AppLayout from './components/Layout/AppLayout';
// Route-level View gate for the Marketing module — see marketing/access.
import MarketingAccessGuard from './marketing/access/MarketingAccessGuard';
import { isAuthenticated } from './services/authService';

// Production module: routes + providers live in their own lazily-loaded
// module (see production/routes/productionRoutes.jsx) so the eleven
// Production contexts and page chunks never ship in the initial bundle.
const ProductionRoutes = lazy(() => import('./production/routes/productionRoutes'));
// The standalone 3D model viewer sits outside the Production module tree.
const ModelViewerPage = lazy(() => import('./production/pages/ModelViewerPage'));
const PurchaseRoutes = lazy(() => import('./purchase/routes/purchaseRoutes'));

const SignIn = lazy(() => import('./pages/SignIn'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CRMHub = lazy(() => import('./pages/crm/CRMHub'));
const SalesExecHub = lazy(() => import('./pages/sales/SalesExecHub'));
const SalesAccessGuard = lazy(() => import('./sales/access/SalesAccessGuard'));
const Leads = lazy(() => import('./pages/crm/Leads'));
const LeadViewPage = lazy(() => import('./pages/crm/LeadViewPage'));
const LeadPipeline = lazy(() => import('./pages/crm/LeadPipeline'));
const AddLead = lazy(() => import('./pages/crm/AddLead'));
const EditLead = lazy(() => import('./pages/crm/EditLead'));
const Contacts = lazy(() => import('./pages/crm/Contacts'));
const AddContact = lazy(() => import('./pages/crm/ContactFormPage'));
const EditContact = lazy(() => import('./pages/crm/ContactFormPage'));
const ContactDetails = lazy(() => import('./pages/crm/ContactViewPage'));
const Clients = lazy(() => import('./pages/crm/Clients'));
const ClientViewPage = lazy(() => import('./pages/crm/ClientViewPage'));
const AddClient = lazy(() => import('./pages/crm/AddClient'));
const FollowUps = lazy(() => import('./pages/crm/FollowUps'));
const FollowUpViewPage = lazy(() => import('./pages/crm/FollowUpViewPage'));
const AddFollowUp = lazy(() => import('./pages/crm/AddFollowUp'));
const CprHub = lazy(() => import('./pages/cpr/CprHub'));
const AddCpr = lazy(() => import('./pages/cpr/AddCpr'));
const EditCpr = lazy(() => import('./pages/cpr/EditCpr'));
const CprView = lazy(() => import('./pages/cpr/CprView'));
const CprDesign = lazy(() => import('./pages/cpr/CprDesign'));
const CprReports = lazy(() => import('./pages/cpr/CprReports'));
const CprTechnicalVerification = lazy(() => import('./pages/cpr/CprTechnicalVerification'));
const QuotationView = lazy(() => import('./pages/QuotationView'));
const CostWorkouts = lazy(() => import('./pages/cpr/CostWorkouts'));
const AddCostWorkout = lazy(() => import('./pages/cpr/AddCostWorkout'));
const CostWorkoutView = lazy(() => import('./pages/cpr/CostWorkoutView'));
const CostWorkoutDesign = lazy(() => import('./pages/cpr/CostWorkoutDesign'));
const ProfitWorkouts = lazy(() => import('./pages/cpr/ProfitWorkouts'));
const AddProfitWorkout = lazy(() => import('./pages/cpr/AddProfitWorkout'));
const ProfitWorkoutView = lazy(() => import('./pages/cpr/ProfitWorkoutView'));
const ProfitWorkoutDesign = lazy(() => import('./pages/cpr/ProfitWorkoutDesign'));
const Quotations = lazy(() => import('./pages/sales/Quotations'));
const QuotationDetails = lazy(() => import('./pages/sales/Quotations').then((m) => ({ default: m.QuotationDetails })));
const AddQuotation = lazy(() => import('./pages/sales/Quotations').then((m) => ({ default: m.AddQuotation })));
const EditQuotation = lazy(() => import('./pages/sales/Quotations').then((m) => ({ default: m.EditQuotation })));
const QuotationDashboard = lazy(() => import('./pages/sales/QuotationDashboard'));
const QuotationApproval = lazy(() => import('./pages/sales/QuotationApproval'));
const QuotationConvert = lazy(() => import('./pages/sales/QuotationConvert'));
const QuotationEmail = lazy(() => import('./pages/sales/QuotationEmail'));
const QuotationRevision = lazy(() => import('./pages/sales/QuotationRevision'));
const QuotationTimeline = lazy(() => import('./pages/sales/QuotationTimeline'));
const QuotationLinkedDocuments = lazy(() => import('./pages/sales/QuotationLinkedDocuments'));
const QuotationReport = lazy(() => import('./pages/sales/QuotationReport'));
const QuotationWorkflows = lazy(() => import('./pages/sales/QuotationWorkflows'));
const QuotationComparison = lazy(() => import('./pages/sales/QuotationComparison'));
const QuotationDesign = lazy(() => import('./pages/sales/QuotationDesign'));
const QuotationPrint = lazy(() => import('./pages/sales/QuotationPrint'));
const SalesContracts = lazy(() => import('./pages/sales/SalesContracts'));
const SalesContractDetails = lazy(() => import('./pages/sales/SalesContracts').then((m) => ({ default: m.SalesContractDetails })));
const AddSalesContract = lazy(() => import('./pages/sales/SalesContracts').then((m) => ({ default: m.AddSalesContract })));
const EditSalesContract = lazy(() => import('./pages/sales/SalesContracts').then((m) => ({ default: m.EditSalesContract })));
const BulkUploadSalesContract = lazy(() => import('./pages/sales/SalesContracts').then((m) => ({ default: m.BulkUploadSalesContract })));
const SalesContractDesign = lazy(() => import('./pages/sales/SalesContracts').then((m) => ({ default: m.SalesContractDesign })));
const CustomerPurchaseOrdersHub = lazy(() => import('./pages/sales/CustomerPurchaseOrdersHub'));
const CpoList = lazy(() => import('./pages/sales/SalesOrders').then((m) => ({ default: m.CpoList })));
const EActionViewPage = lazy(() => import('./pages/sales/EActionViewPage'));
const EActionFormPage = lazy(() => import('./pages/sales/EActionFormPage'));
const ProductionTracker = lazy(() => import('./pages/sales/SalesOrders').then((m) => ({ default: m.ProductionTrackerPage })));
const QcBranch = lazy(() => import('./pages/sales/SalesOrders').then((m) => ({ default: m.QcPage })));
const PackingList = lazy(() => import('./pages/sales/SalesOrders').then((m) => ({ default: m.PackingList })));
const SalesOrderDetails = lazy(() => import('./pages/sales/SalesOrders').then((m) => ({ default: m.SalesOrderDetails })));
const AddSalesOrder = lazy(() => import('./pages/sales/SalesOrders').then((m) => ({ default: m.AddSalesOrder })));
const EditSalesOrder = lazy(() => import('./pages/sales/SalesOrders').then((m) => ({ default: m.EditSalesOrder })));
const SalesOrderDesign = lazy(() => import('./pages/sales/SalesOrders').then((m) => ({ default: m.SalesOrderDesign })));
const DeliveryChallans = lazy(() => import('./pages/sales/DeliveryChallans'));
const DeliveryChallanDetails = lazy(() => import('./pages/sales/DeliveryChallans').then((m) => ({ default: m.DeliveryChallanDetails })));
const AddDeliveryChallan = lazy(() => import('./pages/sales/DeliveryChallans').then((m) => ({ default: m.AddDeliveryChallan })));
const EditDeliveryChallan = lazy(() => import('./pages/sales/DeliveryChallans').then((m) => ({ default: m.EditDeliveryChallan })));
const DeliveryChallanDesign = lazy(() => import('./pages/sales/DeliveryChallans').then((m) => ({ default: m.DeliveryChallanDesign })));
const ProformaInvoices = lazy(() => import('./pages/sales/ProformaInvoices'));
const ProformaInvoiceDetails = lazy(() => import('./pages/sales/ProformaInvoices').then((m) => ({ default: m.ProformaInvoiceDetails })));
const AddProformaInvoice = lazy(() => import('./pages/sales/ProformaInvoices').then((m) => ({ default: m.AddProformaInvoice })));
const EditProformaInvoice = lazy(() => import('./pages/sales/ProformaInvoices').then((m) => ({ default: m.EditProformaInvoice })));
const ProformaInvoiceDesign = lazy(() => import('./pages/sales/ProformaInvoices').then((m) => ({ default: m.ProformaInvoiceDesign })));
const PackingListDesign = lazy(() => import('./pages/sales/ProformaInvoices').then((m) => ({ default: m.PackingListDesign })));
const Invoices = lazy(() => import('./pages/sales/Invoices'));
const InvoiceDetails = lazy(() => import('./pages/sales/Invoices').then((m) => ({ default: m.InvoiceDetails })));
const AddInvoice = lazy(() => import('./pages/sales/Invoices').then((m) => ({ default: m.AddInvoice })));
const EditInvoice = lazy(() => import('./pages/sales/Invoices').then((m) => ({ default: m.EditInvoice })));
const InvoiceDesign = lazy(() => import('./pages/sales/Invoices').then((m) => ({ default: m.InvoiceDesign })));
const PaymentReceipts = lazy(() => import('./pages/sales/PaymentReceipts'));
const PaymentReceiptDetails = lazy(() => import('./pages/sales/PaymentReceipts').then((m) => ({ default: m.PaymentReceiptDetails })));
const AddPaymentReceipt = lazy(() => import('./pages/sales/PaymentReceipts').then((m) => ({ default: m.AddPaymentReceipt })));
const EditPaymentReceipt = lazy(() => import('./pages/sales/PaymentReceipts').then((m) => ({ default: m.EditPaymentReceipt })));
const PaymentReceiptDesign = lazy(() => import('./pages/sales/PaymentReceipts').then((m) => ({ default: m.PaymentReceiptDesign })));
const MarketingHub = lazy(() => import('./pages/marketing/MarketingHub'));
const QFormsPage = lazy(() => import('./pages/marketing/QFormsPage'));
const TravelSchedulerPage = lazy(() => import('./pages/marketing/TravelSchedulerPage'));
const TravelPlannersPage = lazy(() => import('./pages/marketing/TravelPlannersPage'));
const ExpensesPage = lazy(() => import('./pages/marketing/ExpensesPage'));
const NewExpensePage = lazy(() => import('./pages/marketing/NewExpensePage'));
const DashboardPage = lazy(() => import('./pages/marketing/DashboardPage'));
const MapPage = lazy(() => import('./pages/marketing/MapPage'));
const LocationDetailPage = lazy(() => import('./pages/marketing/LocationDetailPage'));
const CalendarPage = lazy(() => import('./pages/marketing/CalendarPage'));
const FollowUpsPage = lazy(() => import('./pages/marketing/FollowUpsPage'));
const FollowUpActivityPage = lazy(() => import('./pages/marketing/FollowUpActivityPage'));
const VisitEntryPage = lazy(() => import('./pages/marketing/VisitEntryPage'));
const VisitSummaryPage = lazy(() => import('./pages/marketing/VisitSummaryPage'));
const CreditNotes = lazy(() => import('./pages/sales/CreditNotes'));
const CreditNoteDetails = lazy(() => import('./pages/sales/CreditNotes').then((m) => ({ default: m.CreditNoteDetails })));
const AddCreditNote = lazy(() => import('./pages/sales/CreditNotes').then((m) => ({ default: m.AddCreditNote })));
const EditCreditNote = lazy(() => import('./pages/sales/CreditNotes').then((m) => ({ default: m.EditCreditNote })));
const CreditNoteDesign = lazy(() => import('./pages/sales/CreditNotes').then((m) => ({ default: m.CreditNoteDesign })));
const AdvancedSettings = lazy(() => import('./pages/AdvancedSettings'));
const FinancialSettings = lazy(() => import('./pages/FinancialSettings'));
const Notifications = lazy(() => import('./pages/Notifications'));
const PendingApprovals = lazy(() => import('./pages/PendingApprovals'));
const Documents = lazy(() => import('./pages/Documents'));
// Documents-module preview workspace: the standardized document preview that
// every document type without its own design workspace opens (Documents →
// ⋮ → View / Preview).
const DocumentPreview = lazy(() => import('./pages/DocumentPreview'));
const SalesDashboard = lazy(() => import('./pages/sales/SalesDashboard'));
const SalesReports = lazy(() => import('./pages/sales/SalesReports'));
const SalesSettings = lazy(() => import('./pages/sales/SalesSettings'));
const MarketingSettings = lazy(() => import('./pages/marketing/MarketingSettings'));
// Standalone Calendar workspace. It deliberately lives OUTSIDE AppLayout (see
// the route below) so the header's Calendar icon can open it in its own browser
// tab without a sidebar, while still sharing the app's providers — theme, toast
// and the signed-in session therefore behave exactly as they do elsewhere.
const Calendar = lazy(() => import('./pages/calendar/CalendarPage'));

function IndexRedirect() {
  return <Navigate to={isAuthenticated() ? '/dashboard' : '/signin'} replace />;
}

/**
 * /signin in local auto-login mode must never render the form: the backend is
 * the only thing that can mint a session here, so this forwards to the
 * Dashboard when signed in and otherwise retries the local sign-in while it
 * holds the loader. When the backend does not allow local auto-login (every
 * deployed instance), `enabled` is false and the normal Sign-In page renders
 * exactly as before.
 */
function SignInRoute() {
  const { enabled, authenticated, signIn } = useLocalAutoLogin();
  const retried = useRef(false);

  useEffect(() => {
    if (!enabled || authenticated || retried.current) return;
    retried.current = true;
    signIn();
  }, [enabled, authenticated, signIn]);

  if (!enabled) return <SignIn />;
  if (authenticated) return <Navigate to="/dashboard" replace />;
  return <PageLoader />;
}

/**
 * Global route-change scroll restoration — the ONE place that resets page
 * scroll, mounted once inside <BrowserRouter> so every route is covered.
 *
 * The app lets the DOCUMENT own vertical scrolling (`.app-workspace-content`
 * is `overflow: visible` — see Layout/AppLayout.css); the only element whose
 * scrollTop ever moves is the root <html>. So resetting the window is the whole
 * fix — no page needs its own scroll code.
 *
 * Two things are required for the reset to actually hold:
 *
 *  1. `history.scrollRestoration = 'manual'` — browsers default to 'auto',
 *     which makes them RE-APPLY the remembered offset on a history traversal
 *     (Back / Forward) *after* our effect runs, so the new route would reopen
 *     part-way down. Taking restoration over makes this component the single
 *     source of truth.
 *  2. `useLayoutEffect` (not `useEffect`) — it runs after the new route's DOM
 *     is committed but BEFORE the browser paints, so the first visible frame of
 *     the new page is already at the top instead of flashing the previous
 *     route's offset and then jumping.
 *
 * Keyed on `pathname` only: a genuine route change starts the new page at the
 * top, while in-page interactions that never change the route (dropdowns,
 * modals, non-route tabs, table sorting, search, filters, pagination, form
 * inputs) are untouched. Instant, never smooth.
 */
function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ThemeProvider>
        <ToastProvider>
          <ErrorBoundary>
            <ApiErrorProvider>
            <ExchangeRateProvider>
            <PendingApprovalProvider>
            <CurrentUserProvider>
            <NotificationProvider>
            {/*
              The fallback here only applies to the routes BELOW the app
              shell (sign-in, the standalone error pages). Authenticated
              routes render inside AppLayout, which owns its own Suspense
              boundary for the content area — so loading a lazy module can
              never blank the sidebar / topbar / session state.
            */}
            {/* Local-development auto-login: a no-op unless the backend has it
                enabled for this machine, in which case it restores a real
                session before any route (or the Sign-In page) renders. */}
            <LocalAutoLoginGate>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<IndexRedirect />} />
                <Route path="/signin" element={<SignInRoute />} />
                <Route path="/error/400" element={<ErrorPage status="400" />} />
                <Route path="/error/401" element={<ErrorPage status="401" />} />
                <Route path="/error/403" element={<ErrorPage status="403" />} />
                <Route path="/error/404" element={<ErrorPage status="404" />} />
                <Route path="/error/408" element={<ErrorPage status="408" />} />
                <Route path="/error/429" element={<ErrorPage status="429" />} />
                <Route path="/error/500" element={<ErrorPage status="500" />} />
                <Route path="/error/502" element={<ErrorPage status="502" />} />
                <Route path="/error/503" element={<ErrorPage status="503" />} />
                <Route path="/error/504" element={<ErrorPage status="504" />} />
                <Route path="/error/network" element={<ErrorPage status="NETWORK" />} />
                <Route path="/error/unknown" element={<ErrorPage status="UNKNOWN" />} />
                <Route element={<ProtectedRoute />}>
                  {/* The standalone Calendar has no shell: it is opened in its own
                      tab and must not render the ERP sidebar or topbar. */}
                  <Route path="/calendar" element={<Calendar />} />
                  <Route element={<AppLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />

                    <Route path="/crm" element={<SalesAccessGuard area="crm"><CRMHub /></SalesAccessGuard>} />
                    <Route path="/sales" element={<SalesAccessGuard area="salesExec"><SalesExecHub /></SalesAccessGuard>} />
                    <Route path="/leads" element={<SalesAccessGuard area="leads"><Leads /></SalesAccessGuard>} />
                    <Route path="/leads/pipeline" element={<SalesAccessGuard area="leads"><LeadPipeline /></SalesAccessGuard>} />
                    <Route path="/leads/new" element={<SalesAccessGuard area="leads" action="create"><AddLead /></SalesAccessGuard>} />
                    <Route path="/leads/:id/edit" element={<SalesAccessGuard area="leads" action="edit"><EditLead /></SalesAccessGuard>} />
                    <Route path="/leads/:id" element={<SalesAccessGuard area="leads"><LeadViewPage /></SalesAccessGuard>} />
                    <Route path="/contacts" element={<SalesAccessGuard area="contacts"><Contacts /></SalesAccessGuard>} />
                    <Route path="/contacts/new" element={<SalesAccessGuard area="contacts" action="create"><AddContact /></SalesAccessGuard>} />
                    <Route path="/contacts/:id/edit" element={<SalesAccessGuard area="contacts" action="edit"><EditContact /></SalesAccessGuard>} />
                    <Route path="/contacts/:id" element={<SalesAccessGuard area="contacts"><ContactDetails /></SalesAccessGuard>} />
                    <Route path="/clients" element={<SalesAccessGuard area="clients"><Clients /></SalesAccessGuard>} />
                    <Route path="/clients/new" element={<SalesAccessGuard area="clients" action="create"><AddClient /></SalesAccessGuard>} />
                    <Route path="/clients/:id/edit" element={<SalesAccessGuard area="clients" action="edit"><AddClient /></SalesAccessGuard>} />
                    <Route path="/clients/:id" element={<SalesAccessGuard area="clients"><ClientViewPage /></SalesAccessGuard>} />
                    {/* Marketing routes are wrapped in MarketingAccessGuard: the
                        page-level View permission hides the navigation item AND
                        blocks direct URL access. The backend re-checks every API. */}
                    <Route path="/marketing" element={<MarketingAccessGuard area="hub"><MarketingHub /></MarketingAccessGuard>} />
                    <Route path="/marketing/q-forms" element={<MarketingAccessGuard area="qforms"><QFormsPage /></MarketingAccessGuard>} />
                    <Route path="/marketing/travel-scheduler" element={<MarketingAccessGuard area="travelScheduler"><TravelSchedulerPage /></MarketingAccessGuard>} />
                    <Route path="/marketing/travel-planners" element={<MarketingAccessGuard area="travelRegistry"><TravelPlannersPage /></MarketingAccessGuard>} />
                    <Route path="/marketing/expenses" element={<MarketingAccessGuard area="expenses"><ExpensesPage /></MarketingAccessGuard>} />
                    <Route path="/marketing/expenses/new" element={<MarketingAccessGuard area="expenses" action="create"><NewExpensePage /></MarketingAccessGuard>} />
                    <Route path="/marketing/expenses/:id/edit" element={<MarketingAccessGuard area="expenses" action="edit"><NewExpensePage /></MarketingAccessGuard>} />
                    <Route path="/marketing/dashboard" element={<MarketingAccessGuard area="dashboard"><DashboardPage /></MarketingAccessGuard>} />
                    <Route path="/marketing/calendar" element={<MarketingAccessGuard area="calendar"><CalendarPage /></MarketingAccessGuard>} />
                    <Route path="/marketing/follow-ups" element={<MarketingAccessGuard area="followups"><FollowUpsPage /></MarketingAccessGuard>} />
                    <Route path="/marketing/follow-ups/new" element={<MarketingAccessGuard area="followups" action="create"><FollowUpActivityPage mode="followup" /></MarketingAccessGuard>} />
                    <Route path="/marketing/follow-ups/extensions/new" element={<MarketingAccessGuard area="followups" action="create"><FollowUpActivityPage mode="extension" /></MarketingAccessGuard>} />
                    <Route path="/marketing/follow-ups/:id/edit" element={<MarketingAccessGuard area="followups" action="edit"><FollowUpActivityPage mode="edit" /></MarketingAccessGuard>} />
                    <Route path="/marketing/visits" element={<MarketingAccessGuard area="visits"><VisitSummaryPage /></MarketingAccessGuard>} />
                    {/* 'new' opens the same Visit Entry page — creating needs Create, an
                        existing id needs Edit. */}
                    <Route path="/marketing/visits/:id/edit" element={<MarketingAccessGuard area="visits" action={({ id }) => (String(id) === 'new' ? 'create' : 'edit')}><VisitEntryPage /></MarketingAccessGuard>} />
                    <Route path="/marketing/map" element={<MarketingAccessGuard area="map"><MapPage /></MarketingAccessGuard>} />
                    {/* Canonical Marketing Map detail route — a marker click on the map
                        navigates here with the entity type + real backend ID. */}
                    <Route path="/marketing/locations/:type/:id" element={<MarketingAccessGuard area="map"><LocationDetailPage /></MarketingAccessGuard>} />
                    <Route path="/marketing/settings" element={<MarketingAccessGuard area="settings"><MarketingSettings /></MarketingAccessGuard>} />
                    <Route path="/followups" element={<SalesAccessGuard area="followups"><FollowUps /></SalesAccessGuard>} />
                    <Route path="/followups/new" element={<SalesAccessGuard area="followups" action="create"><AddFollowUp /></SalesAccessGuard>} />
                    <Route path="/followups/:id/edit" element={<SalesAccessGuard area="followups" action="edit"><AddFollowUp /></SalesAccessGuard>} />
                    <Route path="/followups/:id" element={<SalesAccessGuard area="followups"><FollowUpViewPage /></SalesAccessGuard>} />
                    <Route path="/cprs" element={<SalesAccessGuard area="cpr"><CprHub /></SalesAccessGuard>} />
                    <Route path="/cprs/reports" element={<SalesAccessGuard area="cpr"><CprReports /></SalesAccessGuard>} />
                    <Route path="/cprs/new" element={<SalesAccessGuard area="cpr" action="create"><AddCpr /></SalesAccessGuard>} />
                    <Route path="/cprs/design" element={<SalesAccessGuard area="cpr"><CprDesign /></SalesAccessGuard>} />
                    <Route path="/cprs/:id/edit" element={<SalesAccessGuard area="cpr" action="edit"><EditCpr /></SalesAccessGuard>} />
                    <Route path="/cprs/:id" element={<SalesAccessGuard area="cpr"><CprView /></SalesAccessGuard>} />
                    <Route path="/cpr/technical-verification" element={<SalesAccessGuard area="cpr"><CprTechnicalVerification /></SalesAccessGuard>} />
                    <Route path="/quotations/:cprId" element={<SalesAccessGuard area="quotations"><QuotationView /></SalesAccessGuard>} />
                    <Route path="/cost-workouts" element={<SalesAccessGuard area="costWorkouts"><CostWorkouts /></SalesAccessGuard>} />
                    <Route path="/cost-workouts/new" element={<SalesAccessGuard area="costWorkouts" action="create"><AddCostWorkout /></SalesAccessGuard>} />
                    <Route path="/cost-workouts/design" element={<SalesAccessGuard area="costWorkouts"><CostWorkoutDesign /></SalesAccessGuard>} />
                    <Route path="/cost-workouts/:id/edit" element={<SalesAccessGuard area="costWorkouts" action="edit"><AddCostWorkout /></SalesAccessGuard>} />
                    <Route path="/cost-workouts/:id" element={<SalesAccessGuard area="costWorkouts"><CostWorkoutView /></SalesAccessGuard>} />
                    <Route path="/profit-workouts" element={<SalesAccessGuard area="profitWorkouts"><ProfitWorkouts /></SalesAccessGuard>} />
                    <Route path="/profit-workouts/new" element={<SalesAccessGuard area="profitWorkouts" action="create"><AddProfitWorkout /></SalesAccessGuard>} />
                    <Route path="/profit-workouts/design" element={<SalesAccessGuard area="profitWorkouts"><ProfitWorkoutDesign /></SalesAccessGuard>} />
                    <Route path="/profit-workouts/:id/edit" element={<SalesAccessGuard area="profitWorkouts" action="edit"><AddProfitWorkout /></SalesAccessGuard>} />
                    <Route path="/profit-workouts/:id" element={<SalesAccessGuard area="profitWorkouts"><ProfitWorkoutView /></SalesAccessGuard>} />
                    <Route path="/quotations" element={<SalesAccessGuard area="quotations"><Quotations /></SalesAccessGuard>} />
                    <Route path="/quotations/new" element={<SalesAccessGuard area="quotations" action="create"><AddQuotation /></SalesAccessGuard>} />
                    <Route path="/quotations/:id/edit" element={<SalesAccessGuard area="quotations" action="edit"><EditQuotation /></SalesAccessGuard>} />
                    {/* distinct path: /quotations/:cprId is used by the CPR-linked Quotation preview */}
                    <Route path="/quotations/:id/view" element={<SalesAccessGuard area="quotations"><QuotationDetails /></SalesAccessGuard>} />
                    <Route path="/quotations/dashboard" element={<SalesAccessGuard area="quotations"><QuotationDashboard /></SalesAccessGuard>} />
                    <Route path="/quotations/approval" element={<SalesAccessGuard area="quotations"><QuotationApproval /></SalesAccessGuard>} />
                    <Route path="/quotations/convert" element={<SalesAccessGuard area="quotations"><QuotationConvert /></SalesAccessGuard>} />
                    <Route path="/quotations/email/:id" element={<SalesAccessGuard area="quotations"><QuotationEmail /></SalesAccessGuard>} />
                    <Route path="/quotations/revision" element={<SalesAccessGuard area="quotations"><QuotationRevision /></SalesAccessGuard>} />
                    <Route path="/quotations/timeline" element={<SalesAccessGuard area="quotations"><QuotationTimeline /></SalesAccessGuard>} />
                    <Route path="/quotations/linked-documents" element={<SalesAccessGuard area="quotations"><QuotationLinkedDocuments /></SalesAccessGuard>} />
                    <Route path="/quotations/report" element={<SalesAccessGuard area="quotations"><QuotationReport /></SalesAccessGuard>} />
                    <Route path="/quotations/workflows" element={<SalesAccessGuard area="quotations"><QuotationWorkflows /></SalesAccessGuard>} />
                    <Route path="/quotations/comparison" element={<SalesAccessGuard area="quotations"><QuotationComparison /></SalesAccessGuard>} />
                    <Route path="/quotations/design" element={<SalesAccessGuard area="quotations"><QuotationDesign /></SalesAccessGuard>} />
                    <Route path="/quotations/print/:id" element={<SalesAccessGuard area="quotations"><QuotationPrint /></SalesAccessGuard>} />
                    {/* Advanced Settings landing page (reference package). The
                        financial page it used to mount here is preserved
                        unchanged at its own route below. */}
                    <Route path="/settings" element={<AdvancedSettings />} />
                    <Route path="/settings/financial" element={<FinancialSettings />} />
                    <Route path="/sales-contracts" element={<SalesAccessGuard area="salesContracts"><SalesContracts /></SalesAccessGuard>} />
                    <Route path="/sales-contracts/new" element={<SalesAccessGuard area="salesContracts" action="create"><AddSalesContract /></SalesAccessGuard>} />
                    <Route path="/sales-contracts/bulk-upload" element={<SalesAccessGuard area="salesContracts" action="import"><BulkUploadSalesContract /></SalesAccessGuard>} />
                    <Route path="/sales-contracts/:id/edit" element={<SalesAccessGuard area="salesContracts" action="edit"><EditSalesContract /></SalesAccessGuard>} />
                    <Route path="/sales-contracts/design" element={<SalesAccessGuard area="salesContracts"><SalesContractDesign /></SalesAccessGuard>} />
                    <Route path="/sales-contracts/:id" element={<SalesAccessGuard area="salesContracts"><SalesContractDetails /></SalesAccessGuard>} />
                    <Route path="/sales-orders/e-actions" element={<SalesAccessGuard area="cpo"><CustomerPurchaseOrdersHub initialTab="e-actions" /></SalesAccessGuard>} />
                    <Route path="/sales-orders/e-actions/new" element={<SalesAccessGuard area="cpo" action="create"><EActionFormPage /></SalesAccessGuard>} />
                    <Route path="/sales-orders/e-actions/:id/edit" element={<SalesAccessGuard area="cpo" action="edit"><EActionFormPage /></SalesAccessGuard>} />
                    <Route path="/sales-orders/e-actions/:id" element={<SalesAccessGuard area="cpo"><EActionViewPage /></SalesAccessGuard>} />
                    <Route path="/sales-orders/cpo-list" element={<SalesAccessGuard area="cpo"><CpoList /></SalesAccessGuard>} />
                    <Route path="/sales-orders/production-tracker" element={<SalesAccessGuard area="cpo"><ProductionTracker /></SalesAccessGuard>} />
                    <Route path="/sales-orders/qc" element={<SalesAccessGuard area="cpo"><QcBranch /></SalesAccessGuard>} />
                    <Route path="/sales-orders/packing-list" element={<SalesAccessGuard area="cpo"><PackingList /></SalesAccessGuard>} />
                    <Route path="/sales-orders" element={<SalesAccessGuard area="cpo"><CustomerPurchaseOrdersHub /></SalesAccessGuard>} />
                    <Route path="/sales-orders/new" element={<SalesAccessGuard area="cpo" action="create"><AddSalesOrder /></SalesAccessGuard>} />
                    <Route path="/sales-orders/:id/edit" element={<SalesAccessGuard area="cpo" action="edit"><EditSalesOrder /></SalesAccessGuard>} />
                    <Route path="/sales-orders/design" element={<SalesAccessGuard area="cpo"><SalesOrderDesign /></SalesAccessGuard>} />
                    <Route path="/sales-orders/:id" element={<SalesAccessGuard area="cpo"><SalesOrderDetails /></SalesAccessGuard>} />
                    <Route path="/delivery-challans" element={<SalesAccessGuard area="deliveryChallans"><DeliveryChallans /></SalesAccessGuard>} />
                    <Route path="/delivery-challans/new" element={<SalesAccessGuard area="deliveryChallans" action="create"><AddDeliveryChallan /></SalesAccessGuard>} />
                    <Route path="/delivery-challans/:id/edit" element={<SalesAccessGuard area="deliveryChallans" action="edit"><EditDeliveryChallan /></SalesAccessGuard>} />
                    <Route path="/delivery-challans/design" element={<SalesAccessGuard area="deliveryChallans"><DeliveryChallanDesign /></SalesAccessGuard>} />
                    <Route path="/delivery-challans/:id" element={<SalesAccessGuard area="deliveryChallans"><DeliveryChallanDetails /></SalesAccessGuard>} />
                    <Route path="/proforma-invoices" element={<SalesAccessGuard area="proformaInvoices"><ProformaInvoices /></SalesAccessGuard>} />
                    <Route path="/proforma-invoices/new" element={<SalesAccessGuard area="proformaInvoices" action="create"><AddProformaInvoice /></SalesAccessGuard>} />
                    <Route path="/proforma-invoices/:id/edit" element={<SalesAccessGuard area="proformaInvoices" action="edit"><EditProformaInvoice /></SalesAccessGuard>} />
                    <Route path="/proforma-invoices/design" element={<SalesAccessGuard area="proformaInvoices"><ProformaInvoiceDesign /></SalesAccessGuard>} />
                    <Route path="/packing-lists/design" element={<SalesAccessGuard area="proformaInvoices"><PackingListDesign /></SalesAccessGuard>} />
                    <Route path="/proforma-invoices/:id" element={<SalesAccessGuard area="proformaInvoices"><ProformaInvoiceDetails /></SalesAccessGuard>} />
                    <Route path="/invoices" element={<SalesAccessGuard area="invoices"><Invoices /></SalesAccessGuard>} />
                    <Route path="/invoices/new" element={<SalesAccessGuard area="invoices" action="create"><AddInvoice /></SalesAccessGuard>} />
                    <Route path="/invoices/:id/edit" element={<SalesAccessGuard area="invoices" action="edit"><EditInvoice /></SalesAccessGuard>} />
                    <Route path="/invoices/design" element={<SalesAccessGuard area="invoices"><InvoiceDesign /></SalesAccessGuard>} />
                    <Route path="/invoices/:id" element={<SalesAccessGuard area="invoices"><InvoiceDetails /></SalesAccessGuard>} />
                    <Route path="/payment-receipts" element={<SalesAccessGuard area="paymentReceipts"><PaymentReceipts /></SalesAccessGuard>} />
                    <Route path="/payment-receipts/new" element={<SalesAccessGuard area="paymentReceipts" action="create"><AddPaymentReceipt /></SalesAccessGuard>} />
                    <Route path="/payment-receipts/:id/edit" element={<SalesAccessGuard area="paymentReceipts" action="edit"><EditPaymentReceipt /></SalesAccessGuard>} />
                    <Route path="/payment-receipts/design" element={<SalesAccessGuard area="paymentReceipts"><PaymentReceiptDesign /></SalesAccessGuard>} />
                    <Route path="/payment-receipts/:id" element={<SalesAccessGuard area="paymentReceipts"><PaymentReceiptDetails /></SalesAccessGuard>} />
                    <Route path="/credit-notes" element={<SalesAccessGuard area="creditNotes"><CreditNotes /></SalesAccessGuard>} />
                    <Route path="/credit-notes/new" element={<SalesAccessGuard area="creditNotes" action="create"><AddCreditNote /></SalesAccessGuard>} />
                    <Route path="/credit-notes/:id/edit" element={<SalesAccessGuard area="creditNotes" action="edit"><EditCreditNote /></SalesAccessGuard>} />
                    <Route path="/credit-notes/design" element={<SalesAccessGuard area="creditNotes"><CreditNoteDesign /></SalesAccessGuard>} />
                    <Route path="/credit-notes/:id" element={<SalesAccessGuard area="creditNotes"><CreditNoteDetails /></SalesAccessGuard>} />
                    <Route path="/sales/dashboard" element={<SalesAccessGuard area="dashboard"><SalesDashboard /></SalesAccessGuard>} />
                    <Route path="/sales/reports" element={<SalesAccessGuard area="reports"><SalesReports /></SalesAccessGuard>} />
                    <Route path="/sales/settings" element={<SalesAccessGuard area="settings"><SalesSettings /></SalesAccessGuard>} />
                    <Route path="/documents" element={<SalesAccessGuard area="documents"><Documents /></SalesAccessGuard>} />
                    <Route path="/documents/:id/preview" element={<SalesAccessGuard area="documents"><DocumentPreview /></SalesAccessGuard>} />
                    <Route path="/notifications" element={<Notifications />} />
                    {/* Dedicated Pending Approvals page opened from the sidebar entry. */}
                    <Route path="/pending-approvals" element={<PendingApprovals />} />

                    {/* ── Purchase Module Routes ───────────────────────────────────── */}
                    <Route path="/purchase/*" element={<PurchaseRoutes />} />

                    {/* ── Production Module Routes ──────────────────────────────────── */}
                    <Route path="/model-viewer/:id" element={<ModelViewerPage />} />
                    <Route path="/production/*" element={<ProductionRoutes />} />
                  </Route>
                </Route>
                <Route path="*" element={<ErrorPage status="404" />} />
              </Routes>
            </Suspense>
            </LocalAutoLoginGate>
            </NotificationProvider>
            </CurrentUserProvider>
            </PendingApprovalProvider>
            </ExchangeRateProvider>
            </ApiErrorProvider>
          </ErrorBoundary>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
