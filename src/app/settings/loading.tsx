import { DashboardNav } from "@/components/dashboard/nav";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <main className="min-h-screen">
      <DashboardNav />
      <LoadingRegion label="Loading settings…" className="p-4">
        <Card className="max-w-md">
          <CardHeader>
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-48" />
          </CardContent>
        </Card>
      </LoadingRegion>
    </main>
  );
}
