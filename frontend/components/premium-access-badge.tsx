interface PremiumAccessBadgeProps {
  locked?: boolean;
  compact?: boolean;
}

export function PremiumAccessBadge({
  locked = true,
  compact = false
}: PremiumAccessBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 font-bold uppercase text-amber-100 ${
        compact
          ? "px-2.5 py-1 text-[10px] tracking-[0.14em]"
          : "px-3 py-1 text-[11px] tracking-[0.18em]"
      }`}
    >
      {locked ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="2">
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
          <path d="m3 6 4.5 4L12 4l4.5 6L21 6l-2 12H5L3 6Zm4.2 9h9.6l.7-4.2-2.1 1.9L12 8.2l-3.4 4.5-2.1-1.9.7 4.2Z" />
        </svg>
      )}
      Premium
    </span>
  );
}
