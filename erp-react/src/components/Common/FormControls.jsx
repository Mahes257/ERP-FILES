export function FormField({ label, required, error, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-[11px] font-semibold text-rose-500">{error}</p>}
    </div>
  );
}

export const INPUT_BASE =
  'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none transition-all focus:border-blue-500/60 focus:bg-surface focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)] shadow-inner';

export function TextInput({ registration, error, className = '', ...rest }) {
  return <input className={`${INPUT_BASE} ${error ? 'border-rose-400' : ''} ${className}`} {...registration} {...rest} />;
}

export function SelectInput({ registration, error, children, ...rest }) {
  return (
    <select className={`${INPUT_BASE} ${error ? 'border-rose-400' : ''} cursor-pointer`} {...registration} {...rest}>
      {children}
    </select>
  );
}

export function TextArea({ registration, error, rows = 3, ...rest }) {
  return <textarea rows={rows} className={`${INPUT_BASE} ${error ? 'border-rose-400' : ''}`} {...registration} {...rest} />;
}
