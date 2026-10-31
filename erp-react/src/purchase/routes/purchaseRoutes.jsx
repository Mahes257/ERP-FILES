/**
 * purchase/routes/purchaseRoutes.jsx
 * ------------------------------------------------------------------
 * SINGLE routing entry for the self-contained Purchase package.
 * App.jsx imports only this file; all purchase screens, providers and
 * lazy chunks are owned by src/purchase.
 *
 * Workflow: Dashboard → Purchase Requisition → Vendor Management →
 *   RFQ & Quotations (RFQ List → Follow-ups → Quotations →
 *   Final Negotiation → Price Comparative Statement → Approval Flow →
 *   Technical Evaluation) → Purchase Orders → Logistics →
 *   Purchase Invoice → Reports → Settings.
 * ------------------------------------------------------------------
 */
import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import PurchaseLayout from '../layouts/PurchaseLayout';
import PurchaseAccessGuard from '../access/PurchaseAccessGuard';

const Dashboard = lazy(() => import('../pages/Dashboard'));

/* Requisition */
const RequisitionList = lazy(() => import('../pages/requisition/PurchaseRequisitionList'));
const RequisitionCreate = lazy(() => import('../pages/requisition/PurchaseRequisitionCreate'));
const RequisitionEdit = lazy(() => import('../pages/requisition/PurchaseRequisitionEdit'));
const RequisitionView = lazy(() => import('../pages/requisition/PurchaseRequisitionView'));
const RequisitionApproval = lazy(() => import('../pages/requisition/PurchaseRequisitionApproval'));
const RequisitionTimeline = lazy(() => import('../pages/requisition/PurchaseRequisitionTimeline'));
const RequisitionActivity = lazy(() => import('../pages/requisition/PurchaseRequisitionActivity'));
const RequisitionPrint = lazy(() => import('../pages/requisition/PurchaseRequisitionPrint'));
const ApprovalWorkflow = lazy(() => import('../pages/requisition/PurchaseApprovalWorkflow'));
const TechnicalSpecificationReview = lazy(() => import('../pages/requisition/TechnicalSpecificationReview'));

/* Vendors */
const VendorList = lazy(() => import('../pages/vendors/VendorList'));
const VendorRegistration = lazy(() => import('../pages/vendors/VendorRegistration'));
const VendorEdit = lazy(() => import('../pages/vendors/VendorEdit'));
const VendorDetail = lazy(() => import('../pages/vendors/VendorDetail'));
const VendorPerformance = lazy(() => import('../pages/vendors/VendorPerformance'));
const VendorApproval = lazy(() => import('../pages/vendors/VendorApproval'));
const VendorActivity = lazy(() => import('../pages/vendors/VendorActivity'));
const VendorTimeline = lazy(() => import('../pages/vendors/VendorTimeline'));
const VendorPrint = lazy(() => import('../pages/vendors/VendorPrint'));
const VendorReports = lazy(() => import('../pages/vendors/VendorReports'));
const VendorDocuments = lazy(() => import('../pages/vendors/VendorDocuments'));

/* Approval Flow (NFA — reused for the new Approval Flow step) */
const Nfa = lazy(() => import('../pages/approval/Nfa'));
const NfaCreate = lazy(() => import('../pages/approval/NfaCreate'));
const NfaDetail = lazy(() => import('../pages/approval/NfaDetail'));
const NfaPrint = lazy(() => import('../pages/approval/NfaPrint'));

