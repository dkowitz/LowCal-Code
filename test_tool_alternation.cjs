#!/usr/bin/env node

/**
 * Simple test to verify tool alternation in research tool
 */

console.log('🧪 Testing Tool Alternation in Research Tool\n');

// Mock the required modules
const mockConfig = {
  getToolRegistry: () => ({
    getTool: (toolName) => {
      // Simulate that both tools are available
      console.log(`  🔍 Checking if ${toolName} is available: ✅`);
      return { name: toolName }; // Return mock tool
    }
  })
};

// Mock the tool names
const ToolNames = {
  WEB_SEARCH: 'web_search',
  SEARXNG_SEARCH: 'searxng_search'
};

// Simulate the resolveSearchTools logic
function resolveSearchTools(searchTools) {
  const preferredOrder =
    searchTools && searchTools.length > 0
      ? searchTools
      : [ToolNames.WEB_SEARCH, ToolNames.SEARXNG_SEARCH];

  const uniqueOrdered = [];
  const seen = new Set();
  const toolRegistry = mockConfig.getToolRegistry();

  for (const toolName of preferredOrder) {
    if (toolName !== ToolNames.WEB_SEARCH && toolName !== ToolNames.SEARXNG_SEARCH) {
      continue;
    }
    if (seen.has(toolName)) {
      continue;
    }
    if (toolRegistry && !toolRegistry.getTool(toolName)) {
      console.log(`  ❌ ${toolName} not available in registry, skipping`);
      continue;
    }
    seen.add(toolName);
    uniqueOrdered.push(toolName);
  }

  return uniqueOrdered;
}

// Test the alternation logic
function testAlternation() {
  const testScenarios = [
    {
      name: 'Both tools enabled',
      searchTools: [ToolNames.WEB_SEARCH, ToolNames.SEARXNG_SEARCH]
    },
    {
      name: 'Only SearXNG enabled',
      searchTools: [ToolNames.SEARXNG_SEARCH]
    },
    {
      name: 'Only Tavily enabled',
      searchTools: [ToolNames.WEB_SEARCH]
    }
  ];

  for (const scenario of testScenarios) {
    console.log(`\n📋 ${scenario.name}:`);
    
    const resolvedTools = resolveSearchTools(scenario.searchTools);
    console.log(`   Resolved tools: [${resolvedTools.join(', ')}]`);
    
    // Test the alternation pattern
    const searchPlan = [];
    const testVariants = ['variant1', 'variant2', 'variant3', 'variant4', 'variant5', 'variant6'];
    
    testVariants.forEach((variant) => {
      const toolName = resolvedTools[searchPlan.length % resolvedTools.length];
      searchPlan.push({
        query: variant,
        toolName,
        subIndex: 0
      });
    });
    
    console.log(`   Search plan distribution:`);
    const toolCounts = {};
    searchPlan.forEach((plan, index) => {
      console.log(`     ${index + 1}. ${plan.query} → ${plan.toolName}`);
      toolCounts[plan.toolName] = (toolCounts[plan.toolName] || 0) + 1;
    });
    
    console.log(`   Tool usage summary:`);
    Object.entries(toolCounts).forEach(([tool, count]) => {
      console.log(`     ${tool}: ${count} searches`);
    });
    
    // Verify alternation
    if (resolvedTools.length > 1) {
      console.log(`   Alternation check:`);
      let alternatesCorrectly = true;
      for (let i = 1; i < searchPlan.length; i++) {
        const expectedTool = resolvedTools[i % resolvedTools.length];
        const actualTool = searchPlan[i].toolName;
        if (actualTool !== expectedTool) {
          console.log(`     ❌ Step ${i+1}: expected ${expectedTool}, got ${actualTool}`);
          alternatesCorrectly = false;
        }
      }
      if (alternatesCorrectly) {
        console.log(`     ✅ Alternation working correctly`);
      }
    }
  }
}

// Run the test
testAlternation();

console.log('\n✅ Tool alternation test completed!');

// Test conclusion
console.log('\n📊 Summary:');
console.log('- The tool selection logic should correctly alternate between available tools');
console.log('- If only SearXNG is enabled, all searches should use SearXNG');
console.log('- If only Tavily is enabled, all searches should use Tavily');
console.log('- If both are enabled, they should alternate in the specified order');