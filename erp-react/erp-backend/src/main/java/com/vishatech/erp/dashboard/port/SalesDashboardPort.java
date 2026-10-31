package com.vishatech.erp.dashboard.port;

import com.vishatech.erp.dashboard.dto.SalesCounts;

/**
 * The ERP dashboard's read view of the sales document chain (quotation →
 * contract → customer purchase order → delivery challan / proforma invoice →
 * invoice → payment receipt, plus credit notes).
 *
 * <p>See {@link CrmDashboardPort} for the ownership and behaviour rules this
 * interface follows. The sales document chain publishes one stats document per
 * document type; the implementation reads those documents and returns one
 * dashboard-owned record, so the aggregation code never sees a sales service.
 */
public interface SalesDashboardPort {

    /** All sales counters the ERP dashboard renders. */
    SalesCounts counts();
}
