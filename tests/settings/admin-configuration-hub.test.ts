import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("admin/fixvox-web/public/app.js", "utf8");
const stylesSource = readFileSync("admin/fixvox-web/public/styles.css", "utf8");

describe("Admin Configuration hub", () => {
  it("separates Configuration resources into explicit tabs", () => {
    expect(appSource).toContain("configurationTab: 'profiles'");
    expect(appSource).toContain("['profiles', 'Profiles']");
    expect(appSource).toContain("['engines', 'Engines']");
    expect(appSource).toContain("['prompts', 'Prompts']");
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

  it("exposes read-only preview and role-management contracts without browser credentials", () => {
    expect(appSource).toContain("'/api/admin/profiles/preview'");
    expect(appSource).toContain("function renderProfilePreview");
    expect(appSource).toContain("data-profile-preview");
    expect(appSource).toContain("data-publish-profile");
    expect(appSource).toContain("PUBLISH ${profileId} v");
    expect(appSource).toContain("function renderSettingsWorkbench");
    expect(appSource).toContain("'/api/admin/roles'");
    expect(appSource).toContain("data-save-role");
    expect(appSource).toContain("data-remove-role");
    expect(appSource).not.toContain("ADMIN_PUBLISH_API_KEY");
    const serverSource = readFileSync("admin/fixvox-web/server.mjs", "utf8");
    expect(serverSource).toContain("'/api/admin/profiles/publish'");
    expect(serverSource).toContain("ADMIN_PUBLISH_API_KEY");
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

  it("renders published Profiles and saves durable drafts without mounting resource catalogs", () => {
    const start = appSource.indexOf("function renderProfilesPane(data)");
    const end = appSource.indexOf("function renderEnginesPane(data)");
    const profilesPane = appSource.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(profilesPane).toContain("profileOptions");
    expect(profilesPane).toContain("profileVersions");
    expect(appSource).toContain("renderProfileAssignments(selected)");
    expect(appSource).toContain("renderProfileAccess(selected)");
    expect(appSource).toContain("renderProfileRuntime(definition, data)");
    expect(profilesPane).toContain("renderPublishedProfileSection(state.profileTab, selected, definition, data)");
    expect(profilesPane).toContain("data-create-profile-draft");
    expect(profilesPane).toContain("Editar profile");
    expect(profilesPane).toContain("renderProfileModeNotice(record)");
    expect(profilesPane).toContain("renderProfileDraftEditor(record, data)");
    expect(appSource).toContain("profileTab: 'overview'");
    expect(appSource).toContain("['overview', 'Resumen']");
    expect(appSource).toContain("['access', 'Acceso']");
    expect(appSource).toContain("['runtime', 'Runtime']");
    expect(appSource).toContain("['limits', 'Límites']");
    expect(appSource).toContain("['controls', 'Controles']");
    expect(appSource).toContain('data-profile-tab="${id}"');
    expect(appSource).toContain('data-clone-profile');
    expect(appSource).toContain("definition.access = { capabilities:");
    expect(appSource).toContain("definition.userControls =");
    expect(appSource).toContain("definition.defaults =");
    expect(appSource).toContain("definition.limits =");
    expect(appSource).toContain("data-save-profile-draft");
    expect(appSource).toContain('<h4>Resumen</h4>');
    expect(appSource).toContain('<h4>Acceso</h4>');
    expect(appSource).toContain('<h4>Runtime</h4>');
    expect(appSource).toContain('<h4>Límites</h4>');
    expect(profilesPane).not.toContain("renderEngineCatalog");
    expect(profilesPane).not.toContain("renderPromptCatalog");
    expect(profilesPane).not.toContain("renderVariantCatalog");
    expect(appSource).toContain("function renderPublishedProfileSection(tab, selected, definition, data)");
    expect(appSource).toContain("function renderProfileControlsSummary(definition)");
    expect(appSource).toContain("Versión publicada, solo lectura");
    expect(appSource).toContain("crear un draft seguro sin afectar usuarios");
    expect(stylesSource).toContain(".profile-mode-notice");
    expect(stylesSource).toContain(".profile-summary-grid--single");
    expect(appSource).toContain("function createProfileDraft(profileId)");
    expect(appSource).toContain("function saveProfileDraft(form)");
    expect(appSource).toContain("async function discardProfileDraft(profileId, draftVersion)");
    expect(appSource).toContain("data-discard-profile-draft");
    expect(appSource).toContain("Descartar draft");
    expect(appSource).toContain("DISCARD ${profileId} v${draftVersion}");
    expect(appSource).toContain("'/api/admin/profiles/drafts'");
    expect(appSource).not.toContain("Guardar draft local");
    expect(appSource).not.toContain("function savePolicyDraft(");
    expect(appSource).toContain("data-publish-profile");
    expect(appSource).toContain("function canPublishProfiles()");
    expect(readFileSync("admin/fixvox-web/server.mjs", "utf8")).toContain("'/api/admin/profiles/drafts'");
  });
});
