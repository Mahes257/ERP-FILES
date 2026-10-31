import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Eye, EyeOff, Lock, Pencil, Plus, X } from 'lucide-react';
import Modal from './Modal';
import { useToast } from './ToastContext';
import locationService, { locationApiError } from '../../services/locationService';
import { clearLocationCaches } from '../../hooks/useLocationMaster';
import { getStoredUser } from '../../services/tokenStorage';

const ROW_BTN = 'p-1 rounded text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer';
const ROW_BTN_ACTION =
  'p-1 rounded text-[#0B4A3D] hover:bg-[#0B4A3D]/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();

/**
 * The Location Master is a four-level tree: Country → State/Province →
 * District/Sub-region → City/Town. This is the same shape the cascading
 * address dropdowns read, so the modal browses all four levels; a city is
 * always created under the district it belongs to.
 */
const LEVELS = [
  { key: 'country', plural: 'Countries' },
  { key: 'state', plural: 'States / Provinces' },
  { key: 'district', plural: 'Districts / Sub-regions' },
  { key: 'city', plural: 'Cities / Towns' }
];

const STATUS_ACTIVE = 'Active';

/**
 * GeoOptionsModal — manage the Country → State → District → City tree that
 * powers every address select in the ERP.
 *
 * Everything is read from and written to the centralized Location Master API
 * (MySQL) — the ONE source of truth the Client and Lead forms already use — so
 * a change made here shows up in the actual dropdowns (open forms refresh
 * through clearLocationCaches). Mutations are ADMIN-only and enforced by the
 * backend; a rejected save is reported as an error and never as success.
 */
