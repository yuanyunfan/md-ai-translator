import * as vscode from "vscode";
import { providerLabels, providerSecretKey, readExtensionConfig } from "./config";
import { initializeLogger, logInfo, logWarning } from "./logging";
import { resolveBaseUrl } from "./providers";
import {
  fetchGitHubCopilotModels,
  normalizeCopilotModelId,
  type GitHubCopilotModel
} from "./providers/githubCopilot";
import {
  getProviderDefinition,
  providerRegistry
} from "./providers/registry";
import type { ProviderDefinition, ProviderId, ProviderModel } from "./providers/types";
import { TranslationPreviewManager } from "./webview/panel";

let manager: TranslationPreviewManager | undefined;
let suppressActiveProviderConnect = false;
const githubCopilotClientId = "Ov23li8tweQw6odWQebz";
const githubCopilotAuthPollSafetyMs = 3000;
const modelListTimeoutMs = 30000;

export function activate(context: vscode.ExtensionContext): void {
  initializeLogger(context);
  logInfo("Extension activated.");
  manager = new TranslationPreviewManager(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("mdAiTranslator.openPreview", () => {
      const document = getActiveMarkdownDocument();
      if (!document) {
        vscode.window.showWarningMessage("Open a Markdown document before starting AI translation preview.");
        return;
      }
      manager?.open(document);
    }),
    vscode.commands.registerCommand("mdAiTranslator.refreshPreview", () => {
      manager?.refreshActive();
    }),
    vscode.commands.registerCommand("mdAiTranslator.connectProvider", async () => {
      await connectProvider(context);
    }),
    vscode.commands.registerCommand("mdAiTranslator.selectModel", async () => {
      await selectProviderModel(context);
    }),
    vscode.commands.registerCommand("mdAiTranslator.setApiKey", async () => {
      await connectProvider(context);
    }),
    vscode.commands.registerCommand("mdAiTranslator.clearApiKey", async () => {
      await clearProviderCredential(context);
    }),
    vscode.commands.registerCommand("mdAiTranslator.connectCopilot", async () => {
      await connectProvider(context, { providerId: "githubCopilot", forceCredential: true });
    }),
    vscode.commands.registerCommand("mdAiTranslator.selectCopilotModel", async () => {
      await selectProviderModel(context, "githubCopilot");
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      manager?.updateDocument(event.document);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("mdAiTranslator.activeProvider") || suppressActiveProviderConnect) {
        return;
      }
      const providerId = readExtensionConfig().activeProvider;
      void connectProvider(context, { providerId });
    })
  );
}

export function deactivate(): void {
  manager = undefined;
}

function getActiveMarkdownDocument(): vscode.TextDocument | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }
  return isMarkdownDocument(editor.document) ? editor.document : undefined;
}

function isMarkdownDocument(document: vscode.TextDocument): boolean {
  const fileName = document.fileName.toLowerCase();
  return document.languageId === "markdown" || fileName.endsWith(".md") || fileName.endsWith(".markdown");
}

async function connectProvider(
  context: vscode.ExtensionContext,
  options: { providerId?: ProviderId; forceCredential?: boolean } = {}
): Promise<void> {
  const providerId = options.providerId ?? (await pickProvider("Connect AI provider"));
  if (!providerId) {
    return;
  }

  const definition = getProviderDefinition(providerId);
  if (!(await ensureProviderBaseUrl(definition))) {
    return;
  }

  switch (definition.auth) {
    case "apiKey":
      if (!(await promptAndStoreApiKey(context, definition))) {
        return;
      }
      break;
    case "oauthDevice":
      if (!(await ensureOAuthDeviceCredential(context, definition, options.forceCredential === true))) {
        return;
      }
      break;
    case "none":
      break;
    default:
      return exhaustiveAuth(definition.auth);
  }

  await selectProviderModel(context, providerId);
}

async function clearProviderCredential(context: vscode.ExtensionContext): Promise<void> {
  const providerId = await pickProvider("Clear credentials for provider", { includeNoAuth: false });
  if (!providerId) {
    return;
  }

  const definition = getProviderDefinition(providerId);
  await context.secrets.delete(providerSecretKey(providerId));
  vscode.window.showInformationMessage(`${definition.label} credentials cleared.`);
}

