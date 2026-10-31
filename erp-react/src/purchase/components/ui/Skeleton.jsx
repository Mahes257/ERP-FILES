/**
 * purchase/components/ui/Skeleton.jsx
 * ------------------------------------------------------------------
 * Skeleton loading components for tables, cards, and detail sections.
 * Replaces blank screens with meaningful loading indicators.
 * ------------------------------------------------------------------
 */
import { memo } from 'react';

/* ─── Base skeleton bar ─── */
function SkeletonBar({ className = '', width, height = 'h-3' }) {
  return (
    <div
      className={`animate-pulse rounded bg-slate-200 ${height} ${className}`}
      style={width ? { width } : undefined}
    />
  );
}

/* ─── Table skeleton — renders fake table rows ─── */
export const TableSkeleton = memo(function TableSkeleton({ rows = 5, cols = 6 }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/80">
        <div className="flex items-center gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <SkeletonBar key={i} className="h-2.5" width={`${Math.max(60, 100 - i * 8)}px`} />
          ))}
        </div>
      </div>
      {/* Rows */}
      <div className="divide-y divide-slate-50">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className="px-5 py-3 flex items-center gap-4">
            {Array.from({ length: cols }).map((_, colIdx) => (
              <SkeletonBar
                key={colIdx}
                className="h-3"
                width={`${Math.max(40, 120 - colIdx * 15)}px`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});

/* ─── Card skeleton — renders fake card grids ─── */
const CARD_COLS_MAP = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
  6: 'sm:grid-cols-6'
};

export const CardSkeleton = memo(function CardSkeleton({ count = 4, cols = 4 }) {
  return (
    <div className={`grid grid-cols-2 ${CARD_COLS_MAP[cols] || CARD_COLS_MAP[4]} gap-3`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 animate-pulse">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100" />
            <div className="flex-1 space-y-2">
              <SkeletonBar className="h-2.5" width="60%" />
              <SkeletonBar className="h-2" width="40%" />
            </div>
          </div>
          <div className="space-y-2">
            <SkeletonBar className="h-2" width="80%" />
            <SkeletonBar className="h-2" width="50%" />
          </div>
        </div>
      ))}
    </div>
  );
});

/* ─── Detail section skeleton — fake detail sections ─── */
export const DetailSkeleton = memo(function DetailSkeleton({ sections = 2 }) {
  return (
    <div className="space-y-5">
      {Array.from({ length: sections }).map((_, s) => (
        <div key={s} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <SkeletonBar className="h-3" width="120px" />
          </div>
          <div className="px-5 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <SkeletonBar className="h-2" width="60px" />
                  <SkeletonBar className="h-3.5" width="100px" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});

/* ─── KPI row skeleton ─── */
const KPI_COLS_MAP = {
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6'
};

export const KpiSkeleton = memo(function KpiSkeleton({ count = 5 }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 ${KPI_COLS_MAP[count] || KPI_COLS_MAP[5]} gap-3`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white px-4 py-3 animate-pulse">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100" />
            <div className="flex-1 space-y-2">
              <SkeletonBar className="h-2" width="70px" />
              <SkeletonBar className="h-4" width="50px" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});

/* ─── Page skeleton — full page loading state ─── */
export const PageSkeleton = memo(function PageSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <SkeletonBar className="h-5" width="200px" />
          <SkeletonBar className="h-3" width="300px" />
        </div>
        <div className="flex gap-2">
          <SkeletonBar className="h-8 w-20 rounded-lg" />
          <SkeletonBar className="h-8 w-24 rounded-lg" />
        </div>
      </div>
      <KpiSkeleton />
      <TableSkeleton />
    </div>
  );
});
