/**
 * purchase/index.js
 * ------------------------------------------------------------------
 * Public entry point for the self-contained Purchase package.
 * Import the module's own routes, menu data, service facade and
 * shared constants without touching internals.
 * ------------------------------------------------------------------
 */
import PurchaseRoutes from './routes/purchaseRoutes';

export { PurchaseRoutes };
export { PURCHASE_CATEGORIES } from './constants/menu';
export { purchaseService, default as purchaseServiceDefault } from './services/index';
export * from './constants';

export default PurchaseRoutes;
