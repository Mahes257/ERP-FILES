import React from 'react';
import Icon from './icons/Icon';

/**
 * Reusable PDF & Print action buttons.
 *
 * Props:
 *  - title: page/section title for the PDF header
 *  - tableSelector: CSS selector for the table to print (default '.data-table')
 *  - summarySelector: CSS selector for summary cards (default '.ack-page-summary')
 *  - containerRef: React ref to the printable container (alternative to selectors)
 *  - allowPrint / allowExport: Access Management gates (default allowed).
 *    The page passes `can(<area>, 'print')` / `can(<area>, 'export')`; the
 *    backend re-checks the data call, so hiding the button is only the UI half.
 */
export default function PdfPrintButtons({
  title,
  tableSelector = '.data-table',
  summarySelector,
  containerRef,
  allowPrint = true,
  allowExport = true
}) {
  /** Print the current page using browser print dialog */
  const handlePrint = () => {
    window.print();
  };

  /** Generate a simple PDF with table data using pdf-lib */
  const handlePdf = async () => {
    try {
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const page = pdfDoc.addPage([842, 595]); // Landscape A4

      let y = 560;
      const margin = 40;
      const pageWidth = 842;
      const usableWidth = pageWidth - 2 * margin;

      // Title
      page.drawText(title || 'Report', {
        x: margin,
        y,
        size: 18,
        font: boldFont,
        color: rgb(0.13, 0.55, 0.13),
      });
      y -= 10;

      // Date
      const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      page.drawText(`Generated: ${dateStr}`, {
        x: margin,
        y: y - 20,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
      y -= 35;

      // Get table data from DOM
      const tableEl = document.querySelector(tableSelector);
      if (!tableEl) {
        page.drawText('No table data found.', { x: margin, y, size: 12, font, color: rgb(0.5, 0.5, 0.5) });
      } else {
        const rows = Array.from(tableEl.querySelectorAll('tr'));
        const headerCells = rows[0] ? Array.from(rows[0].querySelectorAll('th, td')) : [];
        const headers = headerCells.map((c) => c.textContent.trim());

        // Calculate column widths evenly
        const colCount = headers.length;
        const colWidth = usableWidth / colCount;

        // Draw header row
        const headerY = y;
        page.drawRectangle({
          x: margin,
          y: headerY - 18,
          width: usableWidth,
          height: 22,
          color: rgb(0.13, 0.55, 0.13),
        });
        headers.forEach((h, i) => {
          page.drawText(h.substring(0, 30), {
            x: margin + i * colWidth + 4,
            y: headerY - 14,
            size: 8,
            font: boldFont,
            color: rgb(1, 1, 1),
          });
        });
        y = headerY - 28;

        // Draw data rows
        const dataRows = rows.slice(1);
        dataRows.forEach((row) => {
          if (y < 40) {
            // New page if we run out of space
            const newPage = pdfDoc.addPage([842, 595]);
            y = 560;
          }

          const cells = Array.from(row.querySelectorAll('td'));
          cells.forEach((cell, i) => {
            if (i < colCount) {
              const text = cell.textContent.trim().substring(0, 40);
              page.drawText(text, {
                x: margin + i * colWidth + 4,
                y,
                size: 7,
                font,
                color: rgb(0.1, 0.1, 0.1),
              });
            }
          });
          y -= 16;

          // Alternating row background
          if (dataRows.indexOf(row) % 2 === 0) {
            page.drawRectangle({
              x: margin,
              y: y + 4,
              width: usableWidth,
              height: 16,
              color: rgb(0.96, 0.97, 0.96),
              opacity: 0.3,
            });
          }
        });
      }

      // Footer
      page.drawText(`Page 1  |  ${title || 'Report'}`, {
        x: margin,
        y: 25,
        size: 7,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(title || 'report').replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr.replace(/\s+/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  if (!allowPrint && !allowExport) return null;

  return (
    <div className="pdf-print-buttons" style={{ display: 'flex', gap: 8 }}>
      {allowPrint && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handlePrint}
          title="Print this page"
        >
          <Icon name="printer" size={14} /> Print
        </button>
      )}
      {allowExport && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handlePdf}
          title="Download as PDF"
        >
          <Icon name="download" size={14} /> PDF
        </button>
      )}
    </div>
  );
}
