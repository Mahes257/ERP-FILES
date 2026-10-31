import React from 'react';
import ProductionStatusBadge from './ProductionStatusBadge';

const COLUMNS = [
  'Material Code',
  'Material Name',
  'Required Qty',
  'Issued Qty',
  'Consumed Qty',
  'Unit',
  'Status',
];

export default function MaterialsTab({ materials }) {
  return (
    <div className="table-scroll">
      {/* Sticky grid (shared Production scope): the leading Material Code column
          is frozen (left: 0) while the remaining columns scroll. */}
      <table className="data-table sgrid sgrid-prod">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} className={column === COLUMNS[0] ? 'sgrid-pin sgrid-first' : undefined}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {materials.map((material) => (
            <tr key={material.materialCode}>
              <td className="cell-strong sgrid-pin sgrid-first">{material.materialCode}</td>
              <td>{material.materialName}</td>
              <td>{material.requiredQuantity}</td>
              <td>{material.issuedQuantity}</td>
              <td>{material.consumedQuantity}</td>
              <td>{material.unit}</td>
              <td>
                <ProductionStatusBadge status={material.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
