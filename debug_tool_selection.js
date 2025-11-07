#!/usr/bin/env node

/**
 * Debug script to test tool selection behavior in research command
 */

const { ResearchTool, ToolNames } = require('./packages/core/dist/src/tools/research.js');
const { Config } = require('./packages/core/dist/src/config/config.js');

async function debugToolSelection() {
  console.log('🔍 Debugging Research Tool Selection\n');
  
  // Test different scenarios
  const scenarios = [
    {
      name: 'Both tools enabled',
      searchTools: [ToolNames.WEB_SEARCH, ToolNames.SEARXNG_SEARCH],
      expected: 'Should alternate between Tavily and SearXNG'
    },
    {
      name: 'Only Tavily enabled',
      searchTools: [ToolNames.WEB_SEARCH],
      expected: 'Should use only Tavily'
    },
    {
      name: 'Only SearXNG enabled',
      searchTools: [ToolNames.SEARXNG_SEARCH],
      expected: 'Should use only SearXNG'
    },
    {
      name: 'No tools specified (default)',
      searchTools: undefined,
      expected: 'Should use default order [Tavily, SearXNG]'
    }
  ];
  
  for (const scenario of scenarios) {
    console.log(`\n📋 Scenario: ${scenario.name}`);
    console.log(`   Tools: ${scenario.searchTools?.join(', ') || 'undefined (default)'}`);
    console.log(`   Expected: ${scenario.expected}`);
    
    try {
      // Create a mock config
      const config = new Config();
      
      // Create research tool with the scenario
      const tool = new ResearchTool(config);
      const invocation = tool.build({
        query: 'test query for debugging',
        mode: 'balanced',
        searchTools: scenario.searchTools
      });
      
      // Access the internal resolveSearchTools method for testing
      if (invocation.resolveSearchTools) {
        const resolvedTools = invocation.resolveSearchTools();
        console.log(`   Resolved tools: ${resolvedTools.join(', ')}`);
        
        // Test the alternating logic
        const searchPlan = [];
        const variants = ['query1', 'query2', 'query3', 'query4'];
        
        variants.forEach((variant, index) => {
          const toolName = resolvedTools[searchPlan.length % resolvedTools.length];
          searchPlan.push({
            query: variant,
            toolName,
            subIndex: 0
          });
        });
        
        console.log(`   Alternating pattern:`);
        searchPlan.forEach((plan, index) => {
          console.log(`     ${index + 1}. ${plan.query} → ${plan.toolName}`);
        });
      } else {
        console.log(`   ❌ resolveSearchTools method not accessible`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
}

// Run the debug script
if (require.main === module) {
  debugToolSelection().catch(console.error);
}

module.exports = { debugToolSelection };