import { useEffect, useState } from 'react';
import { PencilLine } from 'lucide-react';
import { fetchEditCount, editCountLabel } from '../../utils/editHistory';

/**
 * Compact "Edited N times" indicator. The count always comes from the
 * backend/database (never derived from the current browser session).
 */
export default function EditCountBadge({ moduleKey, recordId, className = '' }) {
  const [count, setCount] = useState(null); // null while loading

  useEffect(() => {
    let cancelled = false;
    fetchEditCount(moduleKey, recordId).then((c) => {
      if (cancelled) return;
      setCount(c);
    });
    return () => {
      cancelled = true;
    };
  }, [moduleKey, recordId]);

  const label = editCountLabel(count);
  if (count === null || !label) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FFF7ED] text-[#C2410C] border border-[#FED7AA] ${className}`}
      title={`This record has been edited ${count} time${count === 1 ? '' : 's'}`}
    >
      <PencilLine className="w-3 h-3" />
      {label}
    </span>
  );
}
