# pi-netguard

A small pi extension that asks before **recognized network-capable shell commands** run. Designed to add friction and visibility to unexpected downloads, uploads and other outbound activity, including the visible `curl` upload described in [Cohere's report](https://cohere.com/blog/concerning-behaviour-popular-open-weight-ai-model).

**This is a command approval guard, not a firewall or network monitor.** It inspects text before execution; it cannot observe actual connections or guarantee that traffic stays on your machine. No proxy, daemon, packet capture, elevated permissions or runtime dependencies.

## Install

```sh
pi install npm:pi-netguard
```

Try it for one session without adding it to your settings:

```sh
pi -e npm:pi-netguard
```

From a checkout, use `pi -e ./src/index.ts` or `pi install /absolute/path/to/netguard`. On Windows, use a quoted absolute path, for example `pi install "C:\P2027\pi-plugins\netguard"`. Restart pi or run `/reload` after installation. Installing only to a project makes protection dependent on loading that project's resources; a personal installation is preferable for a guard.

Developed and tested with `@earendil-works/pi-coding-agent` 1.4.0 (Node 22.18+). This is the current pi package name; compatibility with older `@mariozechner` releases is unverified. See pi's [extension](https://pi.dev/docs/latest/extensions) and [package](https://pi.dev/docs/latest/packages) documentation.

## Approval choices

Before a detected `bash` or `powershell` tool call executes, the dialog shows the reasons and the complete command, then offers:

- **Block** (first/default option). Escape or dismissal also blocks.
- **Allow once**. Only this invocation is approved.
- **Allow this exact command for this session**. The same command text, shell tool and working directory can run again without another prompt. Changing any of those requires fresh approval. This does not grant trust to a host, domain or executable in general.

Approval permits the **whole shell command**, including chained commands and subprocesses. Identical text can behave differently if files, environment variables, DNS, Git remotes or other external state change. When the agent writes or edits a script, session approvals for commands that run it are revoked. Other changes are not tracked, so prefer **Allow once** for commands that depend on mutable inputs.

Session approvals stay in memory. New, resumed or forked sessions, reloads and shutdown clear them. Use `/netguard reset` to revoke them immediately; `/netguard` reports the approval count. Resetting does not stop commands that are already running.

`/netguard off` stops prompting: recognized network-capable commands run without approval and the status bar shows `netguard: OFF`. `/netguard on` turns the guard back on. Every new session starts with the guard on. Scripts written while it is off are still tracked, so running them prompts once it is back on.

In print/JSON mode, or without an approval UI, detected calls are blocked. RPC clients must support pi's selection dialog. A dialog error, cancellation or aborted operation blocks the call. Calls that are not detected continue normally. Netguard emits local approval/block notifications and a status indicator; it does not send telemetry or create its own audit log.

## What triggers a prompt

The detector conservatively scans the entire command, including visible pipelines, nested shell strings and inline code. Common Bash/PowerShell line continuations are joined for detection. Terminal controls and invisible formatting characters are escaped in the dialog.

| Visible pattern | Examples |
| --- | --- |
| URLs | HTTP(S), FTP, SSH, Git, WebSocket, S3, GCS, SMB and rsync URLs, including cloud metadata URLs |
| Transfer and network utilities | `curl`, `wget`, `ssh`, `scp`, `rsync`, `nc`, `socat`, `ping`, `nmap` |
| DNS utilities | `dig`, `nslookup`, `host`, `Resolve-DnsName` |
| PowerShell and Windows | `Invoke-WebRequest`, `irm`, `Start-BitsTransfer`, remoting (`Enter-PSSession`, `-ComputerName`), `\\server\share` paths, `certutil -urlcache`, `bitsadmin` |
| Cloud, cluster and code-hosting CLIs | `aws`, `az`, `gcloud`, `gsutil`, `azcopy`, `rclone`, `kubectl`, `helm`, `gh`, `glab`, `hf` |
| Git network operations | `clone`, `fetch`, `pull`, `push`, `ls-remote`, `submodule`, `remote update`, `send-email`, `lfs` |
| Package operations | Install, download, publish and registry subcommands of language and OS package managers (`npm`, `pip`, `uv`, `cargo`, `brew`, `apt`, `winget`, …); `npx`, `uvx`, `pipx`, `bunx` |
| Containers and model registries | `docker`/`podman` `pull`, `push`, `login`, `run`, `build`, `compose up`; `ollama pull` |
| Networking code | Common Python libraries, JS `fetch`, HTTP clients and socket APIs, .NET network classes, `/dev/tcp`, `/dev/udp` |
| Scripts written this session | Running a script (`python upload.py`, `./send.sh`) that the agent created or edited with networking code in this session |

These are text heuristics rather than a shell parser. Distinctive tool names match anywhere, so `echo curl` triggers. Names that are also common words (`host`, `http`, `az`, `gh`, `ping`) only match where a command starts, and Git and package verbs only match as the subcommand, so commit messages, paths and search terms such as `git commit -m "fix push"` or `rg host src` do not prompt. Downloads and GET requests require approval too, since URLs, DNS lookups and headers can carry data. No destination is implicitly trusted, including localhost.

Script tracking only covers scripts written through pi's `write` and `edit` tools in the current session, and only when the command names the script. Mentioning a script without running it (`git add upload.py`) does not prompt. Bare URLs in a script are ignored because they are common in configuration files.

## Scope and limitations

- **Hidden network activity is missed.** Scripts that existed before the session or were created by other means, scripts imported by another script, `./binary`, shell aliases/functions, `make`, `npm test`, Git hooks and dependency lifecycle scripts can connect without visible matching text. An approved installer may execute arbitrary scripts and access other destinations.
- **Obfuscation bypasses detection.** Encoded code, constructed executable names, runtime imports, renamed utilities and unrecognized clients can evade the rules. Do not use this against a deliberately evasive agent as your only control.
- **Other tools and extensions are outside scope.** Custom/MCP tools, extension-owned network calls, pi's model-provider requests and user-entered `!` shell commands are not guarded. `write` and `edit` are not blocked; they are only inspected so that running the resulting script prompts. Tool code calling the host's guarded `bash`/`powershell` path is covered; direct process execution is not.
- **The extension shares pi's permissions.** An agent able to edit this extension or change its loading configuration can tamper with it. Install from a location the agent cannot write when practical. Other extensions can modify tool arguments after this guard approves them; only load trusted extensions.
- **No connection or payload inspection.** The guard does not resolve destinations, intercept redirects, inspect encrypted traffic, scan files for secrets, or stop background processes. A session approval authorizes matching command text, not a fixed network request.

For enforced egress control, pair this with an OS/container network policy or a mandatory proxy. That is a separate layer with platform-specific setup. This first version focuses on one task: put a user decision in front of recognizable network-capable commands.

## Development

```sh
npm ci --ignore-scripts
npm run check
```

Tests exercise detection, approval scope, cancellation, session reset, concurrent calls and failure behavior without making network requests or running the example commands. The package includes TypeScript source that pi loads directly; there is no build step.

The development host currently pins an older `undici`; the root override selects a patched release for local development. It does not update a user's separately installed pi host.