async function pickProvider(
  placeHolder: string,
  options: { includeNoAuth?: boolean } = {}
): Promise<ProviderId | undefined> {
  const activeProvider = readExtensionConfig().activeProvider;
  const providers = providerRegistry.filter((provider) => options.includeNoAuth !== false || provider.auth !== "none");
  const picked = await vscode.window.showQuickPick(
    providers.map((provider) => ({
      label: provider.label,
      description: providerDescription(provider, activeProvider),
      detail: provider.description,
      providerId: provider.id
    })),
    { placeHolder }
  );
  return picked?.providerId;
}

function providerDescription(provider: ProviderDefinition, activeProvider: ProviderId): string {
  const auth = provider.auth === "none" ? "no auth" : provider.auth === "oauthDevice" ? "browser login" : "API key";
  return provider.id === activeProvider ? `active · ${auth}` : auth;
}

async function promptAndStoreApiKey(context: vscode.ExtensionContext, definition: ProviderDefinition): Promise<boolean> {
  const apiKey = await vscode.window.showInputBox({
    title: `Connect ${definition.label}`,
    prompt: "The key is stored in VS Code SecretStorage, not in settings.json.",
    password: true,
    ignoreFocusOut: true,
    validateInput(value) {
      return value.trim() ? undefined : "API key cannot be empty.";
    }
  });

  if (apiKey === undefined) {
    return false;
  }

  await context.secrets.store(providerSecretKey(definition.id), apiKey.trim());
  vscode.window.showInformationMessage(`${definition.label} API key saved.`);
  return true;
}

async function ensureOAuthDeviceCredential(
  context: vscode.ExtensionContext,
  definition: ProviderDefinition,
  forceCredential: boolean
): Promise<boolean> {
  if (definition.id !== "githubCopilot") {
    vscode.window.showErrorMessage(`${definition.label} browser login is not implemented yet.`);
    return false;
  }

  const existing = forceCredential ? undefined : await context.secrets.get(providerSecretKey(definition.id));
  if (existing) {
    return true;
  }

  const token = await signInToGitHubForCopilot();
  if (!token) {
    return false;
  }

  await context.secrets.store(providerSecretKey(definition.id), token);
  return true;
}

async function ensureProviderBaseUrl(definition: ProviderDefinition): Promise<boolean> {
  if (!definition.requiresBaseUrl) {
    return true;
  }

  const config = readExtensionConfig();
  if (resolveBaseUrl(config, definition).trim()) {
    return true;
  }

  const baseUrl = await vscode.window.showInputBox({
    title: `Set ${definition.label} Base URL`,
    prompt: "Enter the OpenAI-compatible API base URL, for example https://example.com/v1.",
    ignoreFocusOut: true,
    validateInput(value) {
      return value.trim() ? undefined : "Base URL cannot be empty.";
    }
  });
  if (baseUrl === undefined) {
    return false;
  }

  await updateProviderBaseUrl(definition.id, baseUrl.trim());
  return true;
}

async function selectProviderModel(context: vscode.ExtensionContext, providerId?: ProviderId): Promise<void> {
  const config = readExtensionConfig();
  const selectedProviderId = providerId ?? config.activeProvider;
  const definition = getProviderDefinition(selectedProviderId);
  const models = await loadModelChoices(context, definition);
  if (!models) {
    return;
  }

  const currentModel = currentModelForProvider(definition, config);
  const customLabel = "$(edit) Enter custom model id...";
  const picked = await vscode.window.showQuickPick(
    [
      ...models.map((model) => ({
        label: model.name,
        description: model.id,
        detail: model.description,
        picked: model.id === currentModel || (definition.id === "githubCopilot" && normalizeCopilotModelId(currentModel) === model.id),
        modelId: model.id
      })),
      {
        label: customLabel,
        description: "Use a model id not listed here",
        detail: "Useful for custom OpenAI-compatible providers or newly released provider models.",
        modelId: ""
      }
    ],
    {
      placeHolder: currentModel ? `Current ${definition.label}: ${currentModel}` : `Select a ${definition.label} model`
    }
  );

  if (!picked) {
    return;
  }

  const modelId =
    picked.label === customLabel
      ? await vscode.window.showInputBox({
          title: `Set ${definition.label} Model`,
          prompt: "Enter the exact provider model id.",
          value: currentModel === "auto" ? "" : currentModel,
          ignoreFocusOut: true,
          validateInput(value) {
            return value.trim() ? undefined : "Model id cannot be empty.";
          }
        })
      : picked.modelId;
  if (modelId === undefined) {
    return;
  }

  await updateProviderModel(definition.id, modelId.trim());
  await updateActiveProvider(definition.id);
  vscode.window.showInformationMessage(`${definition.label} selected: ${modelId.trim()}`);
}

