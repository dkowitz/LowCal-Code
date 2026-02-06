#!/usr/bin/env node

/**
 * Test script to verify tool selection behavior
 */

const { ResearchTool } = require("./packages/core/dist/src/tools/research.js");
const { Config } = require("./packages/core/dist/src/config/config.js");
const { ToolNames } = require("./packages/core/dist/src/tools/tool-names.js");

async function testToolSelection() {
  console.log("🧪 Testing Research Tool Selection\n");

  try {
    // Create a mock config
    const config = new Config();

    // Test with both tools specified
    console.log("📋 Test 1: Both tools specified");
    const tool1 = new ResearchTool(config);
    const invocation1 = tool1.build({
      query: "test query",
      mode: "balanced",
      searchTools: [ToolNames.WEB_SEARCH, ToolNames.SEARXNG_SEARCH],
    });

    // Access the internal resolveSearchTools method
    const resolvedTools1 = invocation1.resolveSearchTools();
    console.log(`   Resolved tools: ${resolvedTools1.join(", ")}`);

    // Test the alternating pattern
    const searchPlan1 = [];
    const variants = ["query1", "query2", "query3", "query4"];

    variants.forEach((variant) => {
      const toolName =
        resolvedTools1[searchPlan1.length % resolvedTools1.length];
      searchPlan1.push({
        query: variant,
        toolName,
        subIndex: 0,
      });
    });

    console.log(`   Alternating pattern:`);
    searchPlan1.forEach((plan, index) => {
      console.log(`     ${index + 1}. ${plan.query} → ${plan.toolName}`);
    });

    // Test with only SearXNG
    console.log("\n📋 Test 2: Only SearXNG specified");
    const tool2 = new ResearchTool(config);
    const invocation2 = tool2.build({
      query: "test query",
      mode: "balanced",
      searchTools: [ToolNames.SEARXNG_SEARCH],
    });

    const resolvedTools2 = invocation2.resolveSearchTools();
    console.log(`   Resolved tools: ${resolvedTools2.join(", ")}`);

    // Test with only Tavily
    console.log("\n📋 Test 3: Only Tavily specified");
    const tool3 = new ResearchTool(config);
    const invocation3 = tool3.build({
      query: "test query",
      mode: "balanced",
      searchTools: [ToolNames.WEB_SEARCH],
    });

    const resolvedTools3 = invocation3.resolveSearchTools();
    console.log(`   Resolved tools: ${resolvedTools3.join(", ")}`);

    // Test with default (no tools specified)
    console.log("\n📋 Test 4: Default (no tools specified)");
    const tool4 = new ResearchTool(config);
    const invocation4 = tool4.build({
      query: "test query",
      mode: "balanced",
      // searchTools not specified
    });

    const resolvedTools4 = invocation4.resolveSearchTools();
    console.log(`   Resolved tools: ${resolvedTools4.join(", ")}`);

    console.log("\n✅ Tool selection tests completed successfully!");
  } catch (error) {
    console.error("❌ Error during testing:", error.message);
    console.error(error.stack);
  }
}

// Run the test
if (require.main === module) {
  testToolSelection().catch(console.error);
}

module.exports = { testToolSelection };
