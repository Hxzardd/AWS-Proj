import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-[9px] text-sm font-semibold shadow-none transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "border border-primary/70 bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255_/_0.22)] hover:-translate-y-px hover:bg-primary/90 hover:shadow-[0_12px_28px_-18px_var(--primary)]",
        secondary: "border border-transparent bg-secondary text-secondary-foreground hover:-translate-y-0.5 hover:border-border hover:bg-accent",
        outline: "border border-border bg-background/25 text-foreground hover:-translate-y-0.5 hover:border-primary/35 hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        destructive: "border border-destructive/75 bg-destructive text-destructive-foreground hover:-translate-y-px hover:opacity-90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 px-5 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { buttonVariants };
