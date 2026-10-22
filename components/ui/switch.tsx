"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root className={cn("peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-border bg-input transition-[background-color,border-color,transform] duration-200 active:scale-[0.97] data-[state=checked]:border-primary/45 data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50", className)} {...props}>
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 rounded-full bg-foreground shadow-[0_3px_10px_rgb(0_0_0_/_0.42)] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
}
