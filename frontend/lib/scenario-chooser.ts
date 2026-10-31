import { DOMAIN_LABELS, type Scenario, type ScenarioDomain } from "./scenarios";

// Deliberately exclude task text, answers, hints and entitlement state.
export type ScenarioChooserItem = Pick<Scenario, "slug" | "title" | "domain" | "difficulty" | "isFree">;
export const CHOOSER_DOMAIN_ORDER = Object.keys(DOMAIN_LABELS) as ScenarioDomain[];

export function chooserCatalog(catalog: readonly ScenarioChooserItem[] | null | undefined): ScenarioChooserItem[] {
  const seen = new Set<string>();
  return (catalog ?? []).flatMap((item) => {
    if (!item || typeof item.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) ||
        typeof item.title !== "string" || !item.title.trim() ||
        !Object.hasOwn(DOMAIN_LABELS, item.domain) ||
        !["beginner", "intermediate", "advanced"].includes(item.difficulty) ||
        typeof item.isFree !== "boolean" || seen.has(item.slug)) return [];
    seen.add(item.slug);
    return [{ slug: item.slug, title: item.title, domain: item.domain,
      difficulty: item.difficulty, isFree: item.isFree }];
  });
}

export function groupChooserItems(catalog: readonly ScenarioChooserItem[], search: string) {
  const query = search.trim().toLowerCase();
  return CHOOSER_DOMAIN_ORDER.flatMap((domain) => {
    const items = catalog.filter((item) => item.domain === domain &&
      [item.title, DOMAIN_LABELS[item.domain], item.domain].some((text) => text.toLowerCase().includes(query)));
    return items.length ? [{ domain, label: DOMAIN_LABELS[domain], items }] : [];
  });
}

export function scenarioChooserHref(slug: string): string {
  return `/scenarios/${slug}`;
}

export function handleChooserEscape(
  event: { key: string; preventDefault: () => void; stopPropagation: () => void },
  close: () => void
): boolean {
  if (event.key !== "Escape") return false;
  // A search input can consume Escape to clear text before dialog cancel.
  event.preventDefault();
  event.stopPropagation();
  close();
  return true;
}

export function selectChooserScenario(currentSlug: string, targetSlug: string, flushDraft: () => void, navigate: (href: string) => void): void {
  if (targetSlug === currentSlug) return;
  flushDraft();
  navigate(scenarioChooserHref(targetSlug));
}
