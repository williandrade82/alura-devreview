#!/usr/bin/env node
// DevReview MCP Server: tools de regras de review, ADRs, métricas e registro de revisões.
// No STDIO, stdout é o canal JSON-RPC: logs vão sempre para stderr.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadEnv } from "./lib/env.js";
import { registerGetReviewRules } from "./tools/get-review-rules.js";
import { registerAdrTools } from "./tools/adr.js";
import { registerMetricsTools } from "./tools/metrics.js";
import { registerRecordReview } from "./tools/record-review.js";
import { registerKeywordTools } from "./tools/keywords.js";
import { registerGithubPrTools } from "./tools/github-pr.js";
import { registerRecommendationTools } from "./tools/recommendations.js";
import { registerReviewPrompt } from "./prompts/review-pull-request.js";
import { SERVER_INSTRUCTIONS } from "./lib/security-prompt.js";

async function main(): Promise<void> {
  loadEnv();

  const server = new McpServer(
    { name: "devreview", version: "1.0.0" },
    { instructions: SERVER_INSTRUCTIONS }
  );
  registerReviewPrompt(server);

  registerGetReviewRules(server);
  registerAdrTools(server);
  registerMetricsTools(server);
  registerKeywordTools(server);
  registerGithubPrTools(server);
  registerRecordReview(server);
  registerRecommendationTools(server);

  await server.connect(new StdioServerTransport());
  console.error("DevReview MCP server rodando via stdio");
}

main().catch((error: unknown) => {
  console.error("Falha ao iniciar o DevReview MCP server:", error);
  process.exit(1);
});
