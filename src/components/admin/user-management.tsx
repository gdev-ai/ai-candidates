"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { sendAdminRequest } from "@/components/admin/admin-request";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { UserPerformanceRow } from "@/lib/performance/userStats";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/auth/roleDefinitions";

// Radix Select can't use "" as an item value, so "no team" needs a sentinel.
const NO_TEAM = "__none__";

export function UserManagement({
  users,
  teamOptions,
  currentUserId,
}: {
  users: UserPerformanceRow[];
  teamOptions: { id: string; name: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function updateUser(
    user: UserPerformanceRow,
    changes: { role?: Role; teamId?: string | null; status?: "active" | "disabled" },
    successMessage: string,
  ) {
    setPendingUserId(user.id);
    const ok = await sendAdminRequest(`/api/admin/users/${user.id}`, "PATCH", changes);
    if (ok) {
      toast.success(successMessage);
      startTransition(() => router.refresh());
    }
    setPendingUserId(null);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[820px] text-sm" data-testid="admin-user-management">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="p-3 font-medium">User</th>
            <th className="p-3 font-medium">Role</th>
            <th className="p-3 font-medium">Team</th>
            <th className="p-3 font-medium">Status</th>
            <th className="p-3 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            const isPending = pendingUserId === user.id;
            return (
              <tr
                key={user.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
              >
                <td className="p-3">
                  <p className="font-medium text-slate-900">
                    {user.name}
                    {isSelf && <span className="ml-1.5 text-xs font-normal text-slate-500">(you)</span>}
                  </p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </td>
                <td className="p-3">
                  <Select
                    value={user.role}
                    disabled={isSelf || isPending}
                    onValueChange={(value) =>
                      updateUser(
                        user,
                        { role: value as Role },
                        `${user.name} is now ${ROLE_LABELS[value as Role]}.`,
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-40" aria-label={`Role for ${user.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-3">
                  <Select
                    value={user.teamId ?? NO_TEAM}
                    disabled={isPending}
                    onValueChange={(value) => {
                      const teamId = value === NO_TEAM ? null : value;
                      const teamName = teamOptions.find((team) => team.id === teamId)?.name;
                      updateUser(
                        user,
                        { teamId },
                        teamName ? `Moved ${user.name} to ${teamName}.` : `Removed ${user.name} from their team.`,
                      );
                    }}
                  >
                    <SelectTrigger className="h-8 w-48" aria-label={`Team for ${user.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TEAM}>No team</SelectItem>
                      {teamOptions.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-3">
                  <Badge tone={user.isActive ? "good" : "neutral"}>
                    {user.isActive ? "Active" : "Disabled"}
                  </Badge>
                </td>
                <td className="p-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-normal"
                    disabled={isSelf || isPending}
                    onClick={() =>
                      updateUser(
                        user,
                        { status: user.isActive ? "disabled" : "active" },
                        user.isActive ? `Disabled ${user.name}.` : `Reactivated ${user.name}.`,
                      )
                    }
                  >
                    {user.isActive ? "Disable" : "Reactivate"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
