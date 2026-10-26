import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompanyContext } from "../src/components/dashboard/company-context";

describe("CompanyContext", () => {
  it("shows the selected company and its branch when the account has multiple companies", () => {
    const markup = renderToStaticMarkup(createElement(CompanyContext, {
      tenantChoices: [
        { id: "tenant-a", name: "YacellTech", branchId: "branch-a", branchName: "La Romana", role: "tenant_admin" },
        { id: "tenant-b", name: "KrediMax Norte", branchId: "branch-b", branchName: "Santiago", role: "branch_manager" },
      ],
      selectedTenant: "tenant-b",
      organization: "KrediMax Norte",
      branch: "Santiago",
      onTenantChange: () => undefined,
    }));

    expect(markup).toContain('aria-label="Empresa activa"');
    expect(markup).toContain('value="tenant-b" selected=""');
    expect(markup).toContain('aria-label="Sucursal activa: Santiago"');
    expect(markup).toContain(">Santiago</span>");
  });

  it("shows company and branch without a selector for a single-company account", () => {
    const markup = renderToStaticMarkup(createElement(CompanyContext, {
      tenantChoices: [
        { id: "tenant-a", name: "YacellTech", branchId: null, branchName: "Todas las sucursales", role: "tenant_admin" },
      ],
      selectedTenant: "tenant-a",
      organization: "YacellTech",
      branch: "Todas las sucursales",
      onTenantChange: () => undefined,
    }));

    expect(markup).toContain("YacellTech · Todas las sucursales");
    expect(markup).not.toContain('aria-label="Empresa activa"');
  });
});
