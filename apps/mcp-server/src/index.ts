#!/usr/bin/env node
// DevReview MCP Server — Módulo 1: server mínimo com tool mockada.
// No STDIO, stdout é o canal JSON-RPC: logs vão sempre para stderr.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerGetReviewRules } from "./tools/get-review-rules.js";

async function main(): Promise<void> {
  const server = new McpServer({ name: "devreview", version: "1.0.0" });

  registerGetReviewRules(server);

  await server.connect(new StdioServerTransport());
  console.error("DevReview MCP server rodando via stdio");
}

main().catch((error: unknown) => {
  console.error("Falha ao iniciar o DevReview MCP server:", error);
  process.exit(1);
});
