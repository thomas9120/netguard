import type { ExtensionAPI, ToolCallEventResult } from "@earendil-works/pi-coding-agent";
import { detectNetwork, displayCommand } from "./detect.ts";

const BLOCK = "Block";
const ONCE = "Allow once";
const SESSION = "Allow this exact command for this session";

export default function netguard(pi: ExtensionAPI): void {
  const approved = new Set<string>();
  let generation = 0;
  let queue = Promise.resolve();

  function reset(): void {
    approved.clear();
    generation++;
  }

  pi.on("session_start", (_event, ctx) => {
    reset();
    if (ctx.hasUI) ctx.ui.setStatus("netguard", "netguard: approval required");
  });
  pi.on("session_shutdown", reset);

  pi.registerCommand("netguard", {
    description: "Show network guard status; /netguard reset revokes session approvals",
    handler: async (args, ctx) => {
      if (args.trim() === "reset") reset();
      ctx.ui.notify(`Netguard active: ${approved.size} exact command(s) approved for this session. Use /netguard reset to revoke.`, "info");
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash" && event.toolName !== "powershell") return;
    const command = event.input.command;
    if (typeof command !== "string") {
      return { block: true, reason: "Netguard: shell command could not be inspected." };
    }
    const reasons = detectNetwork(command);
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
      if (choice === SESSION) approved.add(key);
      ctx.ui.notify(choice === SESSION ? "Netguard approved this exact command for this session." : "Netguard approved this command once.", "info");
    });
    // A failed request must not poison subsequent requests in the queue.
    queue = decision.then(() => undefined, () => undefined);
    return decision;
  });
}
