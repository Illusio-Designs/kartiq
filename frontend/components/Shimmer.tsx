'use client';

import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

// Re-export for easy usage across the app
export { Skeleton };

/** Themed skeleton wrapper — matches Kartriq's emerald design */
export function ShimmerTheme({ children }: { children: React.ReactNode }) {
  return (
    <SkeletonTheme baseColor="var(--skeleton-base)" highlightColor="var(--skeleton-highlight)">
      {children}
    </SkeletonTheme>
  );
}

/** Single card skeleton — drop directly inside a parent grid */
export function CardSkeletonItem() {
  return (
    <ShimmerTheme>
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <Skeleton width={40} height={40} borderRadius={12} />
          <Skeleton width={16} height={16} borderRadius={6} />
        </div>
        <Skeleton width="60%" height={20} borderRadius={6} />
        <Skeleton count={2} height={12} borderRadius={6} className="mt-3" />
        <div className="mt-6 flex items-end gap-1 h-16">
          {[30, 45, 35, 60, 40, 75, 55, 85, 65].map((h, i) => (
            <div key={i} className="flex-1" style={{ height: `${h}%` }}>
              <Skeleton height="100%" borderRadius={4} />
            </div>
          ))}
        </div>
      </div>
    </ShimmerTheme>
  );
}

/**
 * N card skeletons rendered as siblings (no grid wrapper).
 * Use directly inside any parent grid — the parent controls the layout.
 */
export function CardSkeleton({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeletonItem key={i} />
      ))}
    </>
  );
}

/** Standalone 3-column card skeleton grid — for use outside an existing grid */
export function CardSkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <CardSkeleton count={count} />
    </div>
  );
}

/** Table skeleton — mimics a data table */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <ShimmerTheme>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex gap-4 p-4 border-b border-slate-100">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} height={14} borderRadius={6} containerClassName="flex-1" />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 p-4 border-b border-slate-50">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} height={12} borderRadius={6} containerClassName="flex-1" />
            ))}
          </div>
        ))}
      </div>
    </ShimmerTheme>
  );
}

/** Stats skeleton — mimics stat counters */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ShimmerTheme>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
            <Skeleton width={60} height={36} borderRadius={8} className="mx-auto" />
            <Skeleton width={100} height={10} borderRadius={6} className="mt-3 mx-auto" />
          </div>
        ))}
      </div>
    </ShimmerTheme>
  );
}

/** Section skeleton — full section placeholder */
export function SectionSkeleton() {
  return (
    <ShimmerTheme>
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <Skeleton width={200} height={16} borderRadius={20} className="mx-auto" />
          <Skeleton width={400} height={32} borderRadius={8} className="mt-4 mx-auto" />
          <Skeleton width={300} height={14} borderRadius={6} className="mt-3 mx-auto" />
        </div>
        <CardSkeletonGrid count={3} />
      </div>
    </ShimmerTheme>
  );
}

/**
 * Product card skeleton — matches /products grid card:
 * h-32 image area + name + sku + meta row + sync button.
 * Drop directly inside a parent grid.
 */
export function ProductCardSkeleton() {
  return (
    <ShimmerTheme>
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col">
        <Skeleton height={128} borderRadius={12} />
        <Skeleton height={14} width="80%" borderRadius={6} className="mt-3" />
        <Skeleton height={10} width="50%" borderRadius={6} className="mt-2" />
        <div className="flex items-center justify-between mt-3 gap-2">
          <Skeleton height={10} width={60} borderRadius={6} />
          <Skeleton height={10} width={50} borderRadius={6} />
        </div>
        <Skeleton height={32} borderRadius={10} className="mt-3" />
      </div>
    </ShimmerTheme>
  );
}

/**
 * Resource tile skeleton — matches /resources tile:
 * h-32 gradient header with centered icon + body with title + 2 lines + CTA.
 * Drop directly inside a parent grid.
 */
export function ResourceTileSkeleton() {
  return (
    <ShimmerTheme>
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
        <div className="h-32 bg-slate-100 flex items-center justify-center">
          <Skeleton width={56} height={56} borderRadius={16} />
        </div>
        <div className="p-6">
          <Skeleton height={20} width="70%" borderRadius={6} />
          <Skeleton count={2} height={12} borderRadius={6} className="mt-2" />
          <Skeleton height={12} width={80} borderRadius={6} className="mt-4" />
        </div>
      </div>
    </ShimmerTheme>
  );
}

/**
 * Category section skeleton — matches the channels page CategorySection:
 * rounded-3xl panel with header (icon + title/tagline + badges) and a 2-col
 * grid of inner channel-card placeholders.
 */
