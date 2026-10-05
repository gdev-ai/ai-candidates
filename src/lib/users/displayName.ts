/**
 * A member's display name: their real name when known (copied from HR
 * Portal's hr_staff on first sign-in), otherwise derived from the email.
 * "zeyad.ragab@..." -> "Zeyad Ragab".
 */
export function getDisplayName(
  email: string | null | undefined,
  fullName?: string | null,
): string | null {
  if (fullName?.trim()) return fullName.trim();
  if (!email) return null;
  const localPart = email.split("@")[0];
  if (!localPart) return null;

  return localPart
    .split(/[.\-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
