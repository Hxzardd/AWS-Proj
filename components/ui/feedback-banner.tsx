import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FeedbackBanner({
  tone,
  children,
  className,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
  className?: string;
}) {
  const isError = tone === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live="polite"
      className={cn(
        "page-enter flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        tone === "error" && "border-destructive/40 bg-destructive/[0.07] text-destructive",
        tone === "success" && "border-primary/30 bg-primary/[0.07] text-primary",
        tone === "info" && "border-border bg-card/60 text-muted-foreground",
        className,
      )}
    >
      <span
        className={cn(
          "mt-1 size-1.5 shrink-0 rounded-full bg-muted-foreground",
          tone === "error" && "bg-destructive",
          tone === "success" && "bg-primary",
        )}
        aria-hidden="true"
      />
      <span className="min-w-0 leading-6">{children}</span>
    </div>
  );
}