async function updateActiveProvider(providerId: ProviderId): Promise<void> {
  const current = readExtensionConfig().activeProvider;
  if (current === providerId) {
    return;
  }

  suppressActiveProviderConnect = true;
  try {
    await vscode.workspace.getConfiguration("mdAiTranslator").update("activeProvider", providerId, vscode.ConfigurationTarget.Global);
  } finally {
    setTimeout(() => {
      suppressActiveProviderConnect = false;
    }, 0);
  }
}

async function loadModelChoices(
  context: vscode.ExtensionContext,
  definition: ProviderDefinition
): Promise<ProviderModel[] | undefined> {
  if (definition.id === "githubCopilot") {
    const token = await context.secrets.get(providerSecretKey(definition.id));
    if (!token) {
      vscode.window.showWarningMessage("GitHub Copilot is not connected. Run Markdown AI Translator: Connect AI Provider first.");
      return undefined;
    }
    try {
      logInfo("Discovering GitHub Copilot models from api.githubcopilot.com.");
      const models = await fetchGitHubCopilotModels(token, { timeoutMs: modelListTimeoutMs });
      return models.map((model) => ({
        id: model.id,
        name: model.name,
        description: formatCopilotModelDetail(model)
      }));
    } catch (error) {
      vscode.window.showErrorMessage(
        `${toUserMessage(error, "GitHub Copilot model discovery failed")} Re-run Markdown AI Translator: Connect AI Provider if your token expired, or check that your account has Copilot access.`
      );
      return undefined;
    }
  }

  return definition.models && definition.models.length > 0
    ? [...definition.models]
    : [{ id: currentModelForProvider(definition, readExtensionConfig()) || "model-id", name: "Configured model" }];
}

function currentModelForProvider(definition: ProviderDefinition, config = readExtensionConfig()): string {
  const configured = config.providerModels[definition.id]?.trim();
  if (configured) {
    return configured;
  }

  switch (definition.id) {
    case "openai":
      return config.openai.model;
    case "anthropic":
      return config.anthropic.model;
    case "azureOpenAI":
      return config.azureOpenAI.deployment;
    case "githubCopilot":
      return config.githubCopilot.modelId;
    default:
      return definition.defaultModel ?? "";
  }
}

async function updateProviderModel(providerId: ProviderId, modelId: string): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("mdAiTranslator");
  const config = readExtensionConfig();
  await cfg.update(
    "providerModels",
    {
      ...config.providerModels,
      [providerId]: modelId
    },
    vscode.ConfigurationTarget.Global
  );

  if (providerId === "openai") {
    await cfg.update("openai.model", modelId, vscode.ConfigurationTarget.Global);
  } else if (providerId === "anthropic") {
    await cfg.update("anthropic.model", modelId, vscode.ConfigurationTarget.Global);
  } else if (providerId === "azureOpenAI") {
    await cfg.update("azureOpenAI.deployment", modelId, vscode.ConfigurationTarget.Global);
  } else if (providerId === "githubCopilot") {
    await cfg.update("githubCopilot.modelId", modelId, vscode.ConfigurationTarget.Global);
  }
}

async function updateProviderBaseUrl(providerId: ProviderId, baseUrl: string): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("mdAiTranslator");
  const config = readExtensionConfig();
  await cfg.update(
    "providerBaseUrls",
    {
      ...config.providerBaseUrls,
      [providerId]: baseUrl
    },
    vscode.ConfigurationTarget.Global
  );
}

async function signInToGitHubForCopilot(): Promise<string | undefined> {
  try {
    const device = await requestGitHubDeviceCode();
    await vscode.env.openExternal(vscode.Uri.parse(device.verificationUri));
    await vscode.window.showInformationMessage(
      `GitHub Copilot login opened in your browser. Enter code ${device.userCode} to authorize Markdown AI Translator.`,
      { modal: true }
    );

    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `GitHub Copilot login: enter code ${device.userCode}`,
        cancellable: true
      },
      async (_progress, cancellation) => pollGitHubDeviceAuthorization(device, cancellation)
    );
  } catch (error) {
    vscode.window.showErrorMessage(toUserMessage(error, "GitHub Copilot sign-in failed"));
    return undefined;
  }
}

