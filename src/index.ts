import type { ExtensionAPI, ToolCallEventResult } from "@earendil-works/pi-coding-agent";
import { detectNetwork, detectNetworkInScript, displayCommand, runsScript, scriptName } from "./detect.ts";

const BLOCK = "Block";
const ONCE = "Allow once";
const SESSION = "Allow this exact command for this session";

export default function netguard(pi: ExtensionAPI): void {
  // Session approvals, keyed by tool, working directory and command text.
  const approved = new Map<string, string>();
  // Names of scripts written this session that contain network-capable code.
  const networkScripts = new Set<string>();
  let generation = 0;
  let queue = Promise.resolve();

  function reset(): void {
    approved.clear();
    generation++;
  }

  function trackScript(path: unknown, content: string, replacesFile: boolean): void {
    const name = typeof path === "string" ? scriptName(path) : undefined;
    if (!name) return;
    // A changed script can do something new, so approvals that run it no longer apply.
    for (const [key, command] of approved) if (runsScript(command, name)) approved.delete(key);
    if (detectNetworkInScript(content).length > 0) networkScripts.add(name);
    else if (replacesFile) networkScripts.delete(name);
  }

  pi.on("session_start", (_event, ctx) => {
    reset();
    networkScripts.clear();
    if (ctx.hasUI) ctx.ui.setStatus("netguard", "netguard: approval required");
  });
  pi.on("session_shutdown", () => {
    reset();
    networkScripts.clear();
  });

  pi.registerCommand("netguard", {
    description: "Show network guard status; /netguard reset revokes session approvals",
    handler: async (args, ctx) => {
      if (args.trim() === "reset") reset();
      ctx.ui.notify(`Netguard active: ${approved.size} exact command(s) approved for this session. Use /netguard reset to revoke.`, "info");
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "write" && typeof event.input.content === "string") {
      trackScript(event.input.path, event.input.content, true);
      return;
    }
    if (event.toolName === "edit" && Array.isArray(event.input.edits)) {
      const added = event.input.edits.map((edit: { newText?: unknown }) => String(edit?.newText ?? "")).join("\n");
      trackScript(event.input.path, added, false);
      return;
    }
    if (event.toolName !== "bash" && event.toolName !== "powershell") return;
    const command = event.input.command;
    if (typeof command !== "string") {
      return { block: true, reason: "Netguard: shell command could not be inspected." };
    }
    const reasons = detectNetwork(command);
    for (const name of networkScripts) {
      if (runsScript(command, name)) reasons.push(`runs ${name}, written this session with network-capable code`);
    }
    if (reasons.length === 0) return;

    const cwd = ctx.cwd;
    const key = JSON.stringify([event.toolName, cwd, command]);
    const started = generation;
    // Serialize our dialogs even when the host dispatches tool calls concurrently.
    const decision = queue.then(async (): Promise<ToolCallEventResult | undefined> => {
      const block = (reason: string): ToolCallEventResult => ({ block: true, reason: `Netguard: ${reason}` });
      if (started !== generation || ctx.signal?.aborted) return block("approval was cancelled.");
      if (event.input.command !== command || ctx.cwd !== cwd) return block("command or working directory changed; retry for review.");
      if (!ctx.hasUI) return block("recognized network-capable command requires interactive approval.");
      if (approved.has(key)) return;

      let choice: string | undefined;
      try {
        choice = await ctx.ui.select(
          `Netguard: network approval required (${event.toolName})\n` +
          `${reasons.join("; ")}\n\n${displayCommand(command)}\n\n` +
          "Approval permits the whole command, including subprocesses. Session approval matches this command and working directory; files and environment may change.",
          [BLOCK, ONCE, SESSION],
          { signal: ctx.signal },
        );
      } catch {
        return block("approval UI failed; command blocked.");
      }

      if (started !== generation || ctx.signal?.aborted) return block("approval was cancelled.");
      if (event.input.command !== command || ctx.cwd !== cwd) return block("command or working directory changed during approval; retry for review.");
      if (choice !== ONCE && choice !== SESSION) {
        ctx.ui.notify("Netguard blocked a network-capable command.", "warning");
        return block("network-capable command was not approved. Ask the user before retrying.");
      }
      if (choice === SESSION) approved.set(key, command);
      ctx.ui.notify(choice === SESSION ? "Netguard approved this exact command for this session." : "Netguard approved this command once.", "info");
    });
    // A failed request must not poison subsequent requests in the queue.
    queue = decision.then(() => undefined, () => undefined);
    return decision;
  });
}
