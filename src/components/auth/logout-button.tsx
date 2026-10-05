"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { reportAuthEvent, signOut } from "@/lib/supabase/auth";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    // Reported before signing out: the server needs the session to know who.
    await reportAuthEvent({ event: "logout" });
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleLogout}>
      Log out
    </Button>
  );
}
