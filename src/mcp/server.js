#!/usr/bin/env node
// MCP server entry: stdio transport, registers optimize_prompt tool.
// Launched by AI IDEs (Cursor, Claude Desktop, Windsurf) via node/npx.
// IMPORTANT: never use console.log here — stdout is the JSON-RPC channel.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';

const server = new McpServer({
  name: 'optimize-prompt-mcp',
  version: '0.1.0',
});

registerTools(server);

await server.connect(new StdioServerTransport());
