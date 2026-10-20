import { DashboardNav } from "@/components/dashboard/nav";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  LoadingRegion,
  Skeleton,
  StatSkeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

/** Shared by the admin, manager and reports routes. */
export default function AdminLoading() {
  return (
    <main className="min-h-screen bg-slate-50/70">
      <DashboardNav />
      <LoadingRegion
        label="Loading…"
        className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8"
      >
        <Skeleton className="h-36 w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
        {[6, 5].map((rows, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-col gap-1.5">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-3 w-64" />
            </CardHeader>
            <CardContent>
              <TableSkeleton rows={rows} columns={7} />
            </CardContent>
          </Card>
        ))}
      </LoadingRegion>
    </main>
  );
}
