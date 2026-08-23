import { describe, expect, it } from "vitest";
import {
  DEFAULT_HELP_SECTION_ID,
  parseHelpHash,
  resolveHelpSectionId,
} from "./help-deep-link.js";

describe("parseHelpHash", () => {
  it("returns null for empty or unrelated hashes", () => {
    expect(parseHelpHash("")).toBeNull();
    expect(parseHelpHash("#")).toBeNull();
    expect(parseHelpHash("#playlist")).toBeNull();
    expect(parseHelpHash("#callerbuddy-security")).toBeNull();
  });

  it("treats #help as an empty slug", () => {
    expect(parseHelpHash("#help")).toBe("");
    expect(parseHelpHash("#Help")).toBe("");
    expect(parseHelpHash("#/help/")).toBe("");
  });

  it("extracts a section slug after #help/", () => {
    expect(parseHelpHash("#help/callerbuddy-security")).toBe(
      "callerbuddy-security",
    );
    expect(parseHelpHash("#help/CallerBuddy-Security")).toBe(
      "callerbuddy-security",
    );
    expect(parseHelpHash("#Help/CallerBuddy Security")).toBe(
      "callerbuddy-security",
    );
  });

  it("decodes percent-encoding", () => {
    expect(parseHelpHash("#help/callerbuddy%2Dsecurity")).toBe(
      "callerbuddy-security",
    );
  });
});

describe("resolveHelpSectionId", () => {
  it("uses the welcome section when the slug is empty", () => {
    expect(resolveHelpSectionId("")).toBe(DEFAULT_HELP_SECTION_ID);
  });

  it("returns a known TOC id", () => {
    expect(resolveHelpSectionId("callerbuddy-security")).toBe(
      "callerbuddy-security",
    );
  });

  it("passes through unknown slugs so Help still opens", () => {
    expect(resolveHelpSectionId("not-a-real-section")).toBe("not-a-real-section");
  });
});
