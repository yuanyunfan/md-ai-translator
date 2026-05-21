export const copilotModelVendors = ["copilot", "copilotcli"] as const;

export type CopilotModelVendor = (typeof copilotModelVendors)[number];

export interface CopilotModelSelectorSpec {
  vendor: CopilotModelVendor;
  family?: string;
  id?: string;
}

export interface CopilotModelReference {
  vendor: string;
  id: string;
  family?: string;
  name?: string;
  version?: string;
}

const fallbackCopilotModelSelectors: CopilotModelSelectorSpec[] = [
  { vendor: "copilot", family: "gpt-4o" },
  { vendor: "copilot", family: "gpt-4o-mini" },
  { vendor: "copilot", family: "gpt-4.1" },
  { vendor: "copilot", family: "gpt-5.2" },
  { vendor: "copilotcli", family: "gpt-4o" },
  { vendor: "copilotcli", family: "gpt-4.1" },
  { vendor: "copilot" },
  { vendor: "copilotcli" }
];

export function copilotModelPreferenceToSelectors(modelId: string): CopilotModelSelectorSpec[] {
  return uniqueCopilotSelectors([
    ...copilotModelPreferenceToPreferredSelectors(modelId),
    ...fallbackCopilotModelSelectors
  ]);
}

export function copilotModelDiscoverySelectors(modelId: string): CopilotModelSelectorSpec[] {
  return uniqueCopilotSelectors([
    ...copilotModelPreferenceToPreferredSelectors(modelId),
    ...fallbackCopilotModelSelectors
  ]);
}

function copilotModelPreferenceToPreferredSelectors(modelId: string): CopilotModelSelectorSpec[] {
  const trimmed = modelId.trim();
  if (!trimmed || trimmed === "auto") {
    return fallbackCopilotModelSelectors;
  }

  const explicit = parseCopilotModelReference(trimmed);
  if (explicit) {
    return modelPreferenceToSelectors(explicit.vendor, explicit.value);
  }

  const vendors: CopilotModelVendor[] = prefersCopilotCli(trimmed)
    ? ["copilotcli", "copilot"]
    : ["copilot", "copilotcli"];

  return vendors.flatMap((vendor) => modelPreferenceToSelectors(vendor, trimmed));
}

export function formatCopilotModelPreference(model: CopilotModelReference): string {
  return `${model.vendor}/${model.family || model.id}`;
}

export function formatCopilotModelSelector(selector: CopilotModelSelectorSpec): string {
  if (selector.family) {
    return `${selector.vendor}{family=${selector.family}}`;
  }
  if (selector.id) {
    return `${selector.vendor}{id=${selector.id}}`;
  }
  return `${selector.vendor}{any}`;
}

export function matchesCopilotModelSelector(model: CopilotModelReference, selector: CopilotModelSelectorSpec): boolean {
  if (model.vendor !== selector.vendor) {
    return false;
  }
  if (selector.id && model.id !== selector.id) {
    return false;
  }
  if (selector.family && !matchesModelValue(model, selector.family)) {
    return false;
  }
  return true;
}

export function isCopilotModelVendor(vendor: string): vendor is CopilotModelVendor {
  return copilotModelVendors.includes(vendor as CopilotModelVendor);
}

function parseCopilotModelReference(modelId: string): { vendor: CopilotModelVendor; value: string } | undefined {
  const separator = modelId.indexOf("/");
  if (separator < 0) {
    return undefined;
  }

  const vendor = modelId.slice(0, separator);
  const value = modelId.slice(separator + 1);
  if (!value || !isCopilotModelVendor(vendor)) {
    return undefined;
  }

  return { vendor, value };
}

function prefersCopilotCli(modelId: string): boolean {
  return /^(claude-|gemini-|gpt-5\.(?:[345])|gpt-5-(?:mini|[0-9.]+-codex)|gpt-5\.[0-9]+-codex)/.test(modelId);
}

function uniqueCopilotSelectors(selectors: CopilotModelSelectorSpec[]): CopilotModelSelectorSpec[] {
  const seen = new Set<string>();
  return selectors.filter((selector) => {
    const key = selectorKey(selector);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function modelPreferenceToSelectors(vendor: CopilotModelVendor, value: string): CopilotModelSelectorSpec[] {
  if (value === "auto") {
    return [{ vendor }];
  }
  return [{ vendor, family: value }];
}

function matchesModelValue(model: CopilotModelReference, value: string): boolean {
  const candidates = [model.family, model.id, model.name, model.version].filter(Boolean);
  return candidates.includes(value) || model.id.endsWith(`/${value}`);
}

function selectorKey(selector: CopilotModelSelectorSpec): string {
  if (selector.family) {
    return `${selector.vendor}:family:${selector.family}`;
  }
  if (selector.id) {
    return `${selector.vendor}:id:${selector.id}`;
  }
  return `${selector.vendor}:any`;
}
