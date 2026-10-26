// These are deliberately conservative text heuristics, not a shell parser.
// Scan the entire command to include pipelines, nested shells and inline scripts.

// Where a command name can start: line and pipeline starts, subshells, a shell's
// script argument (`bash -c '...'`) and common wrappers (`sudo`, `xargs`, `find -exec`).
const START = String.raw`(?:^|[\r\n;&|({\x60]|\$\(|\b(?:ba|z|da|k)?sh\s+(?:[-/]\S+\s+)*|\b(?:cmd|pwsh|powershell)(?:\.exe)?\s+(?:[-/]\S+\s+)*|(?<![\w-])(?:sudo|env|exec|xargs|time|timeout|nohup|nice|watch|command|then|do|else|-exec)(?:\s+(?:-\S*|\d\S*|[a-z_]\w*=\S*))*\s)\s*['"]?(?:[^\s'";&|()]*[\\/])?`;
// Options between a tool and its subcommand, such as `npm --prefix dir install`.
// Each token must have exactly one parse, or long commands backtrack exponentially.
const OPTIONS = String.raw`(?:\s+--?\w[\w-]*(?:[=\s][^\s;&|-]\S*)?)*`;

// Distinctive names match anywhere they appear as a word, including paths to the executable.
const word = (names: string) => new RegExp(String.raw`(?<![\w.-])(?:${names})(?![\w-])`, "i");
// Names that are also common words (`host`, `http`, `az`) match only in command position.
const command = (names: string) => new RegExp(String.raw`${START}(?:${names})(?:\.exe)?(?=$|[\s;&|)'"])`, "i");
const subcommand = (tools: string, verbs: string) =>
  new RegExp(String.raw`(?<![\w.-])(?:${tools})(?:\.(?:exe|cmd))?['"]?${OPTIONS}\s+(?:${verbs})(?![\w-])`, "i");

const PACKAGE_VERBS = "install|add|update|upgrade|sync|lock|download|fetch|publish|push|restore|audit|outdated|search|info|login|require|create-project|create|cache|self\\s+update|python\\s+install|tool\\s+(?:install|run|update|upgrade|restore)";
const CODE_LIBRARIES = "requests|urllib\\d?|httpx|aiohttp|socket|smtplib|ftplib|telnetlib|paramiko|http\\.client|axios|undici|reqwest";
const JS_NETWORK_MODULES = "https?|http2|net|tls|dgram|ws|node-fetch";

