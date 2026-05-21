import test from "node:test";
import assert from "node:assert/strict";
import {
  copilotModelDiscoverySelectors,
  copilotModelPreferenceToSelectors,
  formatCopilotModelPreference,
  formatCopilotModelSelector,
  isCopilotModelVendor,
  matchesCopilotModelSelector
} from "../../src/providers/copilotModels";

test("legacy gpt-5.5 preference resolves by family first then uses stable fallbacks", () => {
  assert.deepEqual(copilotModelPreferenceToSelectors("gpt-5.5"), [
    { vendor: "copilotcli", family: "gpt-5.5" },
    { vendor: "copilot", family: "gpt-5.5" },
    { vendor: "copilot", family: "gpt-4o" },
    { vendor: "copilot", family: "gpt-4o-mini" },
    { vendor: "copilot", family: "gpt-4.1" },
    { vendor: "copilot", family: "gpt-5.2" },
    { vendor: "copilotcli", family: "gpt-4o" },
    { vendor: "copilotcli", family: "gpt-4.1" },
    { vendor: "copilot" },
    { vendor: "copilotcli" }
  ]);
});

test("explicit Copilot model reference keeps its vendor before family fallbacks", () => {
  assert.deepEqual(copilotModelPreferenceToSelectors("copilotcli/gpt-5.5"), [
    { vendor: "copilotcli", family: "gpt-5.5" },
    { vendor: "copilot", family: "gpt-4o" },
    { vendor: "copilot", family: "gpt-4o-mini" },
    { vendor: "copilot", family: "gpt-4.1" },
    { vendor: "copilot", family: "gpt-5.2" },
    { vendor: "copilotcli", family: "gpt-4o" },
    { vendor: "copilotcli", family: "gpt-4.1" },
    { vendor: "copilot" },
    { vendor: "copilotcli" }
  ]);
  assert.equal(formatCopilotModelPreference({ vendor: "copilotcli", id: "internal-id", family: "gpt-5.5" }), "copilotcli/gpt-5.5");
  assert.equal(formatCopilotModelSelector({ vendor: "copilotcli", family: "gpt-5.5" }), "copilotcli{family=gpt-5.5}");
});

test("stable Copilot ids prefer the copilot vendor", () => {
  assert.deepEqual(copilotModelPreferenceToSelectors("gpt-4.1").slice(0, 3), [
    { vendor: "copilot", family: "gpt-4.1" },
    { vendor: "copilotcli", family: "gpt-4.1" },
    { vendor: "copilot", family: "gpt-4o" }
  ]);
});

test("public Copilot preferences do not create exact id selectors", () => {
  assert.equal(copilotModelPreferenceToSelectors("copilot/gpt-4.1").some((selector) => Boolean(selector.id)), false);
});

test("auto preference uses Copilot auto then stable fallbacks", () => {
  assert.deepEqual(copilotModelPreferenceToSelectors("auto"), [
    { vendor: "copilot", family: "gpt-4o" },
    { vendor: "copilot", family: "gpt-4o-mini" },
    { vendor: "copilot", family: "gpt-4.1" },
    { vendor: "copilot", family: "gpt-5.2" },
    { vendor: "copilotcli", family: "gpt-4o" },
    { vendor: "copilotcli", family: "gpt-4.1" },
    { vendor: "copilot" },
    { vendor: "copilotcli" }
  ]);
});

test("model discovery selectors include current preference and a bounded Copilot list", () => {
  assert.deepEqual(copilotModelDiscoverySelectors("gpt-5.5"), [
    { vendor: "copilotcli", family: "gpt-5.5" },
    { vendor: "copilot", family: "gpt-5.5" },
    { vendor: "copilot", family: "gpt-4o" },
    { vendor: "copilot", family: "gpt-4o-mini" },
    { vendor: "copilot", family: "gpt-4.1" },
    { vendor: "copilot", family: "gpt-5.2" },
    { vendor: "copilotcli", family: "gpt-4o" },
    { vendor: "copilotcli", family: "gpt-4.1" },
    { vendor: "copilot" },
    { vendor: "copilotcli" }
  ]);
});

test("only GitHub Copilot model vendors are accepted", () => {
  assert.equal(isCopilotModelVendor("copilot"), true);
  assert.equal(isCopilotModelVendor("copilotcli"), true);
  assert.equal(isCopilotModelVendor("openai"), false);
});

test("model selector matching prefers vendor and family", () => {
  assert.equal(
    matchesCopilotModelSelector(
      { vendor: "copilotcli", id: "internal-id", family: "gpt-5.5" },
      { vendor: "copilotcli", family: "gpt-5.5" }
    ),
    true
  );
  assert.equal(
    matchesCopilotModelSelector(
      { vendor: "copilot", id: "internal-id", family: "gpt-5.5" },
      { vendor: "copilotcli", family: "gpt-5.5" }
    ),
    false
  );
});
