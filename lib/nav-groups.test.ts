import { describe, expect, it } from "vitest";
import { activeGroupId, adminNavMenu, cashierNavMenu, isNavItemActive, openGroupIds, parseSavedGroups } from "./nav-groups";

describe("nav groups", () => {
  it("opens only Sell for the owner until a choice is saved", () => {
    expect(openGroupIds(adminNavMenu, null, "/bom03")).toEqual(["sell"]);
  });

  it("keeps the group holding the current page open even if it was saved closed", () => {
    expect(openGroupIds(adminNavMenu, ["sell"], "/bom03/expenses").sort()).toEqual(["money", "sell"]);
  });

  it("keeps the saved choice for other groups", () => {
    expect(openGroupIds(adminNavMenu, ["stock"], "/bom03").sort()).toEqual(["stock"]);
  });

  it("always shows every cashier group", () => {
    expect(openGroupIds(cashierNavMenu, [], "/cashier")).toEqual(["sell", "stock", "money"]);
  });

  it("finds the group of the current page, and none for the dashboard", () => {
    expect(activeGroupId(adminNavMenu, "/bom03/inventory")).toBe("stock");
    expect(activeGroupId(adminNavMenu, "/bom03")).toBeNull();
  });

  it("keeps Settings selected on its sub-pages", () => {
    const settings = adminNavMenu.footer[0];
    expect(isNavItemActive("/bom03/settings/services", settings)).toBe(true);
    expect(isNavItemActive("/bom03/settingsx", settings)).toBe(false);
  });

  it("ignores a damaged saved value", () => {
    expect(parseSavedGroups("{oops")).toBeNull();
    expect(parseSavedGroups('[1,2]')).toBeNull();
    expect(parseSavedGroups('["sell"]')).toEqual(["sell"]);
  });

  it("lists every page once per portal", () => {
    for (const menu of [adminNavMenu, cashierNavMenu]) {
      const hrefs = [menu.home, ...menu.groups.flatMap((g) => g.items), ...menu.footer].map((i) => i.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });
});
