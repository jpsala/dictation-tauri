import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("admin/fixvox-web/public/app.js", "utf8");
const stylesSource = readFileSync("admin/fixvox-web/public/styles.css", "utf8");

describe("Admin Configuration hub", () => {
  it("separates Configuration resources into explicit tabs", () => {
    expect(appSource).toContain("configurationTab: 'profiles'");
    expect(appSource).toContain("['profiles', 'Perfiles']");
    expect(appSource).toContain("['engines', 'Motores']");
    expect(appSource).toContain("['prompts', 'Instrucciones']");
    expect(appSource).toContain("['presets', 'Presets']");
    expect(appSource).not.toContain("['overrides', 'Overrides']");
    expect(appSource).not.toContain("function renderOverridesPane(data)");
    expect(appSource).toContain('data-configuration-tab="${id}"');
    expect(appSource).toContain("function renderConfigurationWorkbench(data)");
    expect(stylesSource).toContain(".configuration-tabs");
  });

  it("keeps audience management in Groups instead of exposing legacy overrides", () => {
    expect(appSource).not.toContain("Overrides del usuario");
    expect(appSource).not.toContain("function renderAccountExperiments(account)");
    expect(appSource).toContain('<span class="eyebrow">Groups</span>');
  });

  it("brokers atomic profile apply and role management without browser credentials", () => {
    expect(appSource).toContain("'/api/admin/profiles/apply'");
    expect(appSource).toContain("function applyProfileChanges");
    expect(appSource).toContain("data-confirm-profile-apply");
    expect(appSource).toContain("function renderSettingsWorkbench");
    expect(appSource).toContain("'/api/admin/roles'");
    expect(appSource).toContain("data-save-role");
    expect(appSource).toContain("data-remove-role");
    expect(appSource).not.toContain("ADMIN_PUBLISH_API_KEY");
    const serverSource = readFileSync("admin/fixvox-web/server.mjs", "utf8");
    expect(serverSource).toContain("'/api/admin/profiles/apply'");
    expect(serverSource).toContain("ADMIN_PUBLISH_API_KEY");
    expect(serverSource).toContain("actorKey: rbacPrincipalKeyForEmail");
    expect(serverSource).toContain("'/api/admin/roles'");
  });

  it("refreshes effective account data and exposes visible mutation outcomes", () => {
    expect(appSource).toContain("async function refreshEffectiveProfilesAfterProfileMutation")
    expect(appSource).toContain("renderProfileMutationOutcome")
    expect(appSource).toContain('data-profile-outcome')
    expect(appSource).toContain("accountsRefreshed")
    expect(appSource).toContain("Audit registrado")
    const serverSource = readFileSync("admin/fixvox-web/server.mjs", "utf8")
    expect(serverSource).toContain("mockPublishProfile")
    expect(serverSource).toContain("mockRollbackProfile")
  })

  it("renders published Profiles with a renderer-local candidate and no normal draft flow", () => {
    const start = appSource.indexOf("function renderProfilesPane(data)");
    const end = appSource.indexOf("function renderEnginesPane(data)");
    const profilesPane = appSource.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(profilesPane).toContain("profileOptions");
    expect(profilesPane).toContain("profileVersions");
    expect(appSource).toContain("function startProfileEdit");
    expect(appSource).toContain("function cancelProfileEdit");
    expect(appSource).toContain("function profileDiff");
    expect(appSource).toContain("function applyProfileChanges");
    expect(profilesPane).toContain("Editar cambios");
    expect(profilesPane).toContain("Cambios sólo en esta ventana");
    expect(profilesPane).toContain("renderProfileDraftEditor(record, data)");
    expect(profilesPane).not.toContain("data-create-profile-draft");
    expect(profilesPane).not.toContain("data-save-profile-draft");
    expect(profilesPane).not.toContain("data-discard-profile-draft");
    expect(profilesPane).not.toContain("data-clone-profile");
    expect(profilesPane).not.toContain("renderEngineCatalog");
    expect(profilesPane).not.toContain("renderPromptCatalog");
    expect(profilesPane).not.toContain("renderVariantCatalog");
    expect(appSource).toContain("profileTab: 'overview'");
    expect(appSource).toContain("['overview', 'Resumen']");
    expect(appSource).toContain("['access', 'Acceso']");
    expect(appSource).toContain("['runtime', 'Runtime']");
    expect(appSource).toContain("['limits', 'Límites']");
    expect(appSource).toContain("['controls', 'Controles']");
    expect(appSource).toContain('data-profile-tab="${id}"');
    expect(appSource).toContain('<h4>Resumen</h4>');
    expect(appSource).toContain('<h4>Acceso</h4>');
    expect(appSource).toContain('<h4>Runtime</h4>');
    expect(appSource).toContain('<h4>Límites</h4>');
    expect(stylesSource).toContain(".profile-local-editor");
    expect(stylesSource).toContain(".profile-review");
    expect(readFileSync("admin/fixvox-web/server.mjs", "utf8")).toContain("'/api/admin/profiles/drafts'");
  });
});