export default function GeoOptionsModal({ open, onClose }) {
  const toast = useToast();
  const [trail, setTrail] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [addText, setAddText] = useState('');
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');

  const isAdmin = String(getStoredUser()?.role || '').toUpperCase() === 'ADMIN';
  const level = LEVELS[trail.length] || LEVELS[LEVELS.length - 1];
  const parent = trail[trail.length - 1] || null;

  const fetchRows = useCallback(async () => {
    if (trail.length === 0) return locationService.adminCountries();
    if (trail.length === 1) return locationService.adminStates(parent.id);
    if (trail.length === 2) return locationService.adminDistricts(parent.id);
    return locationService.adminCities(parent.id);
  }, [trail, parent]);

  /** Reload the current level; resolves once the list (or the error) is shown. */
  const loadRows = useCallback(async () => {
    try {
      const list = await fetchRows();
      setRows(Array.isArray(list) ? list : []);
      setError('');
    } catch (err) {
      setRows([]);
      setError(locationApiError(err));
    } finally {
      setLoading(false);
    }
  }, [fetchRows]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    fetchRows()
      .then((list) => {
        if (cancelled) return;
        setRows(Array.isArray(list) ? list : []);
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setRows([]);
        setError(locationApiError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, fetchRows]);

  const levelLabel = useMemo(() => {
    if (trail.length === 0) return 'Countries';
    const path = trail.map((t) => t.name).join(' / ');
    return `${level.plural} — ${path}`;
  }, [trail, level]);

  const goBack = () => {
    setLoading(true);
    setTrail((prev) => prev.slice(0, -1));
    setAddText('');
    setEditing(null);
    setError('');
  };

  const openLevel = (row) => {
    if (trail.length >= LEVELS.length - 1) return; // cities are leaves
    setLoading(true);
    setTrail((prev) => [...prev, { id: row.id, name: row.name }]);
    setAddText('');
    setEditing(null);
    setError('');
  };

  /** One save path for every level so success is only reported after the API accepts it. */
  const save = async (action) => {
    setSaving(true);
    setLoading(true);
    try {
      await action();
      clearLocationCaches();
      await loadRows();
      return true;
    } catch (err) {
      const message = locationApiError(err);
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    const name = addText.trim();
    if (!name) return;
    if (rows.some((row) => norm(row.name) === norm(name))) {
      toast.warning(`"${name}" already exists here`);
      return;
    }
    const parentId = parent?.id;
    const created = await save(async () => {
      if (level.key === 'country') await locationService.createCountry({ name });
      else if (level.key === 'state') await locationService.createState(parentId, { name });
      else if (level.key === 'district') await locationService.createDistrict(parentId, { name });
      else await locationService.createCity(parentId, { name });
    });
    if (created) {
      setAddText('');
      toast.success(`"${name}" added to the Location Master`);
    }
  };

  const startEdit = (row) => {
    setEditing(row.id);
    setEditText(row.name);
  };

  const saveEdit = async (row) => {
    const name = editText.trim();
    if (!name) {
      toast.warning('Value cannot be empty');
      return;
    }
    if (rows.some((other) => other.id !== row.id && norm(other.name) === norm(name))) {
      toast.warning(`"${name}" already exists here`);
      return;
    }
    const done = await save(async () => {
      if (level.key === 'country') {
        await locationService.updateCountry(row.id, {
          name, code: row.code, isoCode: row.isoCode, status: row.status
        });
      } else if (level.key === 'state') {
        await locationService.updateState(row.id, { name, code: row.code, status: row.status });
      } else if (level.key === 'district') {
        await locationService.updateDistrict(row.id, {
          name, code: row.code, aliases: row.aliases, status: row.status
        });
      } else {
        await locationService.updateCity(row.id, { name, code: row.code, status: row.status });
      }
    });
    if (done) {
      setEditing(null);
      toast.success(`Renamed to "${name}"`);
    }
  };

  const toggle = async (row) => {
    const next = String(row.status || '').toLowerCase() === 'active' ? 'Inactive' : STATUS_ACTIVE;
    const done = await save(() => locationService.setStatus(level.key, row.id, next));
    if (done) {
      toast.success(`"${row.name}" ${next === STATUS_ACTIVE ? 'enabled' : 'disabled'}`);
    }
  };

  const isActiveRow = (row) => !row.status || String(row.status).toLowerCase() === 'active';
  const enabled = rows.filter(isActiveRow);
  const disabledList = rows.filter((row) => !isActiveRow(row));

  const rowButtons = (row, active) => (
    <>
      <button
        type="button"
        title="Edit"
        disabled={!isAdmin || saving}
        onClick={() => startEdit(row)}
        className={ROW_BTN_ACTION}
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        title={active ? 'Disable' : 'Enable'}
        disabled={!isAdmin || saving}
        onClick={() => toggle(row)}
        className={`${ROW_BTN} disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
      </button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manage Countries / States / Cities"
      maxWidth="max-w-md"
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {trail.length > 0 && (
            <button
              type="button"
              onClick={goBack}
              title="Back"
              className="p-1 rounded text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">
            {levelLabel}
          </span>
        </div>

        {isAdmin ? (
          <div className="flex items-center gap-1.5">
            <input
              value={addText}
              disabled={saving}
              onChange={(e) => setAddText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder={
                level.key === 'country'
                  ? 'Add a country...'
                  : level.key === 'state'
                    ? 'Add a state / province...'
                    : level.key === 'district'
                      ? 'Add a district...'
                      : 'Add a city / town...'
              }
              className="flex-1 min-w-0 bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 transition-all"
              aria-label="Add location value"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !addText.trim()}
              className="flex items-center gap-1 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-3 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        ) : (
          <div className="flex items-start gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
            <span>Read-only: only an ADMIN can change the Location Master.</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">
            {error}
          </div>
        )}

        <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
          {loading && (
            <div className="px-3 py-6 text-center text-xs text-slate-400">Loading...</div>
          )}
          {!loading && rows.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-slate-400">
              {error
                ? 'The Location Master could not be loaded.'
                : `No ${level.plural.toLowerCase()} in the Location Master${trail.length ? ` under ${parent.name}` : ''} yet.`}
            </div>
          )}
          {!loading && enabled.map((row) =>
            editing === row.id ? (
              <div key={row.id} className="flex items-center gap-1 px-2 py-1.5 bg-[#F4F7F6]">
                <input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveEdit(row);
                    } else if (e.key === 'Escape') {
                      setEditing(null);
                    }
                  }}
                  className="flex-1 min-w-0 bg-white border border-emerald-600/50 rounded px-2 py-1 text-xs text-slate-700 outline-none"
                  aria-label="Edit location value"
                  autoFocus
                />
                <button type="button" title="Save" disabled={saving} onClick={() => saveEdit(row)} className={ROW_BTN_ACTION}>
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button type="button" title="Cancel" onClick={() => setEditing(null)} className={ROW_BTN}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div key={row.id} className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => openLevel(row)}
                  className="flex-1 min-w-0 flex items-center gap-1.5 text-left text-xs text-slate-700 hover:text-[#0B4A3D] transition-colors cursor-pointer"
                  title={trail.length >= LEVELS.length - 1 ? undefined : 'Open'}
                >
                  <span className="truncate">{row.name}</span>
                  {trail.length < LEVELS.length - 1 && (
                    <ChevronRight className="w-3 h-3 shrink-0 text-slate-300" />
                  )}
                </button>
                {rowButtons(row, true)}
              </div>
            )
          )}
          {!loading && disabledList.map((row) => (
            <div key={row.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50/80">
              <span className="flex-1 min-w-0 truncate text-xs text-slate-400 line-through">{row.name}</span>
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
                Disabled
              </span>
              {rowButtons(row, false)}
            </div>
          ))}
        </div>

        <p className="text-[10px] text-slate-400 leading-relaxed">
          Changes are saved to the Location Master database and appear in the Client, Lead and other
          address dropdowns. Disabling a location hides it from new selections; existing records keep
          showing their stored value.
        </p>
      </div>
    </Modal>
  );
}