/* RFQ & Quotations */
const RfqDashboard = lazy(() => import('../pages/rfq/RfqDashboard'));
const RfqList = lazy(() => import('../pages/rfq/RfqList'));
const RfqCreate = lazy(() => import('../pages/rfq/RfqCreate'));
const RfqEdit = lazy(() => import('../pages/rfq/RfqEdit'));
const RfqView = lazy(() => import('../pages/rfq/RfqView'));
const RfqPrint = lazy(() => import('../pages/rfq/RfqPrint'));
const VendorQuotations = lazy(() => import('../pages/rfq/VendorQuotations'));
const QuotationCreate = lazy(() => import('../pages/rfq/QuotationCreate'));
const QuotationEdit = lazy(() => import('../pages/rfq/QuotationEdit'));
const QuotationDetail = lazy(() => import('../pages/rfq/QuotationDetail'));
const QuotationPrint = lazy(() => import('../pages/rfq/QuotationPrint'));
const QuotationComparison = lazy(() => import('../pages/rfq/QuotationComparison'));
const PriceComparativeStatement = lazy(() => import('../pages/rfq/PriceComparativeStatement'));
const PriceComparativeStatementDetail = lazy(() => import('../pages/rfq/PriceComparativeStatementDetail'));
const PcsPrint = lazy(() => import('../pages/rfq/PcsPrint'));
const FinalNegotiation = lazy(() => import('../pages/evaluation/FinalNegotiation'));
const NegotiationWorkspace = lazy(() => import('../pages/evaluation/NegotiationWorkspace'));
const NegotiationPrint = lazy(() => import('../pages/evaluation/NegotiationPrint'));
const RfqFollowUps = lazy(() => import('../pages/rfq/RfqFollowUps'));
const RfqFollowUpCreate = lazy(() => import('../pages/rfq/RfqFollowUpCreate'));
const RfqFollowUpEdit = lazy(() => import('../pages/rfq/RfqFollowUpEdit'));

/* Technical Evaluation (under RFQ & Quotations) */
const TechnicalEvaluation = lazy(() => import('../pages/evaluation/TechnicalEvaluation'));
const TechnicalEvaluationDetail = lazy(() => import('../pages/evaluation/TechnicalEvaluationDetail'));

/* Purchase Orders */
const OrderList = lazy(() => import('../pages/orders/OrderList'));
const OrderCreate = lazy(() => import('../pages/orders/OrderCreate'));
const OrderEdit = lazy(() => import('../pages/orders/OrderEdit'));
const OrderView = lazy(() => import('../pages/orders/OrderView'));
const OrderPrint = lazy(() => import('../pages/orders/PurchaseOrderPrint'));
const OrderApproval = lazy(() => import('../pages/orders/OrderApproval'));
const ReleasedOrders = lazy(() => import('../pages/orders/ReleasedOrders'));
const SupplierAcknowledgement = lazy(() => import('../pages/orders/SupplierAcknowledgement'));

/* Logistics */
const ManufacturingPacking = lazy(() => import('../pages/logistics/ManufacturingPacking'));
const ManufacturingForm = lazy(() => import('../pages/logistics/ManufacturingForm'));
const PackingDetail = lazy(() => import('../pages/logistics/PackingDetail'));
const ShipmentTracking = lazy(() => import('../pages/logistics/ShipmentTracking'));
const ShipmentForm = lazy(() => import('../pages/logistics/ShipmentForm'));
const ShipmentDetail = lazy(() => import('../pages/logistics/ShipmentDetail'));
const GoodsReceipt = lazy(() => import('../pages/logistics/GoodsReceipt'));
const GrnForm = lazy(() => import('../pages/logistics/GrnForm'));
const GrnDetail = lazy(() => import('../pages/logistics/GrnDetail'));
const GrnPrint = lazy(() => import('../pages/logistics/GrnPrint'));
const QualityInspection = lazy(() => import('../pages/logistics/QualityInspection'));
const QualityInspectionForm = lazy(() => import('../pages/logistics/QualityInspectionForm'));
const InspectionDetail = lazy(() => import('../pages/logistics/InspectionDetail'));
const InventoryUpdate = lazy(() => import('../pages/logistics/InventoryUpdate'));
const InventoryForm = lazy(() => import('../pages/logistics/InventoryForm'));
const InventoryDetail = lazy(() => import('../pages/logistics/InventoryDetail'));

/* Invoices */
const InvoiceList = lazy(() => import('../pages/invoices/InvoiceList'));
const InvoiceCreate = lazy(() => import('../pages/invoices/InvoiceCreate'));
const InvoiceEdit = lazy(() => import('../pages/invoices/InvoiceEdit'));
const InvoiceView = lazy(() => import('../pages/invoices/InvoiceView'));
const InvoicePrint = lazy(() => import('../pages/invoices/InvoicePrint'));
const ThreeWayMatching = lazy(() => import('../pages/invoices/ThreeWayMatching'));
const PaymentApproval = lazy(() => import('../pages/invoices/PaymentApproval'));
const VendorPayment = lazy(() => import('../pages/invoices/VendorPayment'));
const PaymentAdvice = lazy(() => import('../pages/invoices/PaymentAdvice'));
const AdjustmentNotesList = lazy(() => import('../pages/invoices/AdjustmentNotesList'));
const AdjustmentNoteCreate = lazy(() => import('../pages/invoices/AdjustmentNoteCreate'));

