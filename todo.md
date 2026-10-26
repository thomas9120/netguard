# Todo

## Guard MCP and custom tools that take URLs

pi routes MCP tool calls (`mcp__<server>__<tool>`) and other extensions' tools through the same `tool_call` hook, but netguard only inspects `bash` and `powershell`. An MCP fetch or browser tool called with `https://example.invalid/?data=...` passes without a prompt.

Lightest version: for tools other than pi's built-ins, prompt when any string argument (searched recursively) contains a URL. Reuse the existing dialog, queue and exact-input session approvals, keyed by tool name and serialized input.

Open question: fetch and browser MCP servers would prompt on every distinct URL. Decide whether that friction is acceptable or whether session approval should cover a tool's host instead of its exact input.

## Follow-ups from the review

- Prompt on encoded commands that cannot be reviewed: `-EncodedCommand`/`-enc`, `base64 -d | sh`, `FromBase64String` with `iex`.
- Tell the model in the block reason not to rephrase the command to avoid detection.
- Show the session-approval count in the status bar.
- Label dialogs for calls issued by a codemode script (`event.parentToolCallId`).