const URL_REASON = "URL in command";
const rules: ReadonlyArray<readonly [string, ...RegExp[]]> = [
  [URL_REASON,/\b(?:https?|ftps?|sftp|ssh|git|wss?|gopher|s3|gs|smb|rsync|scp):\/\//i],
  ["network or file-transfer utility",
    word("curl|wget2?|xh|aria2c|ssh|ssh-copy-id|scp|sftp|rsync|ncat|netcat|socat|telnet|lftp|tftp|ping6|traceroute|tracepath|nmap|mosh"),
    command("http|https|nc|ftp|ping")],
  ["DNS lookup utility", word("nslookup|Resolve-DnsName"), command("dig|host")],
  ["PowerShell or Windows network command",
    word("Invoke-WebRequest|Invoke-RestMethod|iwr|irm|Start-BitsTransfer|Test-NetConnection|Test-Connection|Send-MailMessage|Enter-PSSession|New-PSSession|New-CimSession|bitsadmin"),
    /(?<![\w-])-(?:ComputerName|ToSession|FromSession)(?![\w-])/i,
    /\bcertutil\b[^\r\n]*\s[-/](?:urlcache|verifyctl)\b/i],
  ["Windows network share path", /(?<![^\s'"=(,;|&<>])\\\\(?!wsl(?:\.localhost|\$)\\)\w[\w.-]*\\[\w$]/i],
  ["cloud, cluster or code-hosting CLI",
    word("gcloud|gsutil|rclone|ossutil(?:64)?|aliyun|coscli|azcopy|s3cmd|kubectl|huggingface-cli|glab"),
    command("aws|az|gh|hf|helm")],
  ["Git network operation",
    /(?<![\w.-])git(?:\.exe)?['"]?(?:\s+(?:-[Cc]\s+[^\s-]\S*|--?\w[\w-]*(?:=\S+)?))*\s+(?:clone|fetch|pull|push|ls-remote|submodule|remote\s+update|send-email|request-pull|svn|p4|lfs|archive\b[^\r\n;&|]*--remote)(?![\w-])/i],
  ["package download or publishing",
    subcommand("npm|pnpm|yarn|bun", `${PACKAGE_VERBS}|i|ci|up|view|dlx|x|exec|init\\s+(?!-)\\S+`),
    subcommand("pip3?|uv|poetry|pdm|pipenv|cargo|gem|bundle|composer|dotnet|nuget|deno|conda|mamba|micromamba|brew|apt|apt-get|dnf|yum|zypper|apk|winget|choco|scoop|snap|flatpak", PACKAGE_VERBS),
    word("npx|pnpx|bunx|uvx|pipx"),
    /(?<![\w.-])yarn(?=\s*(?:$|[;&|)]))/i,
    /(?<![\w.-])pacman\s+-S/i,
    /\bgo\s+(?:get|install|mod\s+(?:download|tidy))\b/i],
  ["container or model registry operation",
    subcommand("docker-compose|podman-compose|docker|podman|nerdctl|ollama",
      `pull|push|login|run|build|create|search|up|compose${OPTIONS}\\s+(?:up|pull|push|build|run|create)|buildx\\s+build|image\\s+(?:pull|push)|manifest\\s+push`)],
  ["shell network device", /\/dev\/(?:tcp|udp)\//i],
  ["networking code or API",
    new RegExp(String.raw`\b(?:import|from)\s+['"]?(?:node:)?(?:${CODE_LIBRARIES}|${JS_NETWORK_MODULES})\b`, "i"),
    new RegExp(String.raw`\b(?:require|import)\s*\(\s*['"](?:node:)?(?:${CODE_LIBRARIES}|${JS_NETWORK_MODULES})['"]`, "i"),
    new RegExp(String.raw`\b(?:${CODE_LIBRARIES})(?:\s*(?:\.|::)\s*\w+)+\s*\(`, "i"),
    /\b(?:fetch|axios|XMLHttpRequest|WebSocket)\s*\(|\b(?:https?|http2|net|tls|dgram)\s*\.\s*(?:request|get|connect|createConnection|createSocket)\s*\(/i,
    /\bNet\.(?:\w+\.)*(?:TcpClient|UdpClient|WebClient|HttpClient|WebRequest|HttpWebRequest|Dns|Sockets)\b|\bnew\s+(?:TcpClient|UdpClient|WebClient|HttpClient)\s*\(/i,
    /\bhttp\.server\b|\bnet\/http\b|\bopenssl\s+s_client\b/i],
];

// Join common Bash and PowerShell line continuations before matching.
const joinContinuations = (command: string) => command.replace(/(?:\\|`)\r?\n/g, "");

export function detectNetwork(command: string): string[] {
  const text = joinContinuations(command);
  return rules.filter(([, ...patterns]) => patterns.some((pattern) => pattern.test(text))).map(([reason]) => reason);
}

// Scripts the agent writes are only visible to later shell commands by name, so remember
// which ones contain network-capable code. Bare URLs are common in configs and docs; skip them.
const SCRIPT_FILE = /^(?:[^.]+|.+\.(?:py|pyw|js|mjs|cjs|ts|mts|cts|sh|bash|zsh|ps1|psm1|rb|pl|php|lua|r|bat|cmd))$/i;

export function scriptName(path: string): string | undefined {
  const name = path.split(/[\\/]/).pop();
  return name && SCRIPT_FILE.test(name) ? name : undefined;
}

export function detectNetworkInScript(content: string): string[] {
  return detectNetwork(content).filter((reason) => reason !== URL_REASON);
}

// Interpreters that take a script path among their arguments. The scan is bounded to keep
// long commands linear.
const RUNNERS = String.raw`(?<![\w.-])(?:python[\d.]*|py|node|deno|bun|tsx|ts-node|bash|sh|zsh|pwsh|powershell|ruby|perl|php|lua|Rscript|source|\.|uv\s+run|go\s+run)(?:\.exe)?\s[^\r\n;&|]{0,512}?`;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whether a command runs the named script through an interpreter or as a path (`./upload.sh`),
// as opposed to merely mentioning it (`git add upload.sh`).
export function runsScript(command: string, name: string): boolean {
  return new RegExp(String.raw`(?:${RUNNERS}|${START})(?<![\w.-])${escapeRegExp(name)}(?![\w.-])`, "i").test(joinContinuations(command));
}

// Make terminal controls and bidi overrides visible instead of rendering them.
export function displayCommand(command: string): string {
  return command.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, (character) =>
    `\\u{${character.codePointAt(0)!.toString(16)}}`,
  );
}
