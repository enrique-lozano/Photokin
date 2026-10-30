/**
 * Section counts read as the full list size ("136") until a filter is active,
 * then as the matches over that same total ("4 / 136"). The section title
 * ("People", "Albums", "Tags", "Places") stays a separate label.
 */
export function formatSidebarFilterCount(total: number, matched: number | null): string {
  if (matched === null) return String(total);
  return `${matched} / ${total}`;
}