/* Reports */
const ReportsDashboard = lazy(() => import('../pages/reports/ReportsDashboard'));
const SpendAnalysis = lazy(() => import('../pages/reports/SpendAnalysis'));
const VendorAnalysis = lazy(() => import('../pages/reports/VendorAnalysis'));
const ProcurementAnalytics = lazy(() => import('../pages/reports/ProcurementAnalytics'));
const PurchaseReports = lazy(() => import('../pages/reports/PurchaseReports'));

/* Documents */
const PurchaseDocuments = lazy(() => import('../pages/documents/PurchaseDocuments'));
const Document360View = lazy(() => import('../pages/documents/Document360View'));
const PurchaseWorkQueue = lazy(() => import('../pages/documents/PurchaseWorkQueue'));

/* Settings */
const Settings = lazy(() => import('../pages/settings/Settings'));

/**
 * Route guard for one Purchase page.
 *
 * View gates the page itself; the create / edit / print pages additionally need
 * their own action, so a hand-typed `/purchase/orders/new` is refused when
 * Create is OFF. The backend refuses the matching API calls regardless — this
 * only keeps the UI from rendering a page the user may not use.
 */
function Guard({ area, action = 'view', children }) {
  return <PurchaseAccessGuard area={area} action={action}>{children}</PurchaseAccessGuard>;
}

