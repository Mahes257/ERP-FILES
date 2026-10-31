export default function Tabs({ tabs, activeKey, onChange }) {
  return (
    <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto no-scrollbar">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer ${
              active ? 'border-[#0B4A3D] text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
