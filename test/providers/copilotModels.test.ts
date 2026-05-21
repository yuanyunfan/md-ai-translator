import test from "node:test";
import assert from "node:assert/strict";
import {
  copilotModelPreferenceToSelectors,
  formatCopilotModelPreference,
  isCopilotModelVendor,
  matchesCopilotModelSelector
} from "../../src/providers/copilotModels";

test("legacy gpt-5.5 preference resolves to copilotcli before copilot", () => {
  assert.deepEqual(copilotModelPreferenceToSelectors("gpt-5.5"), [
    { vendor: "copilotcli", id: "gpt-5.5" },
    { vendor: "copilot", id: "gpt-5.5" }
  ]);
});

test("explicit Copilot model reference keeps its vendor", () => {
  assert.deepEqual(copilotModelPreferenceToSelectors("copilotcli/gpt-5.5"), [
    { vendor: "copilotcli", id: "gpt-5.5" }
  ]);
  assert.equal(formatCopilotModelPreference({ vendor: "copilotcli", id: "gpt-5.5" }), "copilotcli/gpt-5.5");
});

test("stable Copilot ids prefer the copilot vendor", () => {
  assert.deepEqual(copilotModelPreferenceToSelectors("gpt-4.1"), [
    { vendor: "copilot", id: "gpt-4.1" },
    { vendor: "copilotcli", id: "gpt-4.1" }
  ]);
});

test("auto preference uses Copilot auto then stable fallbacks", () => {
  assert.deepEqual(copilotModelPreferenceToSelectors("auto"), [
    { vendor: "copilot", id: "auto" },
    { vendor: "copilot", id: "gpt-4.1" },
    { vendor: "copilotcli", id: "gpt-4.1" }
  ]);
});

test("only GitHub Copilot model vendors are accepted", () => {
  assert.equal(isCopilotModelVendor("copilot"), true);
  assert.equal(isCopilotModelVendor("copilotcli"), true);
  assert.equal(isCopilotModelVendor("openai"), false);
});

test("model selector matching requires vendor and id", () => {
  assert.equal(
    matchesCopilotModelSelector(
      { vendor: "copilotcli", id: "gpt-5.5" },
      { vendor: "copilotcli", id: "gpt-5.5" }
    ),
    true
  );
  assert.equal(
    matchesCopilotModelSelector(
      { vendor: "copilot", id: "gpt-5.5" },
      { vendor: "copilotcli", id: "gpt-5.5" }
    ),
    false
  );
});
