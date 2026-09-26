import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppIcon, initialsOf } from "./app-icon";
import { BRAND_ICON_DATA } from "./brand-icons.data";
import { getBrandIcon, searchBrandIcons } from "./brand-icons";

/* The unit project compiles .tsx with the classic JSX runtime (apps/web keeps
   jsx: "preserve" for Next), which expects a global React at call time. */
(globalThis as { React?: typeof React }).React = React;

const render = (props: Parameters<typeof AppIcon>[0]) => renderToStaticMarkup(createElement(AppIcon, props));
/** Any absolute URL other than the SVG namespace would be a network request. */
const externalUrl = /(https?:)?\/\/(?!www\.w3\.org\/2000\/svg)[a-z0-9.-]+/i;

describe("AppIcon", () => {
  it("renders a bundled brand glyph inline, with no URL at all", () => {
    const html = render({ name: "Figma", iconKey: "figma", color: "#7C3AED" });
    expect(html).toContain("<svg");
    expect(html).toContain(`fill="${BRAND_ICON_DATA.figma!.hex}"`);
    expect(html).toContain('aria-label="Figma"');
    expect(html).not.toMatch(externalUrl);
    expect(html).not.toContain("<img");
  });

  it("renders our own stroke mark for Open HelpDesk", () => {
    const html = render({ name: "Open HelpDesk", iconKey: "openhelpdesk" });
    expect(html).toContain('stroke="#0B5F46"');
    expect(html).not.toMatch(externalUrl);
  });

  it("falls back to initials on the app colour for a brand without a glyph", () => {
    const html = render({ name: "Salesforce", iconKey: "salesforce", color: "#1D4ED8" });
    expect(html).not.toContain("<svg");
    expect(html).toContain(">SA<");
    expect(html).toContain("color:#1D4ED8");
  });

  it("falls back to initials for an unknown key or no key", () => {
    expect(render({ name: "Pennylane", iconKey: "nope", color: "#0E7A58" })).toContain(">PE<");
    expect(render({ name: "Adobe Creative Cloud" })).toContain(">AC<");
  });

  it("uses an uploaded logo only when it is served by us", () => {
    const own = render({ name: "Acme CRM", logoUrl: "/api/attachments/123/logo.png" });
    expect(own).toContain('<img src="/api/attachments/123/logo.png"');
    const remote = render({ name: "Acme CRM", logoUrl: "https://www.google.com/s2/favicons?domain=acme.com" });
    expect(remote).not.toContain("<img");
    expect(remote).not.toMatch(externalUrl);
    expect(render({ name: "X", logoUrl: "//cdn.example.com/x.png" })).not.toContain("<img");
  });

  it("never emits an external URL for any bundled brand", () => {
    for (const key of Object.keys(BRAND_ICON_DATA)) {
      expect(render({ name: key, iconKey: key })).not.toMatch(externalUrl);
    }
  });
});

describe("brand icons", () => {
  it("finds brands by name, alias and accent-insensitively", () => {
    expect(searchBrandIcons("fig")[0]?.key).toBe("figma");
    expect(searchBrandIcons("Google Workspace").map((i) => i.key)).toContain("google");
    expect(searchBrandIcons("chatgpt")[0]?.key).toBe("openai");
    expect(searchBrandIcons("")).toEqual([]);
  });

  it("returns null for unknown keys and colour-only entries without a path", () => {
    expect(getBrandIcon("does-not-exist")).toBeNull();
    expect(getBrandIcon(null)).toBeNull();
    expect(getBrandIcon("slack")).toMatchObject({ title: "Slack", path: null });
  });

  it("initials", () => {
    expect(initialsOf("Google Workspace")).toBe("GW");
    expect(initialsOf("Miro")).toBe("MI");
  });
});
