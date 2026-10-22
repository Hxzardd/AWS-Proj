import { Skeleton } from "@/components/ui/skeleton";

export function DashboardLoading() {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 md:px-8" role="status" aria-label="Loading dashboard">
      <Skeleton className="h-8 w-56" /><Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-32" />)}</div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]"><Skeleton className="h-[420px]" /><Skeleton className="h-[420px]" /></div>
      <span className="sr-only">Loading simulation controls and metrics</span>
    </div>
  );
}