export default function PurchaseRoutes() {
  return (
    <Routes>
      <Route element={<PurchaseLayout />}>
        <Route index element={<Navigate to="/purchase/dashboard" replace />} />

        {/* Dashboard */}
        <Route path="dashboard" element={<Guard area="dashboard"><Dashboard /></Guard>} />

        {/* Work Queue — actionable pending work across the workflow */}
        <Route path="work-queue" element={<Guard area="workQueue"><PurchaseWorkQueue /></Guard>} />

        {/* Purchase Requisition */}
        <Route path="requisition" element={<Guard area="requisition"><RequisitionList /></Guard>} />
        <Route path="requisition/new" element={<Guard area="requisition" action="create"><RequisitionCreate /></Guard>} />
        <Route path="requisition/approval" element={<Guard area="requisition"><ApprovalWorkflow /></Guard>} />
        <Route path="requisition/tech-spec" element={<Guard area="prTechSpec"><TechnicalSpecificationReview /></Guard>} />
        <Route path="requisition/:id/approval" element={<Guard area="requisition"><RequisitionApproval /></Guard>} />
        <Route path="requisition/:id/timeline" element={<Guard area="requisition"><RequisitionTimeline /></Guard>} />
        <Route path="requisition/:id/activity" element={<Guard area="requisition"><RequisitionActivity /></Guard>} />
        <Route path="requisition/:id/print" element={<Guard area="requisition" action="print"><RequisitionPrint /></Guard>} />
        <Route path="requisition/:id/edit" element={<Guard area="requisition" action="edit"><RequisitionEdit /></Guard>} />
        <Route path="requisition/:id/360" element={<Guard area="requisition"><Document360View type="pr" /></Guard>} />
        <Route path="requisition/:id" element={<Guard area="requisition"><RequisitionView /></Guard>} />

        {/* Vendor Management */}
        <Route path="vendors/new" element={<Guard area="vendors" action="create"><VendorRegistration /></Guard>} />
        <Route path="vendors/performance" element={<Guard area="vendorPerformance"><VendorPerformance /></Guard>} />
        <Route path="vendors/reports" element={<Guard area="vendorReports"><VendorReports /></Guard>} />
        <Route path="vendors/documents" element={<Guard area="vendors"><VendorDocuments /></Guard>} />
        <Route path="vendors/:id/edit" element={<Guard area="vendors" action="edit"><VendorEdit /></Guard>} />
        <Route path="vendors/:id/approval" element={<Guard area="vendors"><VendorApproval /></Guard>} />
        <Route path="vendors/:id/activity" element={<Guard area="vendors"><VendorActivity /></Guard>} />
        <Route path="vendors/:id/timeline" element={<Guard area="vendors"><VendorTimeline /></Guard>} />
        <Route path="vendors/:id/print" element={<Guard area="vendors" action="print"><VendorPrint /></Guard>} />
        <Route path="vendors/:id" element={<Guard area="vendors"><VendorDetail /></Guard>} />
        <Route path="vendors" element={<Guard area="vendors"><VendorList /></Guard>} />
        <Route path="vendor-management" element={<Navigate to="/purchase/vendors" replace />} />

        {/* RFQ & Quotations */}
        <Route path="rfq/dashboard" element={<Guard area="rfq"><RfqDashboard /></Guard>} />
        <Route path="rfq/new" element={<Guard area="rfq" action="create"><RfqCreate /></Guard>} />
        <Route path="rfq/follow-ups/new" element={<Guard area="followUps" action="create"><RfqFollowUpCreate /></Guard>} />
        <Route path="rfq/follow-ups/:id/edit" element={<Guard area="followUps" action="edit"><RfqFollowUpEdit /></Guard>} />
        <Route path="rfq/follow-ups" element={<Guard area="followUps"><RfqFollowUps /></Guard>} />
        <Route path="rfq/quotations/new" element={<Guard area="rfq" action="create"><QuotationCreate /></Guard>} />
        <Route path="rfq/quotations/:id/edit" element={<Guard area="rfq" action="edit"><QuotationEdit /></Guard>} />
        <Route path="rfq/quotations" element={<Guard area="rfq"><VendorQuotations /></Guard>} />
        <Route path="quotations" element={<Navigate to="/purchase/rfq/quotations" replace />} />
        <Route path="rfq/quotations/:id/print" element={<Guard area="rfq" action="print"><QuotationPrint /></Guard>} />
        <Route path="rfq/quotations/:id/360" element={<Guard area="rfq"><Document360View type="quotation" /></Guard>} />
        <Route path="rfq/quotations/:id" element={<Guard area="rfq"><QuotationDetail /></Guard>} />
        {/* Final Negotiation (renamed from Price Negotiation) */}
        <Route path="rfq/negotiation/:rfqId/:vendorId/print" element={<Guard area="rfqNegotiation" action="print"><NegotiationPrint /></Guard>} />
        <Route path="rfq/negotiation/:rfqId/:vendorId" element={<Guard area="rfqNegotiation"><NegotiationWorkspace /></Guard>} />
        <Route path="rfq/negotiation" element={<Guard area="rfqNegotiation"><FinalNegotiation /></Guard>} />
        {/* Price Comparative Statement (renamed from Quotation Comparison) */}
        <Route path="rfq/price-comparative-statement/:rfqId/print" element={<Guard area="rfqPcs" action="print"><PcsPrint /></Guard>} />
        <Route path="rfq/price-comparative-statement/:rfqId" element={<Guard area="rfqPcs"><PriceComparativeStatementDetail /></Guard>} />
        <Route path="rfq/price-comparative-statement" element={<Guard area="rfqPcs"><PriceComparativeStatement /></Guard>} />
        <Route path="rfq/compare" element={<Guard area="rfq"><QuotationComparison /></Guard>} />
        {/* Approval Flow */}
        <Route path="rfq/approval" element={<Guard area="nfa"><Nfa /></Guard>} />
        <Route path="rfq/approval/new" element={<Guard area="nfa" action="create"><NfaCreate /></Guard>} />
        <Route path="rfq/approval/:id/print" element={<Guard area="nfa" action="print"><NfaPrint /></Guard>} />
        <Route path="rfq/approval/:id" element={<Guard area="nfa"><NfaDetail /></Guard>} />
        {/* Technical Evaluation (moved from Evaluation section) */}
        <Route path="rfq/technical-evaluation" element={<Guard area="rfqTechnicalEvaluation"><TechnicalEvaluation /></Guard>} />
        <Route path="rfq/technical-evaluation/:rfqId" element={<Guard area="rfqTechnicalEvaluation"><TechnicalEvaluationDetail /></Guard>} />
        {/* Legacy RFQ routes */}
        <Route path="rfq/:id/print" element={<Guard area="rfq" action="print"><RfqPrint /></Guard>} />
        <Route path="rfq/:id/edit" element={<Guard area="rfq" action="edit"><RfqEdit /></Guard>} />
        <Route path="rfq/:id/360" element={<Guard area="rfq"><Document360View type="rfq" /></Guard>} />
        <Route path="rfq/:id" element={<Guard area="rfq"><RfqView /></Guard>} />
        <Route path="rfq" element={<Guard area="rfq"><RfqList /></Guard>} />

        {/* Purchase Orders */}
        <Route path="orders/new" element={<Guard area="orders" action="create"><OrderCreate /></Guard>} />
        <Route path="orders/approval" element={<Guard area="orders"><OrderApproval /></Guard>} />
        <Route path="orders/released" element={<Guard area="orders"><ReleasedOrders /></Guard>} />
        <Route path="orders/acknowledgement" element={<Guard area="orders"><SupplierAcknowledgement /></Guard>} />
        <Route path="orders/:id/edit" element={<Guard area="orders" action="edit"><OrderEdit /></Guard>} />
        <Route path="orders/:id/print" element={<Guard area="orders" action="print"><OrderPrint /></Guard>} />
        <Route path="orders/:id/360" element={<Guard area="orders"><Document360View type="po" /></Guard>} />
        <Route path="orders/:id" element={<Guard area="orders"><OrderView /></Guard>} />
        <Route path="orders" element={<Guard area="orders"><OrderList /></Guard>} />

        {/* Logistics */}
        <Route path="logistics" element={<Navigate to="/purchase/logistics/manufacturing" replace />} />
        <Route path="logistics/manufacturing/new" element={<Guard area="packing" action="create"><ManufacturingForm /></Guard>} />
        <Route path="logistics/manufacturing/:packingNo/edit" element={<Guard area="packing" action="edit"><ManufacturingForm /></Guard>} />
        <Route path="logistics/manufacturing/:packingNo" element={<Guard area="packing"><PackingDetail /></Guard>} />
        <Route path="logistics/manufacturing" element={<Guard area="packing"><ManufacturingPacking /></Guard>} />
        <Route path="logistics/shipment/new" element={<Guard area="shipments" action="create"><ShipmentForm /></Guard>} />
        <Route path="logistics/shipment/:shipmentNo/edit" element={<Guard area="shipments" action="edit"><ShipmentForm /></Guard>} />
        <Route path="logistics/shipment/:shipmentNo" element={<Guard area="shipments"><ShipmentDetail /></Guard>} />
        <Route path="logistics/shipment" element={<Guard area="shipments"><ShipmentTracking /></Guard>} />
        <Route path="logistics/grn/new" element={<Guard area="grn" action="create"><GrnForm /></Guard>} />
        <Route path="logistics/grn/:grnNo/edit" element={<Guard area="grn" action="edit"><GrnForm /></Guard>} />
        <Route path="logistics/grn/:grnNo/print" element={<Guard area="grn" action="print"><GrnPrint /></Guard>} />
        <Route path="logistics/grn/:grnNo/360" element={<Guard area="grn"><Document360View type="grn" /></Guard>} />
        <Route path="logistics/grn/:grnNo" element={<Guard area="grn"><GrnDetail /></Guard>} />
        <Route path="logistics/grn" element={<Guard area="grn"><GoodsReceipt /></Guard>} />
        <Route path="logistics/quality/new" element={<Guard area="inspections" action="create"><QualityInspectionForm /></Guard>} />
        <Route path="logistics/quality/:inspectionNo" element={<Guard area="inspections"><InspectionDetail /></Guard>} />
        <Route path="logistics/quality" element={<Guard area="inspections"><QualityInspection /></Guard>} />
        <Route path="logistics/inventory/new" element={<Guard area="inventory" action="create"><InventoryForm /></Guard>} />
        <Route path="logistics/inventory/:inventoryId/360" element={<Guard area="inventory"><Document360View type="inventory" /></Guard>} />
        <Route path="logistics/inventory/:inventoryId" element={<Guard area="inventory"><InventoryDetail /></Guard>} />
        <Route path="logistics/inventory" element={<Guard area="inventory"><InventoryUpdate /></Guard>} />

        {/* Purchase Invoice */}
        <Route path="invoices/new" element={<Guard area="invoices" action="create"><InvoiceCreate /></Guard>} />
        <Route path="invoices/notes/new" element={<Guard area="adjustmentNotes" action="create"><AdjustmentNoteCreate /></Guard>} />
        <Route path="invoices/notes" element={<Guard area="adjustmentNotes"><AdjustmentNotesList /></Guard>} />
        <Route path="invoices/three-way-matching" element={<Guard area="invoiceMatching"><ThreeWayMatching /></Guard>} />
        <Route path="invoices/payment-approval" element={<Guard area="payments"><PaymentApproval /></Guard>} />
        <Route path="invoices/vendor-payment" element={<Guard area="payments"><VendorPayment /></Guard>} />
        <Route path="invoices/payment-advice" element={<Guard area="payments"><PaymentAdvice /></Guard>} />
        <Route path="invoices/:id/edit" element={<Guard area="invoices" action="edit"><InvoiceEdit /></Guard>} />
        <Route path="invoices/:id/print" element={<Guard area="invoices" action="print"><InvoicePrint /></Guard>} />
        <Route path="invoices/:id/360" element={<Guard area="invoices"><Document360View type="invoice" /></Guard>} />
        <Route path="invoices/:id" element={<Guard area="invoices"><InvoiceView /></Guard>} />
        <Route path="invoices" element={<Guard area="invoices"><InvoiceList /></Guard>} />
        <Route path="invoice" element={<Navigate to="/purchase/invoices" replace />} />

        {/* Payment 360 — keyed by payment advice / payment number */}
        <Route path="payments/:paymentId/360" element={<Guard area="payments"><Document360View type="payment" /></Guard>} />

        {/* Documents */}
        <Route path="documents" element={<Guard area="documents"><PurchaseDocuments /></Guard>} />

        {/* Reports */}
        <Route path="reports" element={<Navigate to="/purchase/reports/dashboard" replace />} />
        <Route path="reports/dashboard" element={<Guard area="reports"><ReportsDashboard /></Guard>} />
        <Route path="reports/insights" element={<Guard area="reports"><PurchaseReports /></Guard>} />
        <Route path="reports/spend-analysis" element={<Guard area="reports"><SpendAnalysis /></Guard>} />
        <Route path="reports/vendor-analysis" element={<Guard area="reports"><VendorAnalysis /></Guard>} />
        <Route path="reports/procurement" element={<Guard area="reports"><ProcurementAnalytics /></Guard>} />

        {/* Settings — one page, section driven by ?section= */}
        <Route path="settings" element={<Guard area="settings"><Settings /></Guard>} />
        <Route path="settings/overview" element={<Navigate to="/purchase/settings?section=health" replace />} />
        <Route path="settings/approval-matrix" element={<Navigate to="/purchase/settings?section=approval" replace />} />
        <Route path="settings/approval-rules" element={<Navigate to="/purchase/settings?section=approvalRules" replace />} />
        <Route path="settings/budget" element={<Navigate to="/purchase/settings?section=budget" replace />} />
        <Route path="settings/matching" element={<Navigate to="/purchase/settings?section=matching" replace />} />
        <Route path="settings/tax" element={<Navigate to="/purchase/settings?section=tax" replace />} />
        <Route path="settings/currency" element={<Navigate to="/purchase/settings?section=currency" replace />} />
        <Route path="settings/exchange-rates" element={<Navigate to="/purchase/settings?section=exchangeRates" replace />} />
        <Route path="settings/payment-terms" element={<Navigate to="/purchase/settings?section=payment" replace />} />
        <Route path="settings/hsn" element={<Navigate to="/purchase/settings?section=hsn" replace />} />
        <Route path="settings/items" element={<Navigate to="/purchase/settings?section=items" replace />} />
        <Route path="settings/procurement-defaults" element={<Navigate to="/purchase/settings?section=procurementDefaults" replace />} />
        <Route path="settings/logistics" element={<Navigate to="/purchase/settings?section=logistics" replace />} />
        <Route path="settings/documents" element={<Navigate to="/purchase/settings?section=pdf" replace />} />
        <Route path="settings/terms" element={<Navigate to="/purchase/settings?section=terms" replace />} />
        <Route path="settings/company" element={<Navigate to="/purchase/settings?section=company" replace />} />
        <Route path="settings/document-numbering" element={<Navigate to="/purchase/settings?section=numbering" replace />} />
        <Route path="settings/workflow" element={<Navigate to="/purchase/settings?section=workflow" replace />} />
        <Route path="settings/notifications" element={<Navigate to="/purchase/settings?section=notifications" replace />} />
        <Route path="settings/audit" element={<Navigate to="/purchase/settings?section=audit" replace />} />

        <Route path="*" element={<Navigate to="/purchase/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
