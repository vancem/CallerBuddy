import { callerBuddy } from "../caller-buddy.js";
import { TabType } from "../services/app-state.js";
import { parseHelpHash, resolveHelpSectionId } from "./help-deep-link.js";

/** Open the Help tab (as a singleton) scrolled to a section; Help's Back button / ArrowLeft returns here. */
export function openHelpSection(sectionId: string): void {
  callerBuddy.state.openSingletonTab(TabType.Help, "Help", true, { sectionId });
}

/** Open Help from `location.hash` when it is a `#help/...` deep link. */
export function applyHelpDeepLink(hash = window.location.hash): boolean {
  const slug = parseHelpHash(hash);
  if (slug === null) return false;
  openHelpSection(resolveHelpSectionId(slug));
  return true;
}
