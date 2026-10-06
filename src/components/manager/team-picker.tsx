import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Admin-only team switcher; HR Managers never see it (they're pinned to their team). */
export function TeamPicker({
  teams,
  currentTeamId,
}: {
  teams: { id: string; name: string }[];
  currentTeamId: string;
}) {
  return (
    <form method="get" action="/manager" className="flex items-center gap-2">
      <Select name="teamId" defaultValue={currentTeamId}>
        <SelectTrigger className="h-9 w-52" aria-label="Team">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {teams.map((team) => (
            <SelectItem key={team.id} value={team.id}>
              {team.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="submit"
        variant="outline"
      >
        View team
      </Button>
    </form>
  );
}
