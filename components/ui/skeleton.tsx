import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton-shimmer rounded-[10px] bg-muted", className)} />;
}
