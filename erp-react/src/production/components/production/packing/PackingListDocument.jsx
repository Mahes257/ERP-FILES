import React, { useMemo, useCallback } from 'react';
import { ensureBoxes, boxTotals, overallTotals } from '../../../data/packing';
import { formatDate } from '../../../utils/format';
import Letterhead from '../../../../components/SalesDesign/Letterhead';

/**
 * Packing List Document — single source of truth for the document layout.
 *
 * Renders the approved dark-teal / white / light-gray A4 document with the
 * VISHAK TECH industrial logo, the PACKING LIST banner, and the editable
 * document body. Same component powers Preview, Edit, Print and PDF.
 *
 * TABLE STRUCTURE (7 columns):
 *   S.NO | Marks & Nos / Container No | No & Kind of Pkgs | Description of Goods | Qty | NET Weight (KGS) | Gross Weight (KGS)
 */
export default function PackingListDocument({ record, editing = false, onFieldChange }) {
  const rec = useMemo(() => ensureBoxes(record), [record]);
  const boxes = useMemo(() => rec.packingBoxes || [], [rec]);
  const totals = useMemo(() => overallTotals(boxes), [boxes]);
  const exporterName = rec.exporterName || 'VISHAK TECH';

  // Editable text field helper.
  // In view mode the field shows its value or a clean '—' placeholder.
  // In edit mode it renders an inline-input that visually blends into the document.
  const EditableField = useCallback(({ field, value, className = '', bold = false }) => {
    const displayValue = value || '';
    if (!editing) {
      return (
        <span className={className} style={bold ? { fontWeight: 700 } : undefined}>
          {displayValue || '—'}
        </span>
      );
    }
    return (
      <input
        type="text"
        className={`pl-edit-field ${className}`}
        value={displayValue}
        onChange={(e) => onFieldChange && onFieldChange(field, e.target.value)}
      />
    );
  }, [editing, onFieldChange]);

  // Editable multiline field helper.
  const EditableTextarea = useCallback(({ field, value, className = '', rows = 2 }) => {
    const displayValue = value || '';
    if (!editing) {
      return (
        <span className={className}>
          {displayValue || '—'}
        </span>
      );
    }
    return (
      <textarea
        className={`pl-edit-field pl-edit-textarea ${className}`}
        rows={rows}
        value={displayValue}
        onChange={(e) => onFieldChange && onFieldChange(field, e.target.value)}
      />
    );
  }, [editing, onFieldChange]);

  // ====================================================================
  // Build packing table rows
  //
  // Column layout (7 columns):
  //   0: S.NO
  //   1: Marks & Nos / Container No
  //   2: No & Kind of Pkgs
  //   3: Description of Goods
  //   4: Qty
  //   5: NET Weight (KGS)
  //   6: Gross Weight (KGS)
  //
  // Box header row: all 7 cells, but cols 1, 2, 6 are rowSpan'd
  // Item rows: only 4 cells — col 0 (S.NO), col 3 (Desc), col 4 (Qty), col 5 (Net)
  // ====================================================================
  let globalItemNo = 0;
  const packingRows = [];

  boxes.forEach((box) => {
    const bt = boxTotals(box);
    const dimStr = box.length && box.width && box.height
      ? `(${box.length}*${box.width}*${box.height})` : '';
    const pkgType = box.packageType || 'WOODEN BOX';
    const items = box.items || [];
    const itemCount = items.length || 1;

    // ── No separate box header row — box info merges into first item row.
    // This avoids the duplicate S.NO and floating Gross Weight problem.

    // ── Item rows (7 cells each) ──────────────────────────────────
    // First item row: S.NO | Marks | Pkg | Description | Qty | Net | Gross
    // Subsequent item rows: S.NO | (Marks occupied) | (Pkg occupied) | Description | Qty | Net | (Gross occupied)
    items.forEach((item, itemIdx) => {
      globalItemNo++;
      const descLines = [];
      if (item.description) descLines.push(item.description);
      if (item.partNumber) descLines.push(item.partNumber);
      if (item.manufacturer) descLines.push(`Manufacturer: ${item.manufacturer}`);
      if (item.countryOfOrigin) descLines.push(`Country of origin: ${item.countryOfOrigin}`);
      if (item.hsCode) descLines.push(`HS code ${item.hsCode}`);

      const isFirstItem = itemIdx === 0;
      const remainingItems = items.length - 1;

      packingRows.push(
        <tr key={item.id || `item-${globalItemNo}`}>
          {/* Col 0: S.NO */}
          <td className="pl-center">{globalItemNo}</td>
          {/* Col 1: Marks — rowSpan from first item only */}
          {isFirstItem && (
            <td rowSpan={itemCount}>{box.marksNos || box.marks || ''}</td>
          )}
          {/* Col 2: Pkg — rowSpan from first item only */}
          {isFirstItem && (
            <td className="pl-box-pkg-cell" rowSpan={itemCount}>
              <div className="pl-box-pkg-text">{pkgType}</div>
              {dimStr && <div className="pl-box-dim-text">{dimStr}</div>}
            </td>
          )}
          {/* Col 3: Description of Goods */}
          <td className="pl-desc">
            <div className="pl-desc-multiline">{descLines.join('\n')}</div>
          </td>
          {/* Col 4: Qty */}
          <td className="pl-center">
            {item.quantity || 0} {item.unit || ''}
          </td>
          {/* Col 5: Net Weight */}
          <td className="pl-center">
            {item.netWeight > 0 ? Number(item.netWeight).toFixed(2) : ''}
          </td>
          {/* Col 6: Gross — rowSpan from first item only */}
          {isFirstItem && (
            <td className="pl-center" rowSpan={itemCount}>
              {bt.gross > 0 ? bt.gross.toFixed(2) : ''}
            </td>
          )}
        </tr>
      );
    });
  });

  const totalBoxesStr = totals.boxes === 1 ? '1 WOODEN BOXES' : `${totals.boxes} WOODEN BOXES`;

  // Weight summary rows
  const weightSummaryRows = boxes.map((box, idx) => {
    const bt = boxTotals(box);
    return (
      <tr key={`ws-${box.id}`}>
        <td className="pl-center">{idx + 1}</td>
        <td>{box.marksNos || box.marks || '—'}</td>
        <td className="pl-center">{bt.net > 0 ? bt.net.toFixed(2) : ''}</td>
        <td className="pl-center">{bt.gross > 0 ? bt.gross.toFixed(2) : ''}</td>
      </tr>
    );
  });

  return (
    <article className="pl-document">
      {/* ===== PAGE 1: HEADER + DOCUMENT BODY ===== */}
      <div className="pl-page pl-page-1">
        <div className="pl-doc-title">PACKING LIST</div>

        {/* Company Letterhead — shared horizontal layout */}
        <Letterhead className="mb-3" />

        {/* Document Details (right top) */}
        <table className="pl-doc-details-table">
          <tbody>
            <tr className={"pl-doc-details-row ${editing ? 'pl-editing' : ''}"}>
              <td className="pl-doc-details-label">
                <span>INVOICE NO &amp; DATE</span>
              </td>
              <td className="pl-doc-details-value">
                <EditableField
                  field="invoiceNo"
                  value={rec.invoiceNo || ''}
                  className="pl-doc-details-value"
                />
                <span className="pl-doc-details-sep">/</span>
                <EditableField
                  field="invoiceDate"
                  value={rec.invoiceDate || ''}
                  className="pl-doc-details-value"
                />
              </td>
            </tr>
            <tr className={"pl-doc-details-row ${editing ? 'pl-editing' : ''}"}>
              <td className="pl-doc-details-label">
                <span>BUYER&apos;S ORDER NO &amp; DATE</span>
              </td>
              <td className="pl-doc-details-value">
                <EditableField
                  field="buyersOrderNo"
                  value={rec.buyersOrderNo || ''}
                  className="pl-doc-details-value"
                />
                <span className="pl-doc-details-sep">/</span>
                <EditableField
                  field="buyersOrderDate"
                  value={rec.buyersOrderDate || ''}
                  className="pl-doc-details-value"
                />
              </td>
            </tr>
            <tr className={"pl-doc-details-row ${editing ? 'pl-editing' : ''}"}>
              <td className="pl-doc-details-label">
                <span>CONTRACT NO &amp; DATE</span>
              </td>
              <td className="pl-doc-details-value">
                <EditableField
                  field="contractNo"
                  value={rec.contractNo || ''}
                  className="pl-doc-details-value"
                />
                <span className="pl-doc-details-sep">/</span>
                <EditableField
                  field="contractDate"
                  value={rec.contractDate || ''}
                  className="pl-doc-details-value"
                />
              </td>
            </tr>
            <tr className={"pl-doc-details-row ${editing ? 'pl-editing' : ''}"}>
              <td className="pl-doc-details-label">
                <span>EXPORTER&apos;S REF.</span>
              </td>
              <td className="pl-doc-details-value">
                <EditableField
                  field="exporterRef"
                  value={rec.exporterRef || ''}
                  className="pl-doc-details-value"
                />
              </td>
            </tr>
            <tr className={"pl-doc-details-row ${editing ? 'pl-editing' : ''}"}>
              <td className="pl-doc-details-label">
                <span>GSTIN NO.</span>
              </td>
              <td className="pl-doc-details-value">
                <EditableField
                  field="gstin"
                  value={rec.gstin || ''}
                  className="pl-doc-details-value"
                />
              </td>
            </tr>
            <tr className={"pl-doc-details-row ${editing ? 'pl-editing' : ''}"}>
              <td className="pl-doc-details-label">
                <span>PAN</span>
              </td>
              <td className="pl-doc-details-value">
                <EditableField
                  field="pan"
                  value={rec.pan || ''}
                  className="pl-doc-details-value"
                />
              </td>
            </tr>
          </tbody>
        </table>

        {/* Left top: Exporter / Manufacturer multiline */}
        <table className="pl-row-table">
          <tbody>
            <tr>
              <td className="pl-row-cell pl-exporter-cell">
                <div className="pl-section-label">EXPORTER / MANUFACTURER</div>
                <EditableTextarea
                  field="exporterName"
                  value={rec.exporterName || ''}
                  className="pl-multiline-field"
                  rows={4}
                />
                <div className="pl-hint-row">
                  <span className="pl-ship-icon">📍</span>
                  <EditableField field="exporterAddress" value={rec.exporterAddress || ''} className="pl-hint-value" />
                </div>
                <div className="pl-hint-row">
                  <span className="pl-ship-icon">✉</span>
                  <EditableField field="exporterEmail" value={rec.exporterEmail || ''} className="pl-hint-value" />
                </div>
                <div className="pl-hint-row">
                  <span className="pl-ship-icon">☎</span>
                  <EditableField field="exporterPhone" value={rec.exporterPhone || ''} className="pl-hint-value" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Second section: Buyer / Consignee + Other Details */}
        <table className="pl-section-bucket">
          <tbody>
            <tr className="pl-section-row">
              <td className="pl-section-cell pl-buyer-cell">
                <div className="pl-section-label">BUYER / CONSIGNEE</div>
                <EditableTextarea
                  field="buyerName"
                  value={rec.buyerName || ''}
                  className="pl-multiline-field"
                  rows={3}
                />
                <div className="pl-hint-row">
                  <span className="pl-shiptype-icon">📍</span>
                  <EditableField field="buyerAddress" value={rec.buyerAddress || ''} className="pl-hint-value" />
                </div>
              </td>
              <td className="pl-section-cell pl-other-cell">
                <div className="pl-section-label">OTHER DETAILS</div>
                <div className="pl-other-grid">
                  <div className="pl-other-row">
                    <span className="pl-other-label">COUNTRY OF ORIGIN OF GOODS</span>
                    <span className="pl-other-sep">:</span>
                    <span className="pl-other-value">
                      <EditableField field="countryOfOrigin" value={rec.countryOfOrigin || ''} />
                    </span>
                  </div>
                  <div className="pl-other-row">
                    <span className="pl-other-label">COUNTRY OF FINAL DESTINATION</span>
                    <span className="pl-other-sep">:</span>
                    <span className="pl-other-value">
                      <EditableField field="countryOfFinalDestination" value={rec.countryOfFinalDestination || ''} />
                    </span>
                  </div>
                  <div className="pl-other-row">
                    <span className="pl-other-label">HS CODE</span>
                    <span className="pl-other-sep">:</span>
                    <span className="pl-other-value">
                      <EditableField field="hsCode" value={rec.hsCode || ''} />
                    </span>
                  </div>
                  <div className="pl-other-row">
                    <span className="pl-other-label">COMMODITY</span>
                    <span className="pl-other-sep">:</span>
                    <span className="pl-other-value">
                      <EditableField field="commodity" value={rec.commodity || ''} />
                    </span>
                  </div>
                  <div className="pl-other-row">
                    <span className="pl-other-label">PORT OF DISCHARGE</span>
                    <span className="pl-other-sep">:</span>
                    <span className="pl-other-value">
                      <EditableField field="portOfDischarge" value={rec.portOfDischarge || ''} />
                    </span>
                  </div>
                  <div className="pl-other-row">
                    <span className="pl-other-label">PORT OF DELIVERY</span>
                    <span className="pl-other-sep">:</span>
                    <span className="pl-other-value">
                      <EditableField field="portOfDelivery" value={rec.portOfDelivery || ''} />
                    </span>
                  </div>
                  <div className="pl-other-row">
                    <span className="pl-other-label">TERMS OF DELIVERY</span>
                    <span className="pl-other-sep">:</span>
                    <span className="pl-other-value">
                      <EditableField field="termsOfDelivery" value={rec.termsOfDelivery || ''} />
                    </span>
                  </div>
                  <div className="pl-other-row">
                    <span className="pl-other-label">PAYMENT TERMS</span>
                    <span className="pl-other-sep">:</span>
                    <span className="pl-other-value">
                      <EditableField field="paymentTerms" value={rec.paymentTerms || ''} />
                    </span>
                  </div>
                </div>
              </td>
            </tr>
            <tr className="pl-section-row">
              <td className="pl-section-cell pl-ship-cell">
                <div className="pl-section-label">SHIPMENT DETAILS</div>
                <div className="pl-ship-other-grid">
                  <div className="pl-other-row">
                    <span className="pl-other-label">PRE-CARRIAGE BY</span>
                    <span className="pl-other-sep">:</span>
                    <span className="pl-other-value">
                      <EditableField field="preCarriageBy" value={rec.preCarriageBy || ''} />
                    </span>
                  </div>
                  <div className="pl-other-row">
                    <span className="pl-other-label">PLACE OF RECEIPT</span>
                    <span className="pl-other-sep">:</span>
                    <span className="pl-other-value">
                      <EditableField field="placeOfReceipt" value={rec.placeOfReceipt || ''} />
                    </span>
                  </div>
                  <div className="pl-other-row">
                    <span className="pl-other-label">VESSEL / FLIGHT NO</span>
                    <span className="pl-other-sep">:</span>
                    <span className="pl-other-value">
                      <EditableField field="vesselFlight" value={rec.vesselFlight || ''} />
                    </span>
                  </div>
                  <div className="pl-other-row">
                    <span className="pl-other-label">PORT OF LOADING</span>
                    <span className="pl-other-sep">:</span>
                    <span className="pl-other-value">
                      <EditableField field="portOfLoading" value={rec.portOfLoading || ''} />
                    </span>
                  </div>
                </div>
              </td>
              <td className="pl-section-cell pl-other-cell pl-empty-other">
                &nbsp;
              </td>
            </tr>
          </tbody>
        </table>

      <div className="pl-page-break" />
    </div>

      {/* ===== PAGE 2: PACKING TABLE ===== */}
      <div className="pl-page pl-page-2">
        <table className="pl-packing-table">
          <colgroup>
            <col className="pl-col-no" />
            <col className="pl-col-marks" />
            <col className="pl-col-pkg" />
            <col className="pl-col-desc" />
            <col className="pl-col-qty" />
            <col className="pl-col-net" />
            <col className="pl-col-gross" />
          </colgroup>
          <thead>
            <tr>
              <th>S.NO</th>
              <th>Marks &amp; Nos / Container No</th>
              <th>No &amp; Kind of Pkgs</th>
              <th>Description of Goods</th>
              <th>Qty</th>
              <th>NET Weight (KGS)</th>
              <th>Gross Weight (KGS)</th>
            </tr>
          </thead>
          <tbody>{packingRows}</tbody>
          <tfoot>
            <tr className="pl-total-row">
              <td></td>
              <td className="pl-center pl-strong">TOTAL</td>
              <td className="pl-strong">{totalBoxesStr}</td>
              <td className="pl-strong">{totals.totalItems} {totals.totalItems === 1 ? 'ITEM' : 'ITEMS'}</td>
              <td className="pl-center pl-strong">{totals.qty > 0 ? `${totals.qty} NOS` : ''}</td>
              <td className="pl-center pl-strong">{totals.net > 0 ? `${totals.net.toFixed(2)} KGS` : ''}</td>
              <td className="pl-center pl-strong">{totals.gross > 0 ? `${totals.gross.toFixed(2)} KGS` : ''}</td>
            </tr>
          </tfoot>
        </table>

        <div className="pl-weight-summary-section">
          <div className="pl-weight-summary-title">NET WEIGHT : GROSS WEIGHT</div>
          <table className="pl-weight-summary-table">
            <thead>
              <tr>
                <th>BOX NO</th>
                <th>MARKS &amp; NOS / CONTAINER NO</th>
                <th>NET (KGS)</th>
                <th>GROSS (KGS)</th>
              </tr>
            </thead>
            <tbody>{weightSummaryRows}</tbody>
          </table>
        </div>

        <div className="pl-weight-lines">
          <div className="pl-weight-line">
            <strong>NET WEIGHT</strong> : {totals.net > 0 ? `${totals.net.toFixed(2)} KGS` : '—'}
          </div>
          <div className="pl-weight-line">
            <strong>GROSS WEIGHT</strong> : {totals.gross > 0 ? `${totals.gross.toFixed(2)} KGS` : '—'}
          </div>
        </div>

        <div className="pl-footer-section">
          <div className="pl-declaration-ref">
            <div className="pl-decl-title">DECLARATION</div>
            <div className="pl-decl-text">
              <EditableTextarea
                field="declaration"
                value={rec.declaration || 'We declare that this Packing List shows the actual weight of the goods described and that all particulars are true and correct.'}
                className="pl-decl-text"
                rows={3}
              />
            </div>
          </div>

          <div className="pl-sign-area">
            <div className="pl-sign-block">
              <div className="pl-sign-company">For {exporterName}</div>
              <div className="pl-sign-stamp">
                {rec.signatureImage ? (
                  <img
                    src={rec.signatureImage}
                    alt="Signature"
                    className="pl-sign-img"
                  />
                ) : (
                  <div className="pl-sign-placeholder">
                    <svg viewBox="0 0 100 100" className="pl-stamp-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <defs>
                        <path id="stamp-top-arc" d="M 10,50 a 40,40 0 0,1 80,0" fill="none" />
                      </defs>
                      <circle cx="50" cy="50" r="46" fill="none" stroke="#0f6e6e" strokeWidth="2" />
                      <circle cx="50" cy="50" r="32" fill="none" stroke="#0f6e6e" strokeWidth="1.2" />
                      <text fill="#0f6e6e" fontSize="9" fontWeight="700" letterSpacing="2">
                        <textPath href="#stamp-top-arc" startOffset="50%" textAnchor="middle">VISHAK TECH</textPath>
                      </text>
                      <text x="50" y="78" textAnchor="middle" fill="#0f6e6e" fontSize="8">★</text>
                      <circle cx="50" cy="50" r="13" fill="none" stroke="#0f6e6e" strokeWidth="1.2" />
                      <text x="50" y="54" textAnchor="middle" fill="#0f6e6e" fontSize="7">SIG</text>
                    </svg>
                  </div>
                )}
              </div>
              <div className="pl-sign-line" />
              <div className="pl-sign-label">Authorized Signatory</div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}


