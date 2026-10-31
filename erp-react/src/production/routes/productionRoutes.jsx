/**
 * production/routes/productionRoutes.jsx
 * ------------------------------------------------------------------
 * SINGLE routing entry for the self-contained Production package.
 * App.jsx imports only this file; every Production screen, provider and
 * lazy chunk is owned by src/production.
 *
 * Why this file exists (navigation performance):
 *   · App.jsx previously imported ProductionProviders EAGERLY and wrapped
 *     each Production route element in it. That pulled all eleven
 *     Production contexts (and their API/service dependencies, including
 *     the 3D model + drawing layers) into the initial application bundle
 *     for every user — even those who never open Production.
 *   · Because this file is imported with React.lazy() from App.jsx, the
 *     whole module — providers, page chunks and services — is only
 *     fetched when a Production route is actually visited.
 *   · The providers now sit in ONE layout Route, so they mount once for
 *     the whole module. Moving between Production pages (Dashboard →
 *     Orders → Casting …) re-renders the page inside the already-mounted
 *     providers instead of tearing them down: no repeated API loads.
 *   · The Suspense boundary lives BELOW the application shell (AppLayout),
 *     so loading a Production chunk only ever shows the loader inside the
 *     content area — the sidebar / topbar / session state never blink.
 *
 * Access Management: every route below is wrapped in ProductionAccessGuard,
 * so a View permission that is OFF hides the page from the navigation AND
 * refuses a hand-typed URL. Create/Edit form routes additionally require their
 * own action. The backend re-checks every Production API independently.
 * ------------------------------------------------------------------
 */
import { Suspense, lazy } from 'react';
import { Outlet, Route, Routes, useParams } from 'react-router-dom';
import { ErrorPage, PageLoader } from '../../components/Common';
import ProductionProviders from '../ProductionProviders';
import ProductionAccessGuard from '../access/ProductionAccessGuard';

const ProductionDashboard = lazy(() => import('../pages/ProductionDashboard'));
const ProductionOrdersPage = lazy(() => import('../pages/ProductionOrders'));
const ProductionOrderDetail = lazy(() => import('../pages/ProductionOrderDetail'));
const ProductionPreview = lazy(() => import('../pages/ProductionPreview'));
const ProductionEntry = lazy(() => import('../pages/ProductionEntry'));
const TechnicalVerificationPage = lazy(() => import('../pages/TechnicalVerificationPage'));
const TechnicalVerificationDetail = lazy(() => import('../pages/TechnicalVerificationDetail'));
const DrawingsPage = lazy(() => import('../pages/DrawingsPage'));
const DrawingFormPage = lazy(() => import('../pages/DrawingFormPage'));
const DrawingDetail = lazy(() => import('../pages/DrawingDetail'));
const ModelsPage = lazy(() => import('../pages/ModelsPage'));
const ModelFormPage = lazy(() => import('../pages/ModelFormPage'));
const ModelDetail = lazy(() => import('../pages/ModelDetail'));
const KpiDetailsPage = lazy(() => import('../pages/KpiDetailsPage'));
const Casting = lazy(() => import('../pages/Casting'));
const Fabrication = lazy(() => import('../pages/Fabrication'));
const MachineShop = lazy(() => import('../pages/MachineShop'));
const Assembly = lazy(() => import('../pages/Assembly'));
const QualityPage = lazy(() => import('../pages/Quality'));
const QualityDetail = lazy(() => import('../pages/QualityDetail'));
const PackingPage = lazy(() => import('../pages/Packing'));
const PackingPreview = lazy(() => import('../pages/PackingPreview'));
const DispatchPage = lazy(() => import('../pages/Dispatch'));
const ProductionReports = lazy(() => import('../pages/Reports'));
const ProductionSummaryReport = lazy(() => import('../pages/reports/ProductionSummaryReport'));
const MachineUtilizationReport = lazy(() => import('../pages/reports/MachineUtilizationReport'));
const DepartmentEfficiencyReport = lazy(() => import('../pages/reports/DepartmentEfficiencyReport'));
const MaterialConsumptionReport = lazy(() => import('../pages/reports/MaterialConsumptionReport'));
const DelayAnalysisReport = lazy(() => import('../pages/reports/DelayAnalysisReport'));
const ProductionSettings = lazy(() => import('../pages/Settings'));
const SettingsLayout = lazy(() => import('../pages/settings/SettingsLayout'));
const SettingsUsersRoles = lazy(() => import('../pages/settings/UsersRoles'));
const SettingsMachines = lazy(() => import('../pages/settings/Machines'));
const SettingsWorkCenters = lazy(() => import('../pages/settings/WorkCenters'));
const SettingsParameters = lazy(() => import('../pages/settings/Parameters'));
const SettingsStatusMasters = lazy(() => import('../pages/settings/StatusMasters'));
const SettingsNotifications = lazy(() => import('../pages/settings/Notifications'));
const SettingsAccessManagement = lazy(() => import('../pages/settings/AccessManagement'));
const AcknowledgementPage = lazy(() => import('../pages/AcknowledgementPage'));
const ProductionDocuments = lazy(() => import('../pages/ProductionDocuments'));
const WorkOrderFormPage = lazy(() => import('../pages/WorkOrderFormPage'));

