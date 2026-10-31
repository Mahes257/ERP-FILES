import React from 'react';
import ProductionStatusBadge from '../ProductionStatusBadge';
import ProductionProgress from '../ProductionProgress';
import { formatDateTime } from '../../../utils/format';

// Shared cell renderers for shop floor tables.

export const textCell = (value) => <td>{value ?? '—'}</td>;

export const qtyCell = (value) => <td>{value}</td>;

export const pendingCell = (job) => (
  <td>{Math.max(0, (Number(job.plannedQuantity) || 0) - (Number(job.completedQuantity) || 0) - (Number(job.rejectedQuantity) || 0))}</td>
);

export const timeCell = (value) => <td>{formatDateTime(value)}</td>;

export const statusCell = (status) => (
  <td>
    <ProductionStatusBadge status={status} />
  </td>
);

export const progressCell = (progress) => (
  <td>
    <ProductionProgress value={progress} />
  </td>
);
