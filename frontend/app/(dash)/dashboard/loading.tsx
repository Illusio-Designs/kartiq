// Dashboard loading skeleton — mirrors the KPI grid + chart layout so the
// transition feels smooth instead of a layout-shift flash.
export default function DashboardLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading dashboard" className="p-6 animate-pulse">
      <div className="h-7 w-48 bg-slate-100 rounded mb-2" />
      <div className="h-4 w-72 bg-slate-100 rounded mb-8" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="h-3 w-20 bg-slate-100 rounded mb-3" />
            <div className="h-8 w-32 bg-slate-100 rounded mb-2" />
            <div className="h-3 w-16 bg-slate-100 rounded" />
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <div className="h-5 w-40 bg-slate-100 rounded mb-4" />
        <div className="h-64 w-full bg-slate-50 rounded" />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="h-5 w-40 bg-slate-100 rounded mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-slate-50 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
