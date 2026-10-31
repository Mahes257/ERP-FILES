/**
 * purchase/services/index.js
 * ------------------------------------------------------------------
 * Aggregates every Purchase mock service into a single `purchaseService`
 * facade (plus a default export) so pages can either use the facade or
 * import individual domain services. This is the seam where the mock
 * storage (services/base.js) can be swapped for a real backend client
 * without touching the UI.
 * ------------------------------------------------------------------
 */
import { dashboardService } from './dashboard';
import { requisitionService } from './requisition';
import { vendorService } from './vendor';
import { rfqService } from './rfq';
import { purchaseOrderService } from './purchaseOrder';
import { invoiceService } from './invoice';
import { settingsService } from './settings';
import { reportsService } from './reports';
import { evaluationService } from './evaluation';
import { logisticsService } from './logistics';
import { rfqFollowUpService } from './rfqFollowUp';
import { platform } from './platform';
import { notificationFeedService } from './notificationFeed';
import { globalSearchService } from './globalSearch';
import { calcDocumentTotals } from '../utils/purchase';

export { dashboardService } from './dashboard';
export { requisitionService } from './requisition';
export { vendorService } from './vendor';
export { rfqService } from './rfq';
export { purchaseOrderService } from './purchaseOrder';
export { invoiceService } from './invoice';
export { settingsService } from './settings';
export { reportsService } from './reports';
export { evaluationService } from './evaluation';
export { logisticsService } from './logistics';
export { rfqFollowUpService } from './rfqFollowUp';
export { notificationFeedService } from './notificationFeed';
export { globalSearchService } from './globalSearch';
export { platform, localAdapters } from './platform';
export { createCollection, delay, storageKeys } from './base';

export const purchaseService = {
  ...dashboardService,
  ...requisitionService,
  ...vendorService,
  ...rfqService,
  ...purchaseOrderService,
  ...invoiceService,
  ...settingsService,
  ...reportsService,
  ...evaluationService,
  ...logisticsService,
  ...rfqFollowUpService,
  notificationFeedService,
  globalSearchService,
  platform,
  calcDocumentTotals
};

export default purchaseService;
