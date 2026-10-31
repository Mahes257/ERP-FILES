/**
 * VersionComparison — the ONE comparison surface for Sales version viewing.
 * -------------------------------------------------------------------------
 * Rendered only while a specific version is being inspected (a historical
 * revision, or the Version History pane of the current document). It answers
 * "what changed against the version immediately before this one?" and nothing
 * else — the stored snapshots are never modified to support it.
 *
 * Design rules it follows:
 *   · only changes are tinted; an unchanged field is never highlighted,
 *   · tinting is light (a pale background plus a 2px left rule) and comes from
 *     the same amber/emerald palette the ERP's edit-history surfaces use, so
 *     nothing shouts,
 *   · modified values are always shown as `Previous → Selected`,
 *   · a version with no earlier snapshot says so instead of inventing changes.
 *
 * The component is presentation only: `useVersionComparison` produces the data.
 */
import { ArrowRight, GitCompare, Loader2, MinusCircle, PlusCircle, PencilLine } from 'lucide-react';
import { changeCount } from '../../utils/versionDiff';

const TONE = {
  added: {
    row: 'bg-emerald-50/70 border-l-2 border-emerald-300',
    badge: 'bg-emerald-100/80 text-emerald-800 border-emerald-200',
    label: 'Added',
    icon: PlusCircle
  },
  modified: {
    row: 'bg-amber-50/70 border-l-2 border-amber-300',
    badge: 'bg-amber-100/80 text-amber-800 border-amber-200',
    label: 'Modified',
    icon: PencilLine
  },
  removed: {
    row: 'bg-rose-50/70 border-l-2 border-rose-300',
    badge: 'bg-rose-100/80 text-rose-800 border-rose-200',
    label: 'Removed',
    icon: MinusCircle
  }
};

function tone(type) {
  return TONE[type] || TONE.modified;
}

function ToneBadge({ type }) {
  const { badge, label, icon: Icon } = tone(type);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge}`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

/** `Previous: ₹100 → Selected: ₹150` for a modified field. */
function ValueTransition({ change }) {
  if (change.type === 'added') {
    return <span className="text-slate-700 font-medium">{change.selectedValue}</span>;
  }
  if (change.type === 'removed') {
    return <span className="text-slate-500 line-through">{change.previousValue}</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-slate-500">{change.previousValue}</span>
      <ArrowRight className="w-3 h-3 text-slate-400" />
      <span className="text-slate-800 font-semibold">{change.selectedValue}</span>
    </span>
  );
}

function FieldRows({ changes }) {
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full border-collapse" style={{ minWidth: 520 }}>
        <thead>
          <tr className="bg-slate-50">
            <th className="py-2 px-3 text-left text-[11px] font-bold text-slate-500">Change</th>
            <th className="py-2 px-3 text-left text-[11px] font-bold text-slate-500">Field</th>
            <th className="py-2 px-3 text-left text-[11px] font-bold text-slate-500">Previous → Selected</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={`${change.type}-${change.field}`} className={tone(change.type).row}>
              <td className="py-2 px-3 align-top">
                <ToneBadge type={change.type} />
              </td>
              <td className="py-2 px-3 text-xs font-semibold text-slate-700 align-top">{change.label}</td>
              <td className="py-2 px-3 text-xs align-top">
                <ValueTransition change={change} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemGroups({ items }) {
  const added = items.added || [];
  const removed = items.removed || [];
  const modified = items.modified || [];
  return (
    <div className="space-y-3">
      {added.length > 0 && (
        <div className="border border-emerald-200 rounded-lg overflow-hidden">
          <div className="px-3 py-1.5 bg-emerald-50/70 text-[11px] font-bold text-emerald-800 uppercase tracking-wide">
            Line items added ({added.length})
          </div>
          <ul className="divide-y divide-emerald-100">
            {added.map((row, i) => (
              <li key={`a-${row.key}-${i}`} className="px-3 py-1.5 text-xs text-slate-700">
                <PlusCircle className="w-3 h-3 inline mr-1.5 text-emerald-600" />
                {row.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {removed.length > 0 && (
        <div className="border border-rose-200 rounded-lg overflow-hidden">
          <div className="px-3 py-1.5 bg-rose-50/70 text-[11px] font-bold text-rose-800 uppercase tracking-wide">
            Line items removed ({removed.length})
          </div>
          <ul className="divide-y divide-rose-100">
            {removed.map((row, i) => (
              <li key={`r-${row.key}-${i}`} className="px-3 py-1.5 text-xs text-slate-500 line-through">
                <MinusCircle className="w-3 h-3 inline mr-1.5 text-rose-500 no-underline" />
                {row.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {modified.map((row, rowIndex) => (
        <div key={`m-${row.key}-${rowIndex}`} className="border border-amber-200 rounded-lg overflow-hidden">
          <div className="px-3 py-1.5 bg-amber-50/70 text-[11px] font-bold text-amber-800">
            <PencilLine className="w-3 h-3 inline mr-1.5" />
            {row.label}
            <span className="font-semibold text-amber-700/80 ml-2 uppercase tracking-wide">Modified</span>
          </div>
          <table className="w-full border-collapse">
            <tbody>
              {row.changes.map((change) => (
                <tr key={change.field} className={tone(change.type).row}>
                  <td className="py-1.5 px-3 text-xs font-semibold text-slate-600 w-[180px]">{change.label}</td>
                  <td className="py-1.5 px-3 text-xs">
                    <ValueTransition change={change} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/**
 * @param {object}   props
 * @param {object}   props.comparison  result of `compareRevisionSnapshots` (null while loading)
 * @param {string}   props.direction   e.g. `Revision 2 compared with Revision 1`
 * @param {boolean}  props.loading
 * @param {string}   props.unavailable explicit reason when no comparison can be shown
 * @param {string}   props.selectedLabel  label of the version being viewed
 * @param {string}   props.currentHref    link back to the Current version, when viewing history
 * @param {function} props.onGoToCurrent  called instead of navigating when supplied
 */
export default function VersionComparison({
  comparison,
  direction,
  loading = false,
  unavailable = null,
  selectedLabel = '',
  currentHref = null,
  onGoToCurrent = null
}) {
  if (unavailable) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
        <GitCompare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
        <span>{unavailable}</span>
      </div>
    );
  }

  if (loading || !comparison) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading the previous version…
      </div>
    );
  }

  const total = changeCount(comparison);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <GitCompare className="w-3.5 h-3.5 text-[#0B4A3D]" />
          {direction || `Comparison for ${selectedLabel || 'this version'}`}
          <span className="font-semibold text-slate-400">
            ({total === 0 ? 'no changes' : `${total} change${total === 1 ? '' : 's'}`})
          </span>
        </div>
        {currentHref && (
          <a
            href={currentHref}
            onClick={(e) => {
              if (!onGoToCurrent) return;
              e.preventDefault();
              onGoToCurrent();
            }}
            className="text-[11px] font-bold text-[#0B4A3D] hover:underline"
          >
            Go to Current version
          </a>
        )}
      </div>

      {total === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-500">
          Nothing changed against the previous version.
        </div>
      ) : (
        <>
          {comparison.fields.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                Field changes ({comparison.fields.length})
              </div>
              <FieldRows changes={comparison.fields} />
            </div>
          )}
          {comparison.itemCount > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                Line item changes ({comparison.itemCount})
              </div>
              <ItemGroups items={comparison.items} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
