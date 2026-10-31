import React, { useEffect, useRef, useState } from 'react';
import Icon from '../../icons/Icon';
import './QualityChecklist.css';

const RESULT_OPTIONS = ['Pass', 'Fail', 'N/A'];

/**
 * How long a free-text remarks edit waits before it is sent. Result buttons save
 * immediately; remarks are debounced so typing does not fire a request per key.
 */
const REMARKS_DEBOUNCE_MS = 500;

const resultClass = (result) => {
  if (result === 'Pass') return 'qc-item-pass';
  if (result === 'Fail') return 'qc-item-fail';
  return '';
};

/**
 * Generic demo QC checklist. Items are NOT claimed to be a
 * mandatory industry standard — they are placeholder checks the
 * user can extend later.
 *
 * The list is mirrored in local state so a click or a keystroke shows up at once;
 * each change is then persisted through `onUpdate` (PATCH .../checklist), which
 * reloads the record from the database. Without the local mirror the controls are
 * driven purely by the stored record and appear dead until the reload lands.
 */
export default function QualityChecklist({ inspection, onUpdate }) {
  const checklist = inspection.checklist || [];
  const [items, setItems] = useState(checklist);
  const timers = useRef({});

  // Re-sync whenever a different inspection loads, or the stored checklist changes
  // (e.g. after a save round trip).
  useEffect(() => {
    setItems(inspection.checklist || []);
  }, [inspection.id, inspection.checklist]);

  // Drop pending debounced saves when this checklist goes away.
  useEffect(() => () => {
    Object.values(timers.current).forEach(clearTimeout);
  }, []);

  const change = (index, patch, immediate = false) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    if (timers.current[index]) {
      clearTimeout(timers.current[index]);
      delete timers.current[index];
    }
    if (immediate) {
      onUpdate(inspection.id, index, patch);
      return;
    }
    timers.current[index] = setTimeout(() => {
      delete timers.current[index];
      onUpdate(inspection.id, index, patch);
    }, REMARKS_DEBOUNCE_MS);
  };

  if (items.length === 0) {
    return (
      <section className="qc-card">
        <h3 className="qc-title">QC Checklist</h3>
        <p className="qc-empty">No checklist items for this inspection.</p>
      </section>
    );
  }

  return (
    <section className="qc-card">
      <div className="qc-head">
        <h3 className="qc-title">QC Checklist</h3>
        <span className="qc-badge">Generic demo checks</span>
      </div>

      <div className="qc-list">
        {items.map((item, index) => (
          <div key={item.name} className={`qc-item ${resultClass(item.result)}`}>
            <div className="qc-item-row">
              <span className="qc-item-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="qc-item-name">{item.name}</span>
              <span className="qc-item-result">{item.result || '—'}</span>
            </div>
            <div className="qc-item-controls">
              <div className="qc-result-options">
                {RESULT_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`qc-option${item.result === option ? ' active' : ''}`}
                    onClick={() => change(index, { result: option }, true)}
                  >
                    {item.result === option && <Icon name="check" size={12} />}
                    {option}
                  </button>
                ))}
              </div>
              <input
                className="qc-remarks"
                type="text"
                value={item.remarks || ''}
                placeholder="Remarks..."
                onChange={(e) => change(index, { remarks: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
