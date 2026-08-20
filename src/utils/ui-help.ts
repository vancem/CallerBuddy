import { callerBuddy } from "../caller-buddy.js";
import { TabType } from "../services/app-state.js";

/** Open the Help tab (as a singleton) scrolled to a section; Help's Back button / ArrowLeft returns here. */
export function openHelpSection(sectionId: string): void {
  callerBuddy.state.openSingletonTab(TabType.Help, "Help", true, { sectionId });
}
