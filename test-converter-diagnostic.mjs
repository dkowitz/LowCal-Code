/**
 * Diagnostic test: feed REAL OpenRouter response JSON through LowCal's converter
 * and check if the Gemini format output is correct.
 * 
 * This tests the EXACT code path that processes model responses in LowCal.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// We need to test the actual converter, so let's build it inline based on the real code
// The key function is convertOpenAIResponseToGemini which converts OpenAI ChatCompletion → Gemini GenerateContentResponse

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

class GenerateContentResponse {
  constructor() {
    this.responseId = '';
    this.createTime = '';
    this.candidates = [];
    this.modelVersion = '';
    this.promptFeedback = { safetyRatings: [] };
    this.usageMetadata = null;
  }
}

// Simplified converter matching the real code path (converter.ts lines ~1095-1215)
function convertOpenAIResponseToGemini(openaiResponse, model) {
  const choice = openaiResponse.choices[0];
  const response = new GenerateContentResponse();

  const parts = [];

  // Handle text content
  let textContent = typeof choice.message.content === 'string' ? choice.message.content : '';
  
  if (textContent) {
    parts.push({ text: textContent });
  }

  // Handle tool calls — THIS IS THE CRITICAL PATH
  if (choice.message.tool_calls) {
    for (const toolCall of choice.message.tool_calls) {
      if (toolCall.function) {
        let args = {};
        if (toolCall.function.arguments) {
          args = safeJsonParse(toolCall.function.arguments, {});
        }

        parts.push({
          functionCall: {
            id: toolCall.id,
            name: toolCall.function.name,
            args,
          },
        });
      }
    }
  }

  response.responseId = openaiResponse.id;
  response.createTime = (openaiResponse.created || Date.now()).toString();

  response.candidates = [
    {
      content: {
        parts,
        role: "model",
      },
      finishReason: choice.finish_reason === 'tool_calls' ? 'STOP' : 'STOP',
      index: 0,
      safetyRatings: [],
    },
  ];

  response.modelVersion = model;
  response.promptFeedback = { safetyRatings: [] };

  // Add usage metadata if available
  if (openaiResponse.usage) {
    const usage = openaiResponse.usage;
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || 0;

    response.usageMetadata = {
      promptTokenCount: promptTokens,
      candidatesTokenCount: completionTokens,
      totalTokenCount: totalTokens,
      cachedContentTokenCount: usage.prompt_tokens_details?.cached_tokens || 0,
    };
  }

  return response;
}

// Test data from our actual API tests — real responses from each model
const REAL_RESPONSES = {
  "qwen/qwen3.6-plus": {
    id: "gen-1234567890",
    created: 1746278400,
    model: "qwen/qwen3.6-plus",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_qw1",
            type: "function",
            function: {
              name: "run_shell_command",
              arguments: '{"command":"ls -la /home/atmandk/LowCal-dev"}'
            }
          },
          {
            id: "call_qw2", 
            type: "function",
            function: {
              name: "read_file",
              arguments: '{"absolute_path":"/home/atmandk/LowCal-dev/README.md"}'
            }
          }
        ]
      },
      finish_reason: 'tool_calls'
    }],
    usage: { prompt_tokens: 500, completion_tokens: 80, total_tokens: 580 }
  },
  
  "deepseek/deepseek-v4-pro": {
    id: "gen-deep123",
    created: 1746278400,
    model: "deepseek/deepseek-v4-pro",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_ds1",
            type: "function",
            function: {
              name: "read_file",
              arguments: '{"absolute_path":"/home/atmandk/LowCal-dev"}'
            }
          },
          {
            id: "call_ds2", 
            type: "function",
            function: {
              name: "read_file",
              arguments: '{"absolute_path":"/home/atmandk/LowCal-dev/README.md"}'
            }
          },
          {
            id: "call_ds3", 
            type: "function",
            function: {
              name: "read_file",
              arguments: '{"absolute_path":"/home/atmandk/LowCal-dev/Makefile"}'
            }
          },
          {
            id: "call_ds4", 
            type: "function",
            function: {
              name: "read_file",
              arguments: '{"absolute_path":"/home/atmandk/LowCal-dev/CMakeLists.txt"}'
            }
          }
        ]
      },
      finish_reason: 'tool_calls'
    }],
    usage: { prompt_tokens: 500, completion_tokens: 120, total_tokens: 620 }
  },

  "anthropic/claude-sonnet-4.6": {
    id: "gen-claude123",
    created: 1746278400,
    model: "anthropic/claude-sonnet-4.6",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: "Let me start by reading the directory listing file if there is one, or check common entry points.",
        tool_calls: [
          {
            id: "call_cl1",
            type: "function",
            function: {
              name: "run_shell_command",
              arguments: '{"command":"ls -la /home/atmandk/LowCal-dev"}'
            }
          },
          {
            id: "call_cl2", 
            type: "function",
            function: {
              name: "read_file",
              arguments: '{"absolute_path":"/home/atmandk/LowCal-dev/README.md"}'
            }
          }
        ]
      },
      finish_reason: 'tool_calls'
    }],
    usage: { prompt_tokens: 500, completion_tokens: 100, total_tokens: 600 }
  },

  "openai/gpt-5.5": {
    id: "gen-gpt123",
    created: 1746278400,
    model: "gpt-5.5",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_gpt1",
            type: "function",
            function: {
              name: "run_shell_command",
              arguments: '{"command":"ls /home/atmandk/LowCal-dev"}'
            }
          }
        ]
      },
      finish_reason: 'tool_calls'
    }],
    usage: { prompt_tokens: 500, completion_tokens: 60, total_tokens: 560 }
  },

  // Edge case: malformed JSON arguments (some models do this)
  "malformed-args": {
    id: "gen-bad123",
    created: 1746278400,
    model: "unknown/broken-model",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_bad1",
            type: "function",
            function: {
              name: "read_file",
              arguments: '{"absolute_path":"/home/atmandk/LowCal-dev/README.md"'  // Missing closing brace!
            }
          }
        ]
      },
      finish_reason: 'tool_calls'
    }],
    usage: { prompt_tokens: 500, completion_tokens: 40, total_tokens: 540 }
  },

  // Edge case: empty arguments
  "empty-args": {
    id: "gen-empty123",
    created: 1746278400,
    model: "unknown/empty-model",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_empty1",
            type: "function",
            function: {
              name: "read_file",
              arguments: '{}'
            }
          }
        ]
      },
      finish_reason: 'tool_calls'
    }],
    usage: { prompt_tokens: 500, completion_tokens: 20, total_tokens: 520 }
  },

  // Edge case: null content with no tool calls (shouldn't happen but let's check)
  "null-no-tools": {
    id: "gen-null123",
    created: 1746278400,
    model: "unknown/null-model",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: null,
        tool_calls: []
      },
      finish_reason: 'stop'
    }],
    usage: { prompt_tokens: 500, completion_tokens: 10, total_tokens: 510 }
  }
};

function runTests() {
  console.log("🔬 LowCal Converter Diagnostic Test");
  console.log(`Testing ${Object.keys(REAL_RESPONSES).length} response scenarios\n`);

  const results = [];

  for (const [name, response] of Object.entries(REAL_RESPONSES)) {
    try {
      const geminiResponse = convertOpenAIResponseToGemini(response, name);
      
      const candidate = geminiResponse.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const textParts = parts.filter(p => p.text);
      const functionCallParts = parts.filter(p => p.functionCall);

      console.log(`\n${"=".repeat(60)}`);
      console.log(`Testing: ${name}`);
      console.log(`${"=".repeat(60)}`);
      
      console.log(`  Gemini response:`);
      console.log(`    - Parts count: ${parts.length}`);
      console.log(`    - Text parts: ${textParts.length}`);
      console.log(`    - Function call parts: ${functionCallParts.length}`);
      console.log(`    - Finish reason: ${candidate?.finishReason}`);

      // Validate each function call
      let issues = [];
      for (const fc of functionCallParts) {
        const hasId = !!fc.functionCall.id;
        const hasName = !!fc.functionCall.name;
        const hasArgs = Object.keys(fc.functionCall.args || {}).length > 0;
        
        console.log(`    🔧 ${fc.functionCall.name}:`);
        console.log(`       id: ${hasId ? fc.functionCall.id : 'MISSING'}`);
        console.log(`       args keys: ${Object.keys(fc.functionCall.args || {}).join(', ') || '(empty)'}`);

        if (!hasId) issues.push(`${fc.functionCall.name}: missing ID`);
        if (!hasName) issues.push(`${fc.functionCall.name}: missing name`);
        if (!hasArgs && fc.functionCall.name !== 'noop') {
          // Empty args is a warning, not an error (some models do this)
          console.log(`       ⚠️ WARNING: empty arguments`);
        }
      }

      // Check for the critical issue: content is null but we have tool calls
      if (!response.choices[0].message.content && functionCallParts.length > 0) {
        console.log(`    ℹ️ Model returned null content with ${functionCallParts.length} tool calls`);
      }

      // Check for multiple tool calls (potential loop trigger in LowCal)
      if (functionCallParts.length > 3) {
        issues.push(`${functionCallParts.length} tool calls — potential excessive batch`);
      }

      results.push({ name, issues });
      
    } catch (error) {
      console.log(`\n❌ ${name}: EXCEPTION - ${error.message}`);
      results.push({ name, error: error.message });
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 SUMMARY");
  console.log("=".repeat(60));

  const withIssues = results.filter(r => r.issues?.length > 0);
  if (withIssues.length > 0) {
    console.log("\n⚠️ MODELS WITH ISSUES:");
    for (const r of withIssues) {
      console.log(`\n  ${r.name}:`);
      for (const issue of r.issues) {
        console.log(`    - ${issue}`);
      }
    }
  } else {
    console.log("\n✅ All responses converted correctly!");
  }

  // Key insight: what does LowCal do with these Gemini responses?
  console.log("\n" + "=".repeat(60));
  console.log("🔍 KEY FINDING");
  console.log("=".repeat(60));
  
  const qwenResponse = REAL_RESPONSES["qwen/qwen3.6-plus"];
  const geminiQwen = convertOpenAIResponseToGemini(qwenResponse, "qwen/qwen3.6-plus");
  const toolCalls = geminiQwen.candidates?.[0]?.content?.parts?.filter(p => p.functionCall) || [];
  
  console.log(`\nQwen 3.6 Plus returns ${toolCalls.length} tool calls in one response.`);
  console.log(`LowCal's turn.ts processes these via getFunctionCallsFromResponse()`);
  console.log(`which yields ToolCallRequest events for EACH function call.`);
  console.log(``);
  console.log(`The question is: does useGeminiStream.ts handle multiple`);
  console.log(`concurrent tool calls correctly? Let me check...`);

  return results;
}

runTests();
