// The module @vscode/test-electron loads inside the extension host. Plain
// asserts, no mocha: run() resolving means the suite passed.

import assert from "node:assert/strict";
import * as vscode from "vscode";

export async function run(): Promise<void> {
  // The workspace carries .why/, so workspaceContains should have activated
  // us — but activate explicitly to fail loudly rather than racily.
  const extension = vscode.extensions.getExtension("copperbox.vscode-why");
  assert.ok(extension, "extension copperbox.vscode-why not found in the host");
  await extension.activate();
  assert.ok(extension.isActive, "extension failed to activate on a .why/ workspace");

  const commands = await vscode.commands.getCommands(true);
  for (const command of ["why.showStory", "why.refresh"]) {
    assert.ok(commands.includes(command), `command ${command} not registered`);
  }

  // No why CLI is installed in the throwaway workspace: refresh must degrade
  // to the one-per-session notice, never throw.
  await vscode.commands.executeCommand("why.refresh");
}
