// ============================================================
// Page registry — maps navigation keys to page elements.
// The routes builder (src/routes) uses this to wire up paths.
// Child keys reuse the same page components (e.g. every Casting
// stage renders the Casting shop floor board with a `stage` prop).
// ============================================================
import ProductionOrders from './ProductionOrders';
import AcknowledgementPage from './AcknowledgementPage';
import TechnicalVerificationPage from './TechnicalVerificationPage';
import DrawingsPage from './DrawingsPage';
import ModelsPage from './ModelsPage';
import Casting from './Casting';
import Fabrication from './Fabrication';
import MachineShop from './MachineShop';
import Assembly from './Assembly';
import Quality from './Quality';
import Packing from './Packing';
import Dispatch from './Dispatch';
import Reports from './Reports';
import Settings from './Settings';
import ProductionSummaryReport from './reports/ProductionSummaryReport';
import MachineUtilizationReport from './reports/MachineUtilizationReport';
import DepartmentEfficiencyReport from './reports/DepartmentEfficiencyReport';
import MaterialConsumptionReport from './reports/MaterialConsumptionReport';
import DelayAnalysisReport from './reports/DelayAnalysisReport';
import UsersRoles from './settings/UsersRoles';
import Machines from './settings/Machines';
import WorkCenters from './settings/WorkCenters';
import Parameters from './settings/Parameters';
import StatusMasters from './settings/StatusMasters';

const productionPages = {
  // Top-level modules
  orders: <ProductionOrders />,

  // Drafts sub-items — all reuse the Production Orders page
  'drafts-draft': <ProductionOrders />,
  'drafts-production-approval': <ProductionOrders />,
  'drafts-admin-approval': <ProductionOrders />,
  'drafts-approved': <ProductionOrders />,
  acknowledgement: <AcknowledgementPage />,
  'technical-verification': <TechnicalVerificationPage />,
  drawings: <DrawingsPage />,
  models: <ModelsPage />,
  casting: <Casting />,
  fabrication: <Fabrication />,
  'machine-shop': <MachineShop />,
  assembly: <Assembly />,
  quality: <Quality />,
  packing: <Packing />,
  dispatch: <Dispatch />,
  reports: <Reports />,
  settings: <Settings />,

  // Casting stages — reuse the Casting shop floor board.
  'casting-shell-preparation': <Casting stage="Shell Preparation" />,
  'casting-pouring': <Casting stage="Pouring" />,
  'casting-blasting': <Casting stage="Blasting" />,
  'casting-qc': <Casting stage="QC" />,
  'casting-packing': <Casting stage="Packing" />,
  'casting-dispatch': <Casting stage="Dispatch" />,

  // Fabrication stages — reuse the Fabrication shop floor board.
  'fabrication-raw-material': <Fabrication stage="Raw Material" />,
  'fabrication-cutting': <Fabrication stage="Cutting" />,
  'fabrication-bending': <Fabrication stage="Bending" />,
  'fabrication-welding': <Fabrication stage="Welding" />,
  'fabrication-hard-facing': <Fabrication stage="Hard Facing" />,
  'fabrication-qc': <Fabrication stage="QC" />,
  'fabrication-packing': <Fabrication stage="Packing" />,
  'fabrication-dispatch': <Fabrication stage="Dispatch" />,

  // Reports
  'reports-production-summary': <ProductionSummaryReport />,
  'reports-machine-utilization': <MachineUtilizationReport />,
  'reports-department-efficiency': <DepartmentEfficiencyReport />,
  'reports-material-consumption': <MaterialConsumptionReport />,
  'reports-delay-analysis': <DelayAnalysisReport />,

  // Settings
  'settings-users-roles': <UsersRoles />,
  'settings-machines': <Machines />,
  'settings-work-centers': <WorkCenters />,
  'settings-parameters': <Parameters />,
  'settings-status-masters': <StatusMasters />,
};

export default productionPages;
