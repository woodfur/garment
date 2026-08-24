/**
 * The one place branch navigation labels are defined.
 *
 * The desktop sidebar and the mobile tab bar previously kept separate lists and had
 * drifted: the dashboard was "The Studio" on desktop but "Studio" on mobile, and
 * departments were "Departments" on desktop but "Roster" on mobile. Both read from here
 * now, so a label can only be changed in one place.
 *
 * Labels only — each nav supplies its own ornamentation (roman numerals on desktop,
 * icons on mobile) and its own ordering, which differ by design.
 */

export type BranchNavItem = { href: string; label: string };

export const BRANCH_NAV: BranchNavItem[] = [
  { href: "/branch/dashboard", label: "Studio" },
  { href: "/branch/departments", label: "Departments" },
  { href: "/branch/uniforms", label: "Wardrobe" },
  { href: "/branch/inventory", label: "Inventory" },
  { href: "/branch/schedule", label: "Schedule" },
];

/** Look up a nav item by route, for a nav that orders its own tabs. */
export function branchNavItem(href: string): BranchNavItem {
  const item = BRANCH_NAV.find((entry) => entry.href === href);
  if (!item) throw new Error(`No branch nav item for ${href}`);
  return item;
}

/** True when a nav entry should read as active for the current path. */
export function isNavActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
