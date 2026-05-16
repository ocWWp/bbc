import { describe, it, expect } from "vitest";
import { ROLE_PREFIXES } from "@/lib/studio/template-id";
import {
  executeRouteMatch,
  executeStudioCompose,
  listStudioMenu,
  matchRoute,
  type StudioComposeResult,
} from "./tool-impls";

describe("matchRoute", () => {
  it("matches an exact alias", () => {
    const r = matchRoute("queue");
    expect(r).toEqual({ route: "/queue", label: "Queue" });
  });

  it("matches a multi-word alias for a Studio route", () => {
    const r = matchRoute("marketing studio");
    expect(r).toEqual({ route: "/studio/marketing", label: "Marketing Studio" });
  });

  it("prefers the more specific alias when multiple aliases overlap", () => {
    // "marketing studio" should beat "studio" alone because the longer
    // alias scores higher.
    const r = matchRoute("open the marketing studio");
    expect(r).toEqual({ route: "/studio/marketing", label: "Marketing Studio" });
  });

  it("matches BYOK-shaped phrasings to /settings/keys", () => {
    const r = matchRoute("anthropic key");
    expect(r).toEqual({ route: "/settings/keys", label: "API keys (BYOK)" });
  });

  // Regression: "team settings" used to route to /settings because the
  // longer `settings` alias outscored the shorter `team` alias. The
  // route-depth bonus now favors the more specific subroute (codex
  // PR-B review P2).
  it("prefers the more specific subroute when both parent and child aliases match", () => {
    expect(matchRoute("team settings")).toEqual({
      route: "/settings/team",
      label: "Team",
    });
    expect(matchRoute("api keys settings")).toEqual({
      route: "/settings/keys",
      label: "API keys (BYOK)",
    });
  });

  it("still routes a bare 'settings' to /settings", () => {
    const r = matchRoute("settings");
    expect(r).toEqual({ route: "/settings", label: "Settings" });
  });

  it("returns null with a hint when no alias matches", () => {
    const r = matchRoute("the meeting transcripts page");
    expect("route" in r && r.route).toBeNull();
  });

  it("does not crash on empty/whitespace input", () => {
    const r = matchRoute("   ");
    expect("route" in r && r.route).toBeNull();
  });
});

describe("executeRouteMatch", () => {
  it("returns ok:true with the route on a good input", async () => {
    const r = await executeRouteMatch({ query: "team" });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.result).toEqual({ route: "/settings/team", label: "Team" });
  });

  it("rejects bad input shape", async () => {
    const r = await executeRouteMatch({ wrongField: 1 });
    expect(r.ok).toBe(false);
  });

  it("rejects empty query", async () => {
    const r = await executeRouteMatch({ query: "" });
    expect(r.ok).toBe(false);
  });
});

describe("listStudioMenu", () => {
  it("returns one entry per studio role with at least one default template", () => {
    const menu = listStudioMenu();
    expect(menu.length).toBeGreaterThanOrEqual(8);
    for (const r of menu) {
      expect(r.templates.length).toBeGreaterThan(0);
      const prefix = ROLE_PREFIXES[r.role];
      for (const t of r.templates) {
        expect(t.slug.startsWith(prefix)).toBe(true);
      }
    }
  });
});

describe("executeStudioCompose", () => {
  it("validates role + template id and returns a deep link", async () => {
    const r = await executeStudioCompose({ role: "marketing", template: "tweet" });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const result = r.result as StudioComposeResult;
    expect(result.url).toBe("/studio/marketing");
    expect(result.role).toBe("marketing");
    expect(result.roleLabel).toBe("Marketing Studio");
    expect(result.templateLabel).toBe("Tweet thread");
    expect(result.templateSlug).toBe("marketing:tweet-thread");
  });

  it("accepts full template slugs in addition to chip ids", async () => {
    const r = await executeStudioCompose({
      role: "engineering",
      template: "eng:adr-draft",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    const result = r.result as StudioComposeResult;
    expect(result.url).toBe("/studio/engineering");
    expect(result.templateLabel).toBe("ADR draft");
  });

  it("rejects an unknown role", async () => {
    const r = await executeStudioCompose({ role: "growth", template: "anything" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/unknown studio role/i);
  });

  it("rejects a template not in the role's curated menu", async () => {
    const r = await executeStudioCompose({
      role: "marketing",
      template: "novel-untracked-template",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.error).toMatch(/no .* template in Marketing Studio/i);
  });

  it("rejects bad input shape", async () => {
    const r = await executeStudioCompose({ role: 123, template: "tweet" });
    expect(r.ok).toBe(false);
  });
});
