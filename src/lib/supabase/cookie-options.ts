/**
 * Single sign-on with HR Portal. Both apps use the same Supabase project, so
 * their session cookie already has the same name; scoping it to the parent
 * domain (e.g. ".thegdevelopments.com") makes the browser send it to both
 * subdomains. Leave unset locally and on *.vercel.app previews, where a
 * host-only cookie is what you want.
 *
 * Must be identical in HR Portal, or the two apps overwrite each other's cookie.
 */
const domain = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN?.trim();

export const authCookieOptions = domain ? { domain } : undefined;
