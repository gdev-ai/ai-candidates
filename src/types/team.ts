import { z } from "zod";

import { ROLES } from "@/lib/auth/roleDefinitions";

export const teamCreateSchema = z.object({
  name: z.string().trim().min(1, "Team name is required.").max(80),
  managerId: z.uuid().nullable().optional(),
});

export const teamUpdateSchema = z.object({
  name: z.string().trim().min(1, "Team name is required.").max(80).optional(),
  managerId: z.uuid().nullable().optional(),
});

/** Admin edit of a member. `status` approves (active) or disables access. */
export const memberUpdateSchema = z.object({
  role: z.enum(ROLES).optional(),
  teamId: z.uuid().nullable().optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().max(320).pipe(z.email("Enter a valid email address.")),
  role: z.enum(ROLES),
  teamId: z.uuid().nullable().optional(),
});

export type TeamCreateInput = z.infer<typeof teamCreateSchema>;
export type TeamUpdateInput = z.infer<typeof teamUpdateSchema>;
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;