function formatCopilotModelDetail(model: GitHubCopilotModel): string {
  const limits = [
    model.maxContextWindowTokens ? `context ${model.maxContextWindowTokens.toLocaleString()}` : undefined,
    model.maxOutputTokens ? `output ${model.maxOutputTokens.toLocaleString()}` : undefined
  ]
    .filter(Boolean)
    .join(" · ");
  const capabilities = [
    model.supportsReasoning ? "reasoning" : undefined,
    model.supportsVision ? "vision" : undefined,
    model.supportsToolCalls ? "tools" : undefined
  ]
    .filter(Boolean)
    .join(" · ");
  return [model.supportedEndpoints.join(", ") || "/chat/completions", limits, capabilities].filter(Boolean).join(" · ");
}

function toUserMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return `${fallback}: ${error.message}`;
  }
  return fallback;
}

interface GitHubDeviceCode {
  verificationUri: string;
  userCode: string;
  deviceCode: string;
  intervalSeconds: number;
  expiresInSeconds: number;
}

async function requestGitHubDeviceCode(): Promise<GitHubDeviceCode> {
  const response = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "User-Agent": "MarkdownAITranslator/0.1.0"
    },
    body: JSON.stringify({
      client_id: githubCopilotClientId,
      scope: "read:user"
    })
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof payload.error_description === "string" ? payload.error_description : "Failed to initiate device authorization");
  }

  if (
    typeof payload.verification_uri !== "string" ||
    typeof payload.user_code !== "string" ||
    typeof payload.device_code !== "string"
  ) {
    throw new Error("GitHub device authorization response was missing required fields");
  }

  return {
    verificationUri: payload.verification_uri,
    userCode: payload.user_code,
    deviceCode: payload.device_code,
    intervalSeconds: typeof payload.interval === "number" ? payload.interval : 5,
    expiresInSeconds: typeof payload.expires_in === "number" ? payload.expires_in : 900
  };
}

async function pollGitHubDeviceAuthorization(
  device: GitHubDeviceCode,
  cancellation: vscode.CancellationToken
): Promise<string | undefined> {
  const started = Date.now();
  let intervalMs = device.intervalSeconds * 1000 + githubCopilotAuthPollSafetyMs;

  while (!cancellation.isCancellationRequested) {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "User-Agent": "MarkdownAITranslator/0.1.0"
      },
      body: JSON.stringify({
        client_id: githubCopilotClientId,
        device_code: device.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code"
      })
    });
    const payload = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      throw new Error(typeof payload.error_description === "string" ? payload.error_description : "GitHub device authorization failed");
    }

    if (typeof payload.access_token === "string" && payload.access_token.trim()) {
      return payload.access_token.trim();
    }

    if (payload.error === "authorization_pending") {
      await sleep(intervalMs, cancellation);
      continue;
    }

    if (payload.error === "slow_down") {
      const nextIntervalSeconds = typeof payload.interval === "number" ? payload.interval : device.intervalSeconds + 5;
      intervalMs = nextIntervalSeconds * 1000 + githubCopilotAuthPollSafetyMs;
      logWarning("GitHub requested slower Copilot device authorization polling.");
      await sleep(intervalMs, cancellation);
      continue;
    }

    if (payload.error === "expired_token" || Date.now() - started > device.expiresInSeconds * 1000) {
      throw new Error("GitHub Copilot sign-in code expired. Run Markdown AI Translator: Connect AI Provider again.");
    }

    if (typeof payload.error_description === "string") {
      throw new Error(payload.error_description);
    }

    await sleep(intervalMs, cancellation);
  }

  return undefined;
}

function sleep(ms: number, cancellation: vscode.CancellationToken): Promise<void> {
  return new Promise((resolve) => {
    if (cancellation.isCancellationRequested) {
      resolve();
      return;
    }
    const timeout = setTimeout(resolve, ms);
    cancellation.onCancellationRequested(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function exhaustiveAuth(value: never): never {
  throw new Error(`Unsupported provider auth type: ${String(value)}`);
}
