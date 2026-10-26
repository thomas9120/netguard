// These are deliberately conservative text heuristics, not a shell parser.
// Scan the entire command to include pipelines, nested shells and inline scripts.
const rules: ReadonlyArray<readonly [string, RegExp]> = [
  ["URL in command", /\b(?:https?|ftps?|sftp|ssh|git|wss?|gopher):\/\//i],
  ["network or file-transfer utility", /\b(?:curl|wget|wget2|http|https|xh|aria2c|ssh|scp|sftp|rsync|nc|ncat|netcat|socat|telnet|ftp|lftp|tftp|ping|ping6|traceroute|tracepath)\b/i],
  ["DNS lookup utility", /\b(?:dig|nslookup|host|Resolve-DnsName)\b/i],
  ["PowerShell network command", /\b(?:Invoke-WebRequest|Invoke-RestMethod|iwr|irm|Start-BitsTransfer|Test-NetConnection|Send-MailMessage)\b/i],
  ["cloud or remote-storage CLI", /\b(?:aws|az|gcloud|gsutil|rclone|ossutil(?:64)?|aliyun|coscli)\b/i],
  ["Git network operation", /\bgit\b[^\r\n]*\b(?:clone|fetch|pull|push|ls-remote|submodule|remote\s+update)\b/i],
  ["package download or publishing", /\b(?:npm|pnpm|yarn|bun|pip3?|uv|poetry|cargo|gem|composer|dotnet|nuget)\b[^\r\n]*\b(?:install|i|add|ci|update|upgrade|sync|download|publish|push|restore|audit|outdated|search|view|info|dlx|x)\b|\bnpx\b|\bgo\s+(?:get|install|mod\s+(?:download|tidy))\b/i],
  ["shell network device", /\/dev\/(?:tcp|udp)\//i],
  ["networking code or API", /\b(?:requests|urllib|httpx|aiohttp|socket|smtplib|ftplib|reqwest|TcpClient|UdpClient|WebClient|HttpClient|WebRequest)\b|\b(?:fetch|axios|XMLHttpRequest|WebSocket)\s*\(|\b(?:https?|net|tls|dgram)\s*\.\s*(?:request|get|connect|createConnection|createSocket)\s*\(|\bnet\/http\b|\bopenssl\s+s_client\b/i],
];

export function detectNetwork(command: string): string[] {
  // Join common Bash and PowerShell line continuations before matching.
  const text = command.replace(/(?:\\|`)\r?\n/g, "");
  return rules.filter(([, pattern]) => pattern.test(text)).map(([reason]) => reason);
}

// Make terminal controls and bidi overrides visible instead of rendering them.
export function displayCommand(command: string): string {
  return command.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, (character) =>
    `\\u{${character.codePointAt(0)!.toString(16)}}`,
  );
}
