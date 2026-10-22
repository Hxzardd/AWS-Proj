import { Badge } from "@/components/ui/badge";

export function PageHeader({
  title,
  description,
  badge,
  actions,
}: {
  title: string;
  description: string;
  badge?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-enter flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
      <div className="max-w-3xl">
        {badge && <Badge className="mb-4">{badge}</Badge>}
        <h1 className="text-balance text-3xl font-semibold leading-[1.08] tracking-[-0.045em] md:text-[2.6rem]">{title}</h1>
        <p className="mt-3 max-w-[68ch] text-pretty text-sm leading-6 text-muted-foreground md:text-[15px]">{description}</p>
      </div>
      {actions && <div className="flex w-full flex-wrap gap-2 md:w-auto md:shrink-0 md:pt-1">{actions}</div>}
    </div>
  );
}
