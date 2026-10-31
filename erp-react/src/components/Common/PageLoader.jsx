import { Loader2 } from 'lucide-react';

export default function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-app">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-[#0B4A3D]" /> Loading...
      </div>
    </div>
  );
}
