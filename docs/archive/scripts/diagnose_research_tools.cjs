#!/usr/bin/env node

/**
 * Diagnostic script to test research tool detection and selection
 */

const {
  ResearchTool,
  ToolNames,
} = require("./packages/core/dist/src/tools/research.js");
const { Config } = require("./packages/core/dist/src/config/config.js");

async function diagnoseResearchTools() {
  console.log("🔍 Diagnosing Research Tool Detection and Selection\n");

  try {
    const config = new Config();
    const toolRegistry = config.getToolRegistry?.();

    if (!toolRegistry) {
      console.log("❌ Tool registry not available");
      return;
    }

    console.log("📋 Tool Registry Status:");
    console.log(
      `  WEB_SEARCH available: ${toolRegistry.getTool(ToolNames.WEB_SEARCH) ? "✅" : "❌"}`,
    );
    console.log(
      `  SEARXNG_SEARCH available: ${toolRegistry.getTool(ToolNames.SEARXNG_SEARCH) ? "✅" : "❌"}`,
    );
    console.log(
      `  WEB_FETCH available: ${toolRegistry.getTool(ToolNames.WEB_FETCH) ? "✅" : "❌"}`,
    );

    // Test research tool with different configurations
    console.log("\n🧪 Testing Research Tool Configurations:");

    const testConfigs = [
      {
        name: "Both tools enabled",
        searchTools: [ToolNames.WEB_SEARCH, ToolNames.SEARXNG_SEARCH],
      },
      {
        name: "Only SearXNG",
        searchTools: [ToolNames.SEARXNG_SEARCH],
      },
      {
        name: "Only Tavily",
        searchTools: [ToolNames.WEB_SEARCH],
      },
      {
        name: "Default (no tools specified)",
        searchTools: undefined,
      },
    ];

    for (const testConfig of testConfigs) {
      console.log(`\n  📖 ${testConfig.name}:`);

      try {
        const researchTool = new ResearchTool(config);
        const invocation = researchTool.build({
          query: "test diagnostic query",
          mode: "balanced",
          searchTools: testConfig.searchTools,
        });

        // Test the resolveSearchTools method
        const resolvedTools = invocation.resolveSearchTools();
        console.log(`    Resolved tools: [${resolvedTools.join(", ")}]`);

        // Test the search plan generation
        const searchPlan = [];
        const testVariants = ["variant1", "variant2", "variant3", "variant4"];

        testVariants.forEach((variant) => {
          const toolName =
            resolvedTools[searchPlan.length % resolvedTools.length];
          searchPlan.push({
            query: variant,
            toolName,
            subIndex: 0,
          });
        });

        console.log(`    Search plan distribution:`);
        const toolCounts = {};
        searchPlan.forEach((plan, index) => {
          console.log(`      ${index + 1}. ${plan.query} → ${plan.toolName}`);
          toolCounts[plan.toolName] = (toolCounts[plan.toolName] || 0) + 1;
        });

        console.log(`    Tool usage summary:`);
        Object.entries(toolCounts).forEach(([tool, count]) => {
          console.log(`      ${tool}: ${count} searches`);
        });
      } catch (error) {
        console.log(`    ❌ Error: ${error.message}`);
      }
    }

    console.log("\n✅ Diagnostic completed successfully!");
  } catch (error) {
    console.error("❌ Error during diagnostic:", error.message);
    console.error(error.stack);
  }
}

// Run the diagnostic
if (require.main === module) {
  diagnoseResearchTools().catch(console.error);
}

module.exports = { diagnoseResearchTools };
