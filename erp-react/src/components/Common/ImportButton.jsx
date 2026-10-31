import { useRef } from 'react';
import { Upload } from 'lucide-react';

export default function ImportButton({
  onImport,
  disabled = false,
  buttonLabel = 'Upload',
  accept = '.csv,.xlsx,.xls'
}) {
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    await onImport?.(formData);
  };

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="flex items-center gap-2 bg-surface border border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-lg transition-all shadow-sm cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Upload className="w-4 h-4 text-slate-400" />
        <span>{buttonLabel}</span>
      </button>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleFile} />
    </>
  );
}
