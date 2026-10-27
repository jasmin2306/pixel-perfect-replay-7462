import { cn } from "@/lib/utils";

/** VisionChat mark: an aperture-eye shape. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-8 place-items-center rounded-xl bg-gradient-brand shadow-glow", className)} aria-hidden>
      <svg viewBox="0 0 24 24" className="size-[60%] text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
    </span>
  );
}
