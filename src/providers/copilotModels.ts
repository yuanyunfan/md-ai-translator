export const copilotModelVendors = ["copilot", "copilotcli"] as const;

export type CopilotModelVendor = (typeof copilotModelVendors)[number];

export interface CopilotModelSelectorSpec {
  vendor: CopilotModelVendor;
  id: string;
}

export function copilotModelPreferenceToSelectors(modelId: string): CopilotModelSelectorSpec[] {
  const trimmed = modelId.trim();
  if (!trimmed || trimmed === "auto") {
    return [
      { vendor: "copilot", id: "auto" },
      { vendor: "copilot", id: "gpt-4.1" },
      { vendor: "copilotcli", id: "gpt-4.1" }
    ];
  }

  const explicit = parseCopilotModelReference(trimmed);
  if (explicit) {
    return [explicit];
  }

  const vendors: CopilotModelVendor[] = prefersCopilotCli(trimmed)
    ? ["copilotcli", "copilot"]
    : ["copilot", "copilotcli"];

  return vendors.map((vendor) => ({ vendor, id: trimmed }));
}

export function formatCopilotModelPreference(model: { vendor: string; id: string }): string {
  return `${model.vendor}/${model.id}`;
}

export function isCopilotModelVendor(vendor: string): vendor is CopilotModelVendor {
  return copilotModelVendors.includes(vendor as CopilotModelVendor);
}

function parseCopilotModelReference(modelId: string): CopilotModelSelectorSpec | undefined {
  const separator = modelId.indexOf("/");
  if (separator < 0) {
    return undefined;
  }

  const vendor = modelId.slice(0, separator);
  const id = modelId.slice(separator + 1);
  if (!id || !isCopilotModelVendor(vendor)) {
    return undefined;
  }

  return { vendor, id };
}

function prefersCopilotCli(modelId: string): boolean {
  return /^(claude-|gemini-|gpt-5\.(?:[345])|gpt-5-(?:mini|[0-9.]+-codex)|gpt-5\.[0-9]+-codex)/.test(modelId);
}
