import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel | undefined;

export function initializeLogger(context: vscode.ExtensionContext): void {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("Markdown AI Translator");
    context.subscriptions.push(outputChannel);
  }
}

export function logInfo(message: string): void {
  append("info", message);
}

export function logWarning(message: string): void {
  append("warn", message);
}

export function logError(message: string): void {
  append("error", message);
}

export function showLogOutput(): void {
  outputChannel?.show(true);
}

function append(level: "info" | "warn" | "error", message: string): void {
  outputChannel?.appendLine(`${new Date().toISOString()} [${level}] ${message}`);
}
