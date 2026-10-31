import React, { useState } from 'react';
import Modal from '../Modal';
import Icon from '../../icons/Icon';

const UNITS = ['Pcs', 'Nos', 'Kg', 'Ton', 'Mtr', 'Ltr', 'Set', 'Pair', 'Box'];

let rowSeq = 0;
const nextRowId = () => `so-item-${Date.now()}-${rowSeq++}`;

const blankItem = () => ({
  id: nextRowId(),
  productName: '',
  productCode: '',
  description: '',
  quantity: '',
  unit: 'Pcs',
  rate: '',
  deliveryDate: '',
  remarks: '',
});

/**
 * Modal for creating a Sales Order from inside the Production Order
 * form. The Sales Order Number is auto-generated and read-only; the
 * user enters the customer master once and then ANY number of items
 * via the dynamic item table ([ + Add Item ]). Item rows carry:
 *
 *   Product / Item, Product Code, Description, Quantity, Unit,
 *   Rate, Amount (auto = qty × rate), Delivery Date, Remarks
 *
 * There is no fixed item limit — the table grows dynamically.
 */
export default function SalesOrderModal({ salesOrderNumber, onCreate, onCancel }) {
  const [values, setValues] = useState({
    customerName: '',
    customerCode: '',
    items: [blankItem()],
  });
  const [error, setError] = useState('');

  const set = (key) => (e) => setValues((prev) => ({ ...prev, [key]: e.target.value }));

  const setItem = (index, key, value) =>
    setValues((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    }));

  const addItem = () => setValues((prev) => ({ ...prev, items: [...prev.items, blankItem()] }));

  const removeItem = (index) =>
    setValues((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));

  const amountOf = (item) => {
    const qty = Number(item.quantity);
    const rate = item.rate === '' || item.rate == null ? null : Number(item.rate);
    return rate == null || !qty ? '' : qty * rate;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!String(values.customerName).trim()) {
      setError('Please enter the customer name.');
      return;
    }
    if (!String(values.customerCode).trim()) {
      setError('Please enter the customer code.');
      return;
    }
    if (values.items.length === 0) {
      setError('Add at least one item to the Sales Order.');
      return;
    }
    const trimmed = values.items.map((item, index) => ({ item, index }));
    for (const { item, index } of trimmed) {
      if (!String(item.productName).trim()) {
        setError(`Item ${index + 1}: product / item name is required.`);
        return;
      }
      if (!(Number(item.quantity) > 0)) {
        setError(`Item ${index + 1}: quantity must be greater than zero.`);
        return;
      }
      if (!String(item.deliveryDate).trim()) {
        setError(`Item ${index + 1}: delivery date is required.`);
        return;
      }
      if (item.rate !== '' && item.rate != null && Number(item.rate) < 0) {
        setError(`Item ${index + 1}: rate cannot be negative.`);
        return;
      }
    }
    setError('');
    onCreate({
      customerName: values.customerName.trim(),
      customerCode: values.customerCode.trim(),
      items: values.items.map((item) => ({
        ...item,
        productName: item.productName.trim(),
        productCode: item.productCode.trim(),
        description: item.description.trim(),
        quantity: Number(item.quantity),
        rate: item.rate === '' || item.rate == null ? null : Number(item.rate),
        amount: amountOf(item),
        remarks: item.remarks.trim(),
      })),
    });
  };

  return (
    <Modal
      title="New Sales Order"
      size="lg"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" form="sales-order-form" className="btn btn-primary">
            <Icon name="check" size={15} /> Save Sales Order
          </button>
        </>
      }
    >
      <form id="sales-order-form" className="po-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="form-field">
            <span className="form-label">Sales Order Number *</span>
            <input className="form-input" value={salesOrderNumber} disabled />
            <span className="form-hint">Auto-generated</span>
          </label>

          <label className="form-field">
            <span className="form-label">Customer Name *</span>
            <input
              className="form-input"
              value={values.customerName}
              onChange={set('customerName')}
              placeholder="Customer name"
            />
          </label>

          <label className="form-field">
            <span className="form-label">Customer Code *</span>
            <input
              className="form-input"
              value={values.customerCode}
              onChange={set('customerCode')}
              placeholder="CUS-001"
            />
          </label>
        </div>

        <div className="so-items-head">
          <h4 className="so-items-title">Items</h4>
          <button type="button" className="btn btn-secondary" onClick={addItem}>
            <Icon name="plus" size={13} /> Add Item
          </button>
        </div>

        {values.items.length === 0 ? (
          <div className="so-items-empty">
            <p>No items added yet — click “Add Item” to add products to this Sales Order.</p>
          </div>
        ) : (
          <div className="so-items-wrap">
            <table className="data-table so-items-table">
              <thead>
                <tr>
                  <th className="so-col-no">#</th>
                  <th>Product / Item *</th>
                  <th className="so-col-code">Code</th>
                  <th>Description</th>
                  <th className="so-col-qty">Qty *</th>
                  <th className="so-col-unit">Unit</th>
                  <th className="so-col-rate">Rate</th>
                  <th className="so-col-amount">Amount</th>
                  <th className="so-col-date">Delivery *</th>
                  <th className="so-col-remarks">Remarks</th>
                  <th className="so-col-remove" />
                </tr>
              </thead>
              <tbody>
                {values.items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="so-cell-no">{index + 1}</td>
                    <td>
                      <input
                        className="form-input so-cell-input"
                        value={item.productName}
                        onChange={(e) => setItem(index, 'productName', e.target.value)}
                        placeholder="Product / item name"
                      />
                    </td>
                    <td>
                      <input
                        className="form-input so-cell-input"
                        value={item.productCode}
                        onChange={(e) => setItem(index, 'productCode', e.target.value)}
                        placeholder="PRD-001"
                      />
                    </td>
                    <td>
                      <input
                        className="form-input so-cell-input"
                        value={item.description}
                        onChange={(e) => setItem(index, 'description', e.target.value)}
                        placeholder="Optional description"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        className="form-input so-cell-input"
                        value={item.quantity}
                        onChange={(e) => setItem(index, 'quantity', e.target.value)}
                        placeholder="0"
                      />
                    </td>
                    <td>
                      <select
                        className="form-select so-cell-input"
                        value={item.unit}
                        onChange={(e) => setItem(index, 'unit', e.target.value)}
                        aria-label={`Unit for item ${index + 1}`}
                      >
                        {UNITS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="form-input so-cell-input"
                        value={item.rate}
                        onChange={(e) => setItem(index, 'rate', e.target.value)}
                        placeholder="0.00"
                      />
                    </td>
                    <td className="so-cell-amount">
                      {amountOf(item) === '' ? '—' : Number(amountOf(item)).toLocaleString()}
                    </td>
                    <td>
                      <input
                        type="date"
                        className="form-input so-cell-input"
                        value={item.deliveryDate}
                        onChange={(e) => setItem(index, 'deliveryDate', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="form-input so-cell-input"
                        value={item.remarks}
                        onChange={(e) => setItem(index, 'remarks', e.target.value)}
                        placeholder="Optional"
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-icon btn-icon-danger so-remove-btn"
                        title={`Remove item ${index + 1}`}
                        aria-label={`Remove item ${index + 1}`}
                        onClick={() => removeItem(index)}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="so-items-hint">
          Items are dynamic — add as many as needed (1, 5, 20, 100+). Amount is calculated
          automatically as Quantity × Rate.
        </p>

        {error && (
          <p className="form-error">
            <Icon name="info" size={14} /> {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
