# foreshadow-mcp

A stdio MCP server that proxies to a Foreshadow deployment. Most clients can use the remote
endpoint directly (`https://<your-host>/api/mcp`); this wrapper is for stdio-only clients.

```json
{
  "mcpServers": {
    "foreshadow": {
      "command": "npx",
      "args": ["-y", "foreshadow-mcp"],
      "env": { "FORESHADOW_URL": "https://foreshadow.app" }
    }
  }
}
```

Tools: `foreshadow_score`, `foreshadow_radar`, `foreshadow_history`.
