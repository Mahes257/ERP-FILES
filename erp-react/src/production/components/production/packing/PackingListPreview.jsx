import Icon from '../../icons/Icon';
import PackingListDocument from './PackingListDocument';
import { captureSheetToPdf } from '../../../../utils/quotationPrintUtils';
import './PackingList.css';

/**
 * Packing List document preview — modal overlay version.
 * Used when clicking "View" from the Packing list page.
 */
export default function PackingListPreview({ record, onClose }) {
  const doPrint = () => {
    const docEl = document.querySelector('.pl-document');
    if (!docEl) { alert('Document not found.'); return; }
    window.print();
  };

  const doDownload = async () => {
    const docEl = document.querySelector('.pl-document');
    if (!docEl) { alert('Document not found.'); return; }
    await captureSheetToPdf(docEl, { filename: `packing-list-${record?.id || 'document'}` });
  };

  return (
    <div className="pl-overlay" role="dialog" aria-modal="true" aria-label={`Packing List ${record?.id}`}>
      <div className="pl-toolbar">
        <div className="pl-toolbar-title">
          <Icon name="file-text" size={16} /> Packing List — {record?.id}
        </div>
        <div className="pl-toolbar-actions">
          <button type="button" className="btn btn-secondary" onClick={doPrint}>
            <Icon name="printer" size={14} /> Print PDF
          </button>
          <button type="button" className="btn btn-primary" onClick={doDownload}>
            <Icon name="download" size={14} /> Download PDF
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            <Icon name="x" size={14} /> Close
          </button>
        </div>
      </div>

      <div className="pl-scroll">
        <PackingListDocument record={record} editing={false} />
      </div>
    </div>
  );
}
