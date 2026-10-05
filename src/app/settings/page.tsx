import { DashboardNav } from "@/components/dashboard/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/auth/roleDefinitions";
import { requirePageMember } from "@/lib/dashboard/session";
import { getDisplayName } from "@/lib/users/displayName";

export default async function SettingsPage() {
  const { supabase, member } = await requirePageMember();
  const { data: team } = member.team_id
    ? await supabase.from("teams").select("name").eq("id", member.team_id).maybeSingle()
    : { data: null };

  return (
    <main className="min-h-screen">
      <DashboardNav />
      <div className="p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Signed in as</p>
              <p className="font-medium">{getDisplayName(member.email, member.full_name)}</p>
              <p data-testid="account-email" className="text-sm text-muted-foreground">
                {member.email}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Role</p>
              <p className="font-medium">
                {ROLE_LABELS[member.role]}
                {team?.name && ` · ${team.name}`}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
