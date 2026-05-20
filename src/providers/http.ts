export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly providerCode?: string
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export async function postJson<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
  const combinedSignal = combineSignals(timeoutController.signal, signal);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers
      },
      body: JSON.stringify(body),
      signal: combinedSignal
    });
    const payload = await readResponsePayload(response);

    if (!response.ok) {
      const error = extractProviderError(payload);
      throw new ProviderError(
        error.message || `Provider request failed with HTTP ${response.status}`,
        response.status,
        error.code
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError(`Provider request timed out after ${timeoutMs}ms`);
    }
    if (error instanceof Error) {
      throw new ProviderError(error.message);
    }
    throw new ProviderError("Provider request failed");
  } finally {
    clearTimeout(timeout);
  }
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: { message: text } };
  }
}

function extractProviderError(payload: unknown): { message?: string; code?: string } {
  if (!isRecord(payload)) {
    return {};
  }

  const error = payload.error;
  if (isRecord(error)) {
    return {
      message: typeof error.message === "string" ? error.message : undefined,
      code: typeof error.code === "string" ? error.code : undefined
    };
  }

  if (typeof payload.message === "string") {
    return { message: payload.message };
  }

  return {};
}

function combineSignals(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
  if (!secondary) {
    return primary;
  }

  const controller = new AbortController();
  const abort = () => controller.abort();

  if (primary.aborted || secondary.aborted) {
    controller.abort();
    return controller.signal;
  }

  primary.addEventListener("abort", abort, { once: true });
  secondary.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