/** The record-preview route's module segment → its Production area. */
const PREVIEW_AREAS = {
  orders: 'orders',
  quality: 'quality',
  packing: 'packing',
  dispatch: 'dispatch',
  drawings: 'drawings',
  models: 'models',
  casting: 'casting',
  fabrication: 'fabrication',
  'machine-shop': 'machineShop',
  assembly: 'assembly'
};

function PreviewRoute() {
  const { module } = useParams();
  const area = PREVIEW_AREAS[String(module || '').toLowerCase()] || 'orders';
  return (
    <ProductionAccessGuard area={area}>
      <ProductionPreview />
    </ProductionAccessGuard>
  );
}

/** Route element helper: `guard('orders')` or `guard('orders', 'create')`. */
function guard(area, action, element) {
  return <ProductionAccessGuard area={area} action={action}>{element}</ProductionAccessGuard>;
}

/**
 * Mounts the Production providers exactly once for every /production route
 * and renders the active page inside a content-area Suspense boundary.
 */
function ProductionLayout() {
  return (
    <ProductionProviders>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </ProductionProviders>
  );
}

export default function ProductionRoutes() {
  return (
    <Routes>
      <Route element={<ProductionLayout />}>
        <Route index element={guard('dashboard', 'view', <ProductionDashboard />)} />

        {/* Shared read-only record preview used by every Production list
            page's ⋮ → Preview action. One route (and one layout) keeps the
            experience identical across Work Orders, Technical Verification,
            Drawings, Models, the shop-floor boards, Quality, Packing and
            Dispatch while each type supplies its own fields. */}
        <Route path="preview/:module/:id" element={<PreviewRoute />} />

        <Route path="orders" element={guard('orders', 'view', <ProductionOrdersPage />)} />
        {/* Create / Edit Work Order are standalone full-page views (like
            Sales → Create Lead), replacing the list — they must be declared
            before the /:id detail route. */}
        <Route path="orders/new" element={guard('orders', 'create', <WorkOrderFormPage />)} />
        <Route path="orders/:id/edit" element={guard('orders', 'edit', <WorkOrderFormPage />)} />
        <Route path="orders/:id" element={guard('orders', 'view', <ProductionOrderDetail />)} />

        <Route path="technical-verification" element={guard('technicalVerification', 'view', <TechnicalVerificationPage />)} />
        <Route path="technical-verification/:id" element={guard('technicalVerification', 'view', <TechnicalVerificationDetail />)} />
        <Route path="drawings" element={guard('drawings', 'view', <DrawingsPage />)} />
        <Route path="drawings/new" element={guard('drawings', 'create', <DrawingFormPage />)} />
        <Route path="drawings/:id" element={guard('drawings', 'view', <DrawingDetail />)} />
        <Route path="models" element={guard('models', 'view', <ModelsPage />)} />
        <Route path="models/new" element={guard('models', 'create', <ModelFormPage />)} />
        <Route path="models/:id" element={guard('models', 'view', <ModelDetail />)} />

        <Route path="casting" element={guard('casting', 'view', <Casting />)} />
        {/* Create Casting Job is a dedicated full-page route (like
            Create Drawing / Create Model) — the board is not rendered
            behind the form. */}
        <Route path="casting/new" element={guard('casting', 'create', <Casting createPage />)} />
        {/* Edit Casting Job is a dedicated full-page route too — ⋮ → Edit used
            to open a half-width overlay panel with the board still behind it. */}
        <Route path="casting/:id/edit" element={guard('casting', 'edit', <Casting editPage />)} />
        <Route path="fabrication" element={guard('fabrication', 'view', <Fabrication />)} />
        <Route path="fabrication/new" element={guard('fabrication', 'create', <Fabrication createPage />)} />
        <Route path="fabrication/:id/edit" element={guard('fabrication', 'edit', <Fabrication editPage />)} />
        <Route path="machine-shop" element={guard('machineShop', 'view', <MachineShop />)} />
        <Route path="machine-shop/new" element={guard('machineShop', 'create', <MachineShop createPage />)} />
        <Route path="machine-shop/:id/edit" element={guard('machineShop', 'edit', <MachineShop editPage />)} />
        <Route path="assembly" element={guard('assembly', 'view', <Assembly />)} />
        <Route path="assembly/new" element={guard('assembly', 'create', <Assembly createPage />)} />
        <Route path="assembly/:id/edit" element={guard('assembly', 'edit', <Assembly editPage />)} />
        <Route path="quality" element={guard('quality', 'view', <QualityPage />)} />
        {/* Create Inspection is a dedicated full-page route (like Create
            Casting / Fabrication / Assembly Job) — the Quality list is not
            rendered behind the form. Declared before the /:id detail route. */}
        <Route path="quality/new" element={guard('quality', 'create', <QualityPage createPage />)} />
        {/* Edit Inspection is a dedicated full-page route too. Declared before
            the /:id detail route. */}
        <Route path="quality/:id/edit" element={guard('quality', 'edit', <QualityPage editPage />)} />
        <Route path="quality/:id" element={guard('quality', 'view', <QualityDetail />)} />
        <Route path="packing" element={guard('packing', 'view', <PackingPage />)} />
        <Route path="packing/new" element={guard('packing', 'create', <PackingPage createPage />)} />
        <Route path="packing/:id/edit" element={guard('packing', 'edit', <PackingPage editPage />)} />
        <Route path="packing/:id/preview" element={guard('packing', 'view', <PackingPreview />)} />
        <Route path="dispatch" element={guard('dispatch', 'view', <DispatchPage />)} />
        <Route path="dispatch/new" element={guard('dispatch', 'create', <DispatchPage createPage />)} />
        <Route path="dispatch/:id/edit" element={guard('dispatch', 'edit', <DispatchPage editPage />)} />

        {/* Documents — the shared folder explorer (pages/Documents.jsx) mounted
            with the Production profile, so this screen matches the Sales
            Documents module exactly instead of being a second design of it. */}
        <Route path="documents" element={guard('documents', 'view', <ProductionDocuments />)} />

        <Route path="reports" element={guard('reports', 'view', <ProductionReports />)} />
        <Route path="reports/production-summary" element={guard('reports', 'view', <ProductionSummaryReport />)} />
        <Route path="reports/machine-utilization" element={guard('reports', 'view', <MachineUtilizationReport />)} />
        <Route path="reports/department-efficiency" element={guard('reports', 'view', <DepartmentEfficiencyReport />)} />
        <Route path="reports/material-consumption" element={guard('reports', 'view', <MaterialConsumptionReport />)} />
        <Route path="reports/delay-analysis" element={guard('reports', 'view', <DelayAnalysisReport />)} />
        {/* Settings use the PDE settings experience: ONE persistent shell
            (breadcrumb + page heading + grouped rail) with the settings section
            pages rendered into its content column. Because the shell is a layout
            route it survives navigation between sections — so the rail never
            re-mounts, nothing shifts, and the draft a section is editing is not
            thrown away by walking to another section and back. */}
        <Route path="settings" element={guard('settings', 'view', <SettingsLayout />)}>
          <Route index element={guard('settings', 'view', <ProductionSettings />)} />
          <Route path="users-roles" element={guard('settings', 'view', <SettingsUsersRoles />)} />
          <Route path="machines" element={guard('settings', 'view', <SettingsMachines />)} />
          <Route path="work-centers" element={guard('settings', 'view', <SettingsWorkCenters />)} />
          <Route path="parameters" element={guard('settings', 'view', <SettingsParameters />)} />
          <Route path="status-masters" element={guard('settings', 'view', <SettingsStatusMasters />)} />
          {/* Notification preferences — the gates the backend publisher reads
              before delivering a Production workflow event. */}
          <Route path="notifications" element={guard('settings', 'view', <SettingsNotifications />)} />
          {/* Access Management — same panel as Marketing and Sales; the whole
              management surface is ADMIN-only server-side and the page states
              that for anyone else. */}
          <Route path="access" element={guard('settings', 'view', <SettingsAccessManagement />)} />
        </Route>
        <Route path="acknowledgement" element={guard('acknowledgement', 'view', <AcknowledgementPage />)} />
        <Route path="entry" element={guard('entry', 'view', <ProductionEntry />)} />
        <Route path="kpi/:module/:kpiKey" element={guard('dashboard', 'view', <KpiDetailsPage />)} />

        {/* Unknown /production/* paths keep the app-wide 404 behaviour
            (previously handled by the global catch-all route). */}
        <Route path="*" element={<ErrorPage status="404" />} />
      </Route>
    </Routes>
  );
}
