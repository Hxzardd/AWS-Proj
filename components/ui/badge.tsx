import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/[0.08] px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-primary shadow-[inset_0_1px_0_rgb(255_255_255_/_0.035)]",
        className,
      )}
      {...props}
    />
  );
}
