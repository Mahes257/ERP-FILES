/**
 * Detail-page action roles → the shared ERP action-button classes
 * (styles/erp-detail-actions.css).
 *
 * The look of a Detail / Overview / View / Preview page's top action buttons
 * is defined ONCE in CSS; a module picks a role, never a colour. Every
 * renderer that draws that action area (DetailPage's DetailHeader, CprView,
 * Cost/Profit Workout View, SalesViewPage, QuotationViewPage) maps its roles
 * through here, so:

 *   [<- Back]  [Edit]  [PDF]  [Print]  [... More v]      secondary  (white)
 *   [Submit] [Approve] [Convert]                         primary    (ERP green)
 *   [Reject]                                             reject     (solid red)
 *   [Delete] / [Archive]                                 danger     (outlined rose)
 *
 * `green` and `approve` are aliases of `primary` on purpose: the older
 * emerald/`#059669` variants that a few pages used must never render as a
 * second, slightly different green.
 */
export const DETAIL_ACTION_CLASSES = {
  primary: 'erp-detail-action--primary',
  green: 'erp-detail-action--primary',
  approve: 'erp-detail-action--primary',
  secondary: '',
  ghost: '',
  reject: 'erp-detail-action--danger',
  danger: 'erp-detail-action--danger-ghost'
};

/** Full className for an action role (always includes the shared base). */
export function detailActionClass(role) {
  return `erp-detail-action ${DETAIL_ACTION_CLASSES[role] ?? ''}`.trim();
}
