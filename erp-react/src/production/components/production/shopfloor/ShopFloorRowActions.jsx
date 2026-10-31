import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../icons/Icon';
import RowActionsDropdown from '../RowActionsDropdown';
import { useProductionOrders } from '../../../context/ProductionOrdersContext';
import useProductionAccess from '../../../access/useProductionAccess';

/**
 * Contextual shop floor row actions — rendered as a three-dot (⋮)
 * dropdown menu for consistency with all Production tables.
 *
 * Actions are dynamically built based on job status:
 *  Pending      → Start · View · Edit · Delete
 *  In Progress  → Hold · Complete · Skip · View · Edit · Delete
 *  Hold         → Resume · Complete · Skip · View · Edit · Delete
 *  Completed    → View · Edit · Delete
 */
export default function ShopFloorRowActions({
  job,
  onStart,
  onHold,
  onResume,
  onComplete,
  onSkip,
  onEdit,
  onDelete,
  /* Read-only preview route for this job's Work Order. Supplied by the shop
     floor board so the exact Work Order (plus this job as a highlight) is
     shown, never the first row or a hardcoded record. */
  previewPath,
  /* 'Quality Hold' feature flag (Settings → Production Parameters). When the
     parameter is off, holding a running job for QC is not offered at all —
     a disabled-looking action that still worked would misrepresent the setting. */
  canHold = true,
  /* The board's Production area (casting / fabrication / machineShop /
     assembly) — its own Access Management switches decide which of these row
     actions are offered. */
  area = null,
}) {
  const navigate = useNavigate();
  const { transitionOrderStatus } = useProductionOrders();
  const { can: canProduction } = useProductionAccess();
  // Presentation only: the backend refuses the same pairs on /castings,
  // /fabrications, /machine-shop and /assemblies.
  const allow = (action) => !area || canProduction(area, action);
  const allowPrint = !area || canProduction(area, 'print')
    || canProduction(area, 'view');

  const viewOrder = () => navigate(`/production/orders/${job.productionOrder}`);

  const sendToQuality = () => {
    transitionOrderStatus(job.productionOrder, 'Pending QC');
    navigate('/production/quality');
  };

  // Build status-dependent actions
  const actions = [];

  if (job.status === 'Pending' && allow('start')) {
    actions.push({
      label: 'Start',
      icon: <Icon name="play" size={13} />,
      onClick: () => onStart(job.id),
    });
  }

  if (job.status === 'In Progress') {
    if (canHold && allow('hold')) {
      actions.push({
        label: 'Hold',
        icon: <Icon name="pause" size={13} />,
        onClick: () => onHold(job.id),
      });
    }
    if (allow('complete')) {
      actions.push({
        label: 'Complete',
        icon: <Icon name="check" size={13} />,
        onClick: () => onComplete(job.id),
      });
    }
  }

  if (job.status === 'Hold') {
    if (allow('hold')) {
      actions.push({
        label: 'Resume',
        icon: <Icon name="rotate-ccw" size={13} />,
        onClick: () => onResume(job.id),
      });
    }
    if (allow('complete')) {
      actions.push({
        label: 'Complete',
        icon: <Icon name="check" size={13} />,
        onClick: () => onComplete(job.id),
      });
    }
  }

  if (!['Completed', 'Skipped'].includes(job.status) && onSkip && allow('skip')) {
    actions.push({
      label: 'Skip',
      icon: <Icon name="skip-forward" size={13} />,
      onClick: () => onSkip({ job, reason: '', remarks: '' }),
    });
  }

  if (job.stage === 'QC') {
    actions.push({
      label: 'Send to Quality',
      icon: <Icon name="shield-check" size={13} />,
      onClick: sendToQuality,
    });
  }

  actions.unshift({
    label: 'Preview',
    icon: <Icon name="eye" size={13} />,
    onClick: () => {
      if (previewPath) {
        navigate(previewPath);
      } else if (job.productionOrder) {
        navigate(`/production/preview/orders/${encodeURIComponent(job.productionOrder)}`);
      }
    },
  });

  actions.push({
    label: 'View Work Order',
    icon: <Icon name="external-link" size={13} />,
    onClick: viewOrder,
  });

  if (allowPrint) {
    actions.push({
      label: 'Print',
      icon: <Icon name="printer" size={13} />,
      onClick: () => window.print(),
    });
  }

  if (allowPrint) actions.push({
    label: 'Export PDF',
    icon: <Icon name="download" size={13} />,
    onClick: async () => {
      try {
        const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const page = pdfDoc.addPage([842, 595]);
        let y = 560;
        const margin = 40;
        page.drawText('Work Order - ' + job.productionOrder, { x: margin, y, size: 18, font: boldFont, color: rgb(0.13, 0.55, 0.13) });
        y -= 30;
        page.drawText('Work Order: ' + job.productionOrder, { x: margin, y, size: 11, font });
        y -= 18;
        page.drawText('Stage: ' + (job.stage || 'N/A'), { x: margin, y, size: 11, font });
        y -= 18;
        page.drawText('Status: ' + (job.status || 'N/A'), { x: margin, y, size: 11, font });
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${job.productionOrder}.pdf`; a.click();
        URL.revokeObjectURL(url);
      } catch (e) { console.error('PDF export failed', e); }
    },
  });

  if (onEdit && allow('edit')) {
    actions.push({
      label: 'Edit',
      icon: <Icon name="edit" size={13} />,
      onClick: () => onEdit(job),
    });
  }

  if (onDelete && allow('delete')) {
    actions.push({
      label: 'Delete',
      icon: <Icon name="trash" size={13} />,
      danger: true,
      onClick: () => onDelete(job),
    });
  }

  return <RowActionsDropdown actions={actions} />;
}
