/**
 * WorkOrderItemsPanel — read-only list of a Work Order's Production Items on the
 * Work Order detail screen.
 *
 * Each row shows the item's own due date and the files attached to THAT item.
 * Item attachments are read from the shared attachment store under the item's
 * own id (PRODUCTION_ORDER_ITEM), so a file can never appear under an item it
 * was not uploaded for. Nothing here writes: every action only opens/downloads.
 */
import { useEffect, useState } from 'react';
import api from '../../../api/axiosInstance';
import Icon from '../icons/Icon';
import { formatDate } from '../../utils/format';
import { fileTypeLabel, formatFileSize } from '../../../utils/attachmentStorage';

const listFromResponse = (body) =>
  (Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : []);

export default function WorkOrderItemsPanel({ order }) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const orderId = order?.backendId;
  const [state, setState] = useState({ key: '', byItem: {} });

  useEffect(() => {
    if (!orderId || items.length === 0) return undefined;
    const key = String(orderId);
    let cancelled = false;
    (async () => {
      const byItem = {};
      await Promise.all(
        items.map(async (item) => {
          if (item?.id == null) return;
          try {
            const response = await api.get(
              `/production-orders/${orderId}/items/${item.id}/attachments`
            );
            byItem[String(item.id)] = listFromResponse(response?.data);
          } catch {
            // A failed listing stays empty; it must not hide the item itself.
            byItem[String(item.id)] = [];
          }
        })
      );
      if (!cancelled) setState({ key, byItem });
    })();
    return () => {
      cancelled = true;
    };
    // `items` is recreated on each order update; the order id is what identifies
    // the set being read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, order?.updatedAt, items.length]);

  const attachmentsFor = (item) =>
    state.key === String(orderId) ? state.byItem[String(item?.id)] || [] : [];

  const openAttachment = async (attachment) => {
    if (!attachment?.url) return;
    try {
      const response = await api.get(attachment.url, { responseType: 'blob' });
      const blob = new Blob([response.data], {
        type: attachment.contentType || 'application/octet-stream',
      });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      // Nothing to report beyond the browser's own failure handling.
    }
  };

  const downloadAttachment = async (attachment) => {
    if (!attachment?.url) return;
    try {
      const response = await api.get(attachment.url, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data]));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.name || 'attachment';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      // Same as preview: a failed download changes nothing on the record.
    }
  };

  if (items.length === 0) {
    return <p className="wo-items-empty">No Production Items are recorded on this Work Order.</p>;
  }

  return (
    <div className="wo-items-panel">
      <div className="wo-items-panel-head">
        <h3 className="wo-items-panel-title">
          <Icon name="layers" size={15} /> Production Items
        </h3>
        <span className="wo-items-panel-count">
          {items.length} item{items.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="wo-items-panel-wrap">
        <table className="wo-items-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Item Code</th>
              <th>Production Type</th>
              <th className="wo-items-num">Quantity</th>
              <th>Item Due Date</th>
              <th>Attachments</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const files = attachmentsFor(item);
              return (
                <tr key={item.id ?? `${item.productName}-${index}`}>
                  <td>{index + 1}</td>
                  <td className="wo-items-name">{item.productName || item.product || '—'}</td>
                  <td>{item.productCode || '—'}</td>
                  <td>{item.productionType || '—'}</td>
                  <td className="wo-items-num">
                    {item.quantity != null ? item.quantity : '—'}
                    {item.unit ? ` ${item.unit}` : ''}
                  </td>
                  <td>
                    {item.dueDate ? formatDate(item.dueDate) : (
                      <span className="wo-items-muted" title="This item was created before item-wise due dates existed">
                        Not set
                      </span>
                    )}
                  </td>
                  <td>
                    {files.length === 0 ? (
                      <span className="wo-items-muted">No attachments</span>
                    ) : (
                      <ul className="wo-items-attach-list">
                        {files.map((file) => (
                          <li key={file.id}>
                            <span className="wo-items-attach-name" title={file.name}>
                              {file.name}
                            </span>
                            <span className="wo-items-attach-meta">
                              {fileTypeLabel(file.name, file.contentType)}
                              {file.size ? ` · ${formatFileSize(file.size)}` : ''}
                            </span>
                            {file.url && (
                              <span className="wo-items-attach-actions">
                                <button
                                  type="button"
                                  className="wo-items-attach-btn"
                                  title="Preview attachment"
                                  onClick={() => openAttachment(file)}
                                >
                                  <Icon name="eye" size={12} />
                                </button>
                                <button
                                  type="button"
                                  className="wo-items-attach-btn"
                                  title="Download attachment"
                                  onClick={() => downloadAttachment(file)}
                                >
                                  <Icon name="download" size={12} />
                                </button>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