export function CategorySectionSkeleton() {
  return (
    <ShimmerTheme>
      <div className="rounded-3xl bg-white border border-slate-200/70 shadow-sm p-6 md:p-7">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-4">
            <Skeleton width={56} height={56} borderRadius={16} />
            <div>
              <Skeleton width={160} height={18} borderRadius={6} />
              <Skeleton width={220} height={12} borderRadius={6} className="mt-2" />
            </div>
          </div>
          <Skeleton width={100} height={22} borderRadius={20} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-slate-50 rounded-2xl p-4 flex items-center gap-3">
              <Skeleton width={40} height={40} borderRadius={10} />
              <div className="flex-1">
                <Skeleton height={13} width="60%" borderRadius={6} />
                <Skeleton height={10} width="40%" borderRadius={6} className="mt-2" />
              </div>
              <Skeleton width={70} height={28} borderRadius={20} />
            </div>
          ))}
        </div>
      </div>
    </ShimmerTheme>
  );
}

/**
 * Case-study card skeleton — wide horizontal article card with pill row,
 * title, subtitle, body, CTA. Drop into a vertical space-y list.
 */
export function CaseStudySkeleton() {
  return (
    <ShimmerTheme>
      <div className="bg-white rounded-3xl border border-slate-200 p-8">
        <div className="flex flex-wrap gap-2 mb-3">
          <Skeleton width={70} height={20} borderRadius={20} />
          <Skeleton width={60} height={20} borderRadius={20} />
          <Skeleton width={80} height={20} borderRadius={20} />
        </div>
        <Skeleton height={28} width="55%" borderRadius={6} />
        <Skeleton height={16} width="80%" borderRadius={6} className="mt-2" />
        <Skeleton count={2} height={12} borderRadius={6} className="mt-4" />
        <Skeleton width={120} height={14} borderRadius={6} className="mt-5" />
      </div>
    </ShimmerTheme>
  );
}

/**
 * Video card skeleton — h-44 thumbnail with play overlay placeholder + title +
 * meta line. Drop into a parent grid.
 */
export function VideoCardSkeleton() {
  return (
    <ShimmerTheme>
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
        <Skeleton height={176} borderRadius={0} />
        <div className="p-5">
          <Skeleton height={18} width="80%" borderRadius={6} />
          <Skeleton height={12} width="50%" borderRadius={6} className="mt-2" />
        </div>
      </div>
    </ShimmerTheme>
  );
}

/**
 * Detail page skeleton — for record-detail pages (channel detail, ticket detail).
 * Header row + tall content panel.
 */
export function DetailPageSkeleton() {
  return (
    <ShimmerTheme>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Skeleton width={32} height={32} borderRadius={10} />
          <div className="flex-1">
            <Skeleton width="40%" height={26} borderRadius={6} />
            <Skeleton width="55%" height={12} borderRadius={6} className="mt-2" />
          </div>
          <Skeleton width={120} height={36} borderRadius={20} />
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <Skeleton height={14} width="35%" borderRadius={6} />
          <Skeleton count={3} height={12} borderRadius={6} />
          <Skeleton height={160} borderRadius={12} className="mt-2" />
        </div>
      </div>
    </ShimmerTheme>
  );
}

/** Page skeleton — full page loading state */
export function PageSkeleton() {
  return (
    <ShimmerTheme>
      <div className="min-h-screen">
        {/* Nav skeleton */}
        <div className="h-16 border-b border-slate-100 px-6 flex items-center justify-between">
          <Skeleton width={120} height={28} borderRadius={8} />
          <div className="flex gap-4">
            <Skeleton width={60} height={14} borderRadius={6} />
            <Skeleton width={60} height={14} borderRadius={6} />
            <Skeleton width={60} height={14} borderRadius={6} />
          </div>
          <Skeleton width={100} height={36} borderRadius={20} />
        </div>
        {/* Hero skeleton */}
        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <Skeleton width={200} height={28} borderRadius={20} className="mx-auto" />
          <Skeleton width={500} height={48} borderRadius={8} className="mt-6 mx-auto" />
          <Skeleton width={400} height={16} borderRadius={6} className="mt-4 mx-auto" />
          <div className="flex gap-3 justify-center mt-8">
            <Skeleton width={140} height={44} borderRadius={24} />
            <Skeleton width={160} height={44} borderRadius={24} />
          </div>
        </div>
        {/* Content skeleton */}
        <div className="max-w-6xl mx-auto px-6 py-10">
          <CardSkeletonGrid count={3} />
        </div>
      </div>
    </ShimmerTheme>
  );
}
