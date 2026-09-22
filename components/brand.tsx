/** Mark: an open circle of hands — concentric rings closing around a centre. */
export function BrandMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle cx="20" cy="20" r="18.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 3.2" />
      <circle cx="20" cy="20" r="5" fill="var(--color-gold)" />
    </svg>
  );
}

export function BrandName({ tone = "ink" }: { tone?: "ink" | "light" }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark className={`size-8 ${tone === "light" ? "text-white" : "text-brand"}`} />
      <span className={`font-display text-xl leading-none ${tone === "light" ? "text-white" : "text-brand"}`}>
        Clan Fund
      </span>
    </span>
  );
}
