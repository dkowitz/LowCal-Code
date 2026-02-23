/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Mock } from "vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useReactToolScheduler,
  mapToDisplay,
} from "./useReactToolScheduler.js";
import type { Part, FunctionResponse } from "@google/genai";
import type {
  Config,
  ToolCallRequestInfo,
  ToolRegistry,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolCallResponseInfo,
  ToolCall, // Import from core
  Status as ToolCallStatusType,
  ToolInvocation,
  AnyDeclarativeTool,
  AnyToolInvocation,
} from "@qwen-code/qwen-code-core";
import {
  ToolConfirmationOutcome,
  ApprovalMode,
  Kind,
  BaseDeclarativeTool,
  BaseToolInvocation,
} from "@qwen-code/qwen-code-core";
import type { HistoryItemWithoutId } from "../types.js";
import { ToolCallStatus } from "../types.js";

// Mocks
vi.mock("@qwen-code/qwen-code-core", async () => {
  const actual = await vi.importActual("@qwen-code/qwen-code-core");
  return {
    ...actual,
    ToolRegistry: vi.fn(),
    Config: vi.fn(),
  };
});

const mockToolRegistry = {
  getTool: vi.fn(),
  getAllToolNames: vi.fn(() => ["mockTool", "anotherTool"]),
};

const mockConfig = {
  getToolRegistry: vi.fn(() => mockToolRegistry as unknown as ToolRegistry),
  getApprovalMode: vi.fn(() => ApprovalMode.DEFAULT),
  getSessionId: () => "test-session-id",
  getUsageStatisticsEnabled: () => true,
  getDebugMode: () => false,
  getAllowedTools: vi.fn(() => []),
  getContentGeneratorConfig: () => ({
    model: "test-model",
    authType: "oauth-personal",
  }),
} as unknown as Config;

const createToolCallRequest = (
  overrides: Partial<ToolCallRequestInfo>,
): ToolCallRequestInfo => ({
  callId: "default-call-id",
  name: "mockTool",
  args: {},
  isClientInitiated: false,
  prompt_id: "prompt-id",
  ...overrides,
});

class MockToolInvocation extends BaseToolInvocation<object, ToolResult> {
  constructor(
    private readonly tool: MockTool,
    params: object,
  ) {
    super(params);
  }

  getDescription(): string {
    return JSON.stringify(this.params);
  }

  override shouldConfirmExecute(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return this.tool.shouldConfirmExecute(this.params, abortSignal);
  }

  execute(
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
    terminalColumns?: number,
    terminalRows?: number,
  ): Promise<ToolResult> {
    return this.tool.execute(
      this.params,
      signal,
      updateOutput,
      terminalColumns,
      terminalRows,
    );
  }
}

class MockTool extends BaseDeclarativeTool<object, ToolResult> {
  constructor(
    name: string,
    displayName: string,
    canUpdateOutput = false,
    shouldConfirm = false,
    isOutputMarkdown = false,
  ) {
    super(
      name,
      displayName,
      "A mock tool for testing",
      Kind.Other,
      {},
      isOutputMarkdown,
      canUpdateOutput,
    );
    if (shouldConfirm) {
      this.shouldConfirmExecute.mockImplementation(
        async (): Promise<ToolCallConfirmationDetails | false> => ({
          type: "edit",
          title: "Mock Tool Requires Confirmation",
          onConfirm: mockOnUserConfirmForToolConfirmation,
          filePath: "mock",
          fileName: "mockToolRequiresConfirmation.ts",
          fileDiff: "Mock tool requires confirmation",
          originalContent: "Original content",
          newContent: "New content",
        }),
      );
    }
  }

  execute = vi.fn();
  shouldConfirmExecute = vi.fn();

  protected createInvocation(
    params: object,
  ): ToolInvocation<object, ToolResult> {
    return new MockToolInvocation(this, params);
  }
}

const mockTool = new MockTool("mockTool", "Mock Tool");
const mockToolWithLiveOutput = new MockTool(
  "mockToolWithLiveOutput",
  "Mock Tool With Live Output",
  true,
);
let mockOnUserConfirmForToolConfirmation: Mock;
const mockToolRequiresConfirmation = new MockTool(
  "mockToolRequiresConfirmation",
  "Mock Tool Requires Confirmation",
  false,
  true,
);

describe("useReactToolScheduler in YOLO Mode", () => {
  let onComplete: Mock;
  let setPendingHistoryItem: Mock;

  beforeEach(() => {
    onComplete = vi.fn();
    setPendingHistoryItem = vi.fn();
    mockToolRegistry.getTool.mockClear();
    (mockToolRequiresConfirmation.execute as Mock).mockClear();
    (mockToolRequiresConfirmation.shouldConfirmExecute as Mock).mockClear();

    // IMPORTANT: Enable YOLO mode for this test suite
    (mockConfig.getApprovalMode as Mock).mockReturnValue(ApprovalMode.YOLO);

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    // IMPORTANT: Disable YOLO mode after this test suite
    (mockConfig.getApprovalMode as Mock).mockReturnValue(ApprovalMode.DEFAULT);
  });

  const renderSchedulerInYoloMode = () =>
    renderHook(() =>
      useReactToolScheduler(
        onComplete,
        mockConfig as unknown as Config,
        setPendingHistoryItem,
        () => undefined,
        () => {},
      ),
    );

  it("should skip confirmation and execute tool directly when yoloMode is true", async () => {
    mockToolRegistry.getTool.mockReturnValue(mockToolRequiresConfirmation);
    const expectedOutput = "YOLO Confirmed output";
    (mockToolRequiresConfirmation.execute as Mock).mockResolvedValue({
      llmContent: expectedOutput,
      returnDisplay: "YOLO Formatted tool output",
    } as ToolResult);

    const { result } = renderSchedulerInYoloMode();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = createToolCallRequest({
      callId: "yoloCall",
      name: "mockToolRequiresConfirmation",
      args: { data: "any data" },
    });

    act(() => {
      schedule(request, new AbortController().signal);
    });

    await act(async () => {
      await vi.runAllTimersAsync(); // Process validation
    });
    await act(async () => {
      await vi.runAllTimersAsync(); // Process scheduling
    });
    await act(async () => {
      await vi.runAllTimersAsync(); // Process execution
    });

    // Check that execute WAS called
    expect(mockToolRequiresConfirmation.execute).toHaveBeenCalledWith(
      request.args,
      expect.any(AbortSignal),
      undefined,
      undefined,
      undefined,
    );

    // Check that onComplete was called with success
    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: "success",
        request,
        response: expect.objectContaining({
          resultDisplay: "YOLO Formatted tool output",
          responseParts: [
            {
              functionResponse: {
                id: "yoloCall",
                name: "mockToolRequiresConfirmation",
                response: { output: expectedOutput },
              },
            },
          ],
        }),
      }),
    ]);

    // Ensure no confirmation UI was triggered (setPendingHistoryItem should not have been called with confirmation details)
    const setPendingHistoryItemCalls = setPendingHistoryItem.mock.calls;
    const confirmationCall = setPendingHistoryItemCalls.find((call) => {
      const item = typeof call[0] === "function" ? call[0]({}) : call[0];
      return item?.tools?.[0]?.confirmationDetails;
    });
    expect(confirmationCall).toBeUndefined();
  });
});

describe("useReactToolScheduler", () => {
  let onComplete: Mock;
  let setPendingHistoryItem: Mock;

  beforeEach(() => {
    onComplete = vi.fn();
    setPendingHistoryItem = vi.fn((updaterOrValue) => {
      if (typeof updaterOrValue === "function") {
        const prevState: HistoryItemWithoutId = {
          type: "tool_group",
          tools: [],
        };
        updaterOrValue(prevState);
      }
    });

    mockToolRegistry.getTool.mockClear();
    (mockTool.execute as Mock).mockClear();
    (mockTool.shouldConfirmExecute as Mock).mockClear();
    (mockToolWithLiveOutput.execute as Mock).mockClear();
    (mockToolWithLiveOutput.shouldConfirmExecute as Mock).mockClear();
    (mockToolRequiresConfirmation.execute as Mock).mockClear();
    (mockToolRequiresConfirmation.shouldConfirmExecute as Mock).mockClear();

    mockOnUserConfirmForToolConfirmation = vi.fn();
    (
      mockToolRequiresConfirmation.shouldConfirmExecute as Mock
    ).mockImplementation(
      async (): Promise<ToolCallConfirmationDetails | null> =>
        ({
          onConfirm: mockOnUserConfirmForToolConfirmation,
          fileName: "mockToolRequiresConfirmation.ts",
          fileDiff: "Mock tool requires confirmation",
          filePath: "mock",
          originalContent: "Original content",
          newContent: "New content",
          type: "edit",
          title: "Mock Tool Requires Confirmation",
        }) as ToolCallConfirmationDetails,
    );

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const renderScheduler = () =>
    renderHook(() =>
      useReactToolScheduler(
        onComplete,
        mockConfig as unknown as Config,
        setPendingHistoryItem,
        () => undefined,
        () => {},
      ),
    );

  const waitForCondition = async (
    condition: () => boolean,
    errorMessage: string,
    maxCycles = 12,
  ) => {
    for (let i = 0; i < maxCycles; i += 1) {
      if (condition()) {
        return;
      }
      await act(async () => {
        await vi.runAllTimersAsync();
      });
    }
    throw new Error(errorMessage);
  };

  it("initial state should be empty", () => {
    const { result } = renderScheduler();
    expect(result.current[0]).toEqual([]);
  });

  it("should schedule and execute a tool call successfully", async () => {
    mockToolRegistry.getTool.mockReturnValue(mockTool);
    (mockTool.execute as Mock).mockResolvedValue({
      llmContent: "Tool output",
      returnDisplay: "Formatted tool output",
    } as ToolResult);
    (mockTool.shouldConfirmExecute as Mock).mockResolvedValue(null);

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = createToolCallRequest({
      callId: "call1",
      name: "mockTool",
      args: { param: "value" },
    });

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockTool.execute).toHaveBeenCalledWith(
      request.args,
      expect.any(AbortSignal),
      undefined,
      undefined,
      undefined,
    );
    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: "success",
        request,
        response: expect.objectContaining({
          resultDisplay: "Formatted tool output",
          responseParts: [
            {
              functionResponse: {
                id: "call1",
                name: "mockTool",
                response: { output: "Tool output" },
              },
            },
          ],
        }),
      }),
    ]);
    expect(result.current[0]).toEqual([]);
  });

  it("should handle tool not found", async () => {
    mockToolRegistry.getTool.mockReturnValue(undefined);
    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = createToolCallRequest({
      callId: "call1",
      name: "nonexistentTool",
      args: {},
    });

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: "error",
        request,
        response: expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringMatching(
              /Tool "nonexistentTool" not found in registry/,
            ),
          }),
        }),
      }),
    ]);
    const errorMessage = onComplete.mock.calls[0][0][0].response.error.message;
    expect(errorMessage).toContain("Did you mean one of:");
    expect(errorMessage).toContain('"mockTool"');
    expect(errorMessage).toContain('"anotherTool"');
    expect(result.current[0]).toEqual([]);
  });

  it("should handle error during shouldConfirmExecute", async () => {
    mockToolRegistry.getTool.mockReturnValue(mockTool);
    const confirmError = new Error("Confirmation check failed");
    (mockTool.shouldConfirmExecute as Mock).mockRejectedValue(confirmError);

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = createToolCallRequest({
      callId: "call1",
      name: "mockTool",
      args: {},
    });

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: "error",
        request,
        response: expect.objectContaining({
          error: confirmError,
        }),
      }),
    ]);
    expect(result.current[0]).toEqual([]);
  });

  it("should handle error during execute", async () => {
    mockToolRegistry.getTool.mockReturnValue(mockTool);
    (mockTool.shouldConfirmExecute as Mock).mockResolvedValue(null);
    const execError = new Error("Execution failed");
    (mockTool.execute as Mock).mockRejectedValue(execError);

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = createToolCallRequest({
      callId: "call1",
      name: "mockTool",
      args: {},
    });

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: "error",
        request,
        response: expect.objectContaining({
          error: execError,
        }),
      }),
    ]);
    expect(result.current[0]).toEqual([]);
  });

  it("should handle tool requiring confirmation - approved", async () => {
    mockToolRegistry.getTool.mockReturnValue(mockToolRequiresConfirmation);
    const expectedOutput = "Confirmed output";
    (mockToolRequiresConfirmation.execute as Mock).mockResolvedValue({
      llmContent: expectedOutput,
      returnDisplay: "Confirmed display",
    } as ToolResult);

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = createToolCallRequest({
      callId: "callConfirm",
      name: "mockToolRequiresConfirmation",
      args: { data: "sensitive" },
    });

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await waitForCondition(
      () =>
        result.current[0].some(
          (call) =>
            call.request.callId === request.callId &&
            call.status === "awaiting_approval",
        ),
      "Tool call never reached awaiting_approval",
    );

    const awaitingApprovalCall = result.current[0].find(
      (call) =>
        call.request.callId === request.callId &&
        call.status === "awaiting_approval",
    );
    if (
      !awaitingApprovalCall ||
      awaitingApprovalCall.status !== "awaiting_approval"
    ) {
      throw new Error("Expected tool call to be awaiting approval");
    }

    await act(async () => {
      await awaitingApprovalCall.confirmationDetails.onConfirm(
        ToolConfirmationOutcome.ProceedOnce,
      );
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockOnUserConfirmForToolConfirmation).toHaveBeenCalledWith(
      ToolConfirmationOutcome.ProceedOnce,
    );
    expect(mockToolRequiresConfirmation.execute).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: "success",
        request,
        response: expect.objectContaining({
          resultDisplay: "Confirmed display",
          responseParts: expect.arrayContaining([
            expect.objectContaining({
              functionResponse: expect.objectContaining({
                response: { output: expectedOutput },
              }),
            }),
          ]),
        }),
      }),
    ]);
    expect(result.current[0]).toEqual([]);
  });

  it("should handle tool requiring confirmation - cancelled by user", async () => {
    mockToolRegistry.getTool.mockReturnValue(mockToolRequiresConfirmation);
    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = createToolCallRequest({
      callId: "callConfirmCancel",
      name: "mockToolRequiresConfirmation",
      args: {},
    });

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await waitForCondition(
      () =>
        result.current[0].some(
          (call) =>
            call.request.callId === request.callId &&
            call.status === "awaiting_approval",
        ),
      "Tool call never reached awaiting_approval",
    );

    const awaitingApprovalCall = result.current[0].find(
      (call) =>
        call.request.callId === request.callId &&
        call.status === "awaiting_approval",
    );
    if (
      !awaitingApprovalCall ||
      awaitingApprovalCall.status !== "awaiting_approval"
    ) {
      throw new Error("Expected tool call to be awaiting approval");
    }

    await act(async () => {
      await awaitingApprovalCall.confirmationDetails.onConfirm(
        ToolConfirmationOutcome.Cancel,
      );
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockOnUserConfirmForToolConfirmation).toHaveBeenCalledWith(
      ToolConfirmationOutcome.Cancel,
    );
    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: "cancelled",
        request,
        response: expect.objectContaining({
          responseParts: expect.arrayContaining([
            expect.objectContaining({
              functionResponse: expect.objectContaining({
                response: expect.objectContaining({
                  error: expect.stringContaining(
                    "[Operation Cancelled] Reason: User did not allow tool call",
                  ),
                }),
              }),
            }),
          ]),
        }),
      }),
    ]);
    expect(result.current[0]).toEqual([]);
  });

  it("should handle live output updates", async () => {
    mockToolRegistry.getTool.mockReturnValue(mockToolWithLiveOutput);
    let liveUpdateFn: ((output: string) => void) | undefined;
    let resolveExecutePromise: (value: ToolResult) => void = () => undefined;
    const executePromise = new Promise<ToolResult>((resolve) => {
      resolveExecutePromise = resolve;
    });

    (mockToolWithLiveOutput.execute as Mock).mockImplementation(
      async (
        _args: Record<string, unknown>,
        _signal: AbortSignal,
        updateFn: ((output: string) => void) | undefined,
      ) => {
        liveUpdateFn = updateFn;
        return executePromise;
      },
    );
    (mockToolWithLiveOutput.shouldConfirmExecute as Mock).mockResolvedValue(
      null,
    );

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request: ToolCallRequestInfo = createToolCallRequest({
      callId: "liveCall",
      name: "mockToolWithLiveOutput",
      args: {},
    });

    act(() => {
      schedule(request, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitForCondition(
      () => liveUpdateFn !== undefined,
      "Live output callback was never provided",
    );

    await act(async () => {
      liveUpdateFn?.("Live output 1");
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(setPendingHistoryItem).toHaveBeenCalled();

    await act(async () => {
      liveUpdateFn?.("Live output 2");
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      resolveExecutePromise({
        llmContent: "Final output",
        returnDisplay: "Final display",
      } as ToolResult);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({
        status: "success",
        request,
        response: expect.objectContaining({
          resultDisplay: "Final display",
          responseParts: expect.arrayContaining([
            expect.objectContaining({
              functionResponse: expect.objectContaining({
                response: { output: "Final output" },
              }),
            }),
          ]),
        }),
      }),
    ]);
    expect(result.current[0]).toEqual([]);
  });

  it("should schedule and execute multiple tool calls", async () => {
    const tool1 = new MockTool("tool1", "Tool 1");
    tool1.execute.mockResolvedValue({
      llmContent: "Output 1",
      returnDisplay: "Display 1",
    } as ToolResult);
    tool1.shouldConfirmExecute.mockResolvedValue(null);

    const tool2 = new MockTool("tool2", "Tool 2");
    tool2.execute.mockResolvedValue({
      llmContent: "Output 2",
      returnDisplay: "Display 2",
    } as ToolResult);
    tool2.shouldConfirmExecute.mockResolvedValue(null);

    mockToolRegistry.getTool.mockImplementation((name) => {
      if (name === "tool1") return tool1;
      if (name === "tool2") return tool2;
      return undefined;
    });

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const requests: ToolCallRequestInfo[] = [
      createToolCallRequest({ callId: "multi1", name: "tool1", args: { p: 1 } }),
      createToolCallRequest({ callId: "multi2", name: "tool2", args: { p: 2 } }),
    ];

    act(() => {
      schedule(requests, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    const completedCalls = onComplete.mock.calls[0][0] as ToolCall[];
    expect(completedCalls.length).toBe(2);

    const call1Result = completedCalls.find(
      (c) => c.request.callId === "multi1",
    );
    const call2Result = completedCalls.find(
      (c) => c.request.callId === "multi2",
    );

    expect(call1Result).toMatchObject({
      status: "success",
      request: requests[0],
      response: expect.objectContaining({
        resultDisplay: "Display 1",
        responseParts: [
          {
            functionResponse: {
              id: "multi1",
              name: "tool1",
              response: { output: "Output 1" },
            },
          },
        ],
      }),
    });
    expect(call2Result).toMatchObject({
      status: "success",
      request: requests[1],
      response: expect.objectContaining({
        resultDisplay: "Display 2",
        responseParts: [
          {
            functionResponse: {
              id: "multi2",
              name: "tool2",
              response: { output: "Output 2" },
            },
          },
        ],
      }),
    });
    expect(result.current[0]).toEqual([]);
  });

  it("should queue tool calls if scheduling while another call is running", async () => {
    mockToolRegistry.getTool.mockReturnValue(mockTool);
    let resolveRun1: (value: ToolResult) => void = () => undefined;
    let resolveRun2: (value: ToolResult) => void = () => undefined;
    let executeCount = 0;
    (mockTool.execute as Mock).mockImplementation(() => {
      executeCount += 1;
      return new Promise<ToolResult>((resolve) => {
        if (executeCount === 1) {
          resolveRun1 = resolve;
        } else {
          resolveRun2 = resolve;
        }
      });
    });
    (mockTool.shouldConfirmExecute as Mock).mockResolvedValue(null);

    const { result } = renderScheduler();
    const schedule = result.current[1];
    const request1: ToolCallRequestInfo = createToolCallRequest({
      callId: "run1",
      name: "mockTool",
      args: {},
    });
    const request2: ToolCallRequestInfo = createToolCallRequest({
      callId: "run2",
      name: "mockTool",
      args: {},
    });

    act(() => {
      schedule(request1, new AbortController().signal);
    });
    act(() => {
      schedule(request2, new AbortController().signal);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await waitForCondition(
      () => mockTool.execute.mock.calls.length === 1,
      "First execution never started",
    );

    act(() => {
      resolveRun1({
        llmContent: "done 1",
        returnDisplay: "done display 1",
      } as ToolResult);
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await waitForCondition(
      () => mockTool.execute.mock.calls.length === 2,
      "Second execution never started from queue",
    );

    act(() => {
      resolveRun2({
        llmContent: "done 2",
        returnDisplay: "done display 2",
      } as ToolResult);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await waitForCondition(
      () => onComplete.mock.calls.length === 2,
      "Queued executions never completed",
    );
    const completedCallIds = onComplete.mock.calls.flatMap((call) =>
      (call[0] as ToolCall[]).map((toolCall) => toolCall.request.callId),
    );
    expect(completedCallIds).toContain(request1.callId);
    expect(completedCallIds).toContain(request2.callId);
    expect(result.current[0]).toEqual([]);
  });
});

describe("mapToDisplay", () => {
  const baseRequest: ToolCallRequestInfo = createToolCallRequest({
    callId: "testCallId",
    name: "testTool",
    args: { foo: "bar" },
  });

  const baseTool = new MockTool("testTool", "Test Tool Display");

  const baseResponse: ToolCallResponseInfo = {
    callId: "testCallId",
    responseParts: [
      {
        functionResponse: {
          name: "testTool",
          id: "testCallId",
          response: { output: "Test output" },
        } as FunctionResponse,
      } as unknown as Part,
    ],
    resultDisplay: "Test display output",
    error: undefined,
    errorType: undefined,
  };

  // Define a more specific type for extraProps for these tests
  // This helps ensure that tool and confirmationDetails are only accessed when they are expected to exist.
  type MapToDisplayExtraProps =
    | {
        tool?: AnyDeclarativeTool;
        invocation?: AnyToolInvocation;
        liveOutput?: string;
        response?: ToolCallResponseInfo;
        confirmationDetails?: ToolCallConfirmationDetails;
      }
    | {
        tool: AnyDeclarativeTool;
        invocation?: AnyToolInvocation;
        response?: ToolCallResponseInfo;
        confirmationDetails?: ToolCallConfirmationDetails;
      }
    | {
        response: ToolCallResponseInfo;
        tool?: undefined;
        confirmationDetails?: ToolCallConfirmationDetails;
      }
    | {
        confirmationDetails: ToolCallConfirmationDetails;
        tool?: AnyDeclarativeTool;
        invocation?: AnyToolInvocation;
        response?: ToolCallResponseInfo;
      };

  const baseInvocation = baseTool.build(baseRequest.args);
  const testCases: Array<{
    name: string;
    status: ToolCallStatusType;
    extraProps?: MapToDisplayExtraProps;
    expectedStatus: ToolCallStatus;
    expectedResultDisplay?: string;
    expectedName?: string;
    expectedDescription?: string;
  }> = [
    {
      name: "validating",
      status: "validating",
      extraProps: { tool: baseTool, invocation: baseInvocation },
      expectedStatus: ToolCallStatus.Executing,
      expectedName: baseTool.displayName,
      expectedDescription: baseInvocation.getDescription(),
    },
    {
      name: "awaiting_approval",
      status: "awaiting_approval",
      extraProps: {
        tool: baseTool,
        invocation: baseInvocation,
        confirmationDetails: {
          onConfirm: vi.fn(),
          type: "edit",
          title: "Test Tool Display",
          serverName: "testTool",
          toolName: "testTool",
          toolDisplayName: "Test Tool Display",
          filePath: "mock",
          fileName: "test.ts",
          fileDiff: "Test diff",
          originalContent: "Original content",
          newContent: "New content",
        } as ToolCallConfirmationDetails,
      },
      expectedStatus: ToolCallStatus.Confirming,
      expectedName: baseTool.displayName,
      expectedDescription: baseInvocation.getDescription(),
    },
    {
      name: "scheduled",
      status: "scheduled",
      extraProps: { tool: baseTool, invocation: baseInvocation },
      expectedStatus: ToolCallStatus.Pending,
      expectedName: baseTool.displayName,
      expectedDescription: baseInvocation.getDescription(),
    },
    {
      name: "executing no live output",
      status: "executing",
      extraProps: { tool: baseTool, invocation: baseInvocation },
      expectedStatus: ToolCallStatus.Executing,
      expectedName: baseTool.displayName,
      expectedDescription: baseInvocation.getDescription(),
    },
    {
      name: "executing with live output",
      status: "executing",
      extraProps: {
        tool: baseTool,
        invocation: baseInvocation,
        liveOutput: "Live test output",
      },
      expectedStatus: ToolCallStatus.Executing,
      expectedResultDisplay: "Live test output",
      expectedName: baseTool.displayName,
      expectedDescription: baseInvocation.getDescription(),
    },
    {
      name: "success",
      status: "success",
      extraProps: {
        tool: baseTool,
        invocation: baseInvocation,
        response: baseResponse,
      },
      expectedStatus: ToolCallStatus.Success,
      expectedResultDisplay: "Test display output",
      expectedName: baseTool.displayName,
      expectedDescription: baseInvocation.getDescription(),
    },
    {
      name: "error tool not found",
      status: "error",
      extraProps: {
        response: {
          ...baseResponse,
          error: new Error("Test error tool not found"),
          resultDisplay: "Error display tool not found",
        },
      },
      expectedStatus: ToolCallStatus.Error,
      expectedResultDisplay: "Error display tool not found",
      expectedName: baseRequest.name,
      expectedDescription: JSON.stringify(baseRequest.args),
    },
    {
      name: "error tool execution failed",
      status: "error",
      extraProps: {
        tool: baseTool,
        response: {
          ...baseResponse,
          error: new Error("Tool execution failed"),
          resultDisplay: "Execution failed display",
        },
      },
      expectedStatus: ToolCallStatus.Error,
      expectedResultDisplay: "Execution failed display",
      expectedName: baseTool.displayName, // Changed from baseTool.name
      expectedDescription: baseInvocation.getDescription(),
    },
    {
      name: "cancelled",
      status: "cancelled",
      extraProps: {
        tool: baseTool,
        invocation: baseInvocation,
        response: {
          ...baseResponse,
          resultDisplay: "Cancelled display",
        },
      },
      expectedStatus: ToolCallStatus.Canceled,
      expectedResultDisplay: "Cancelled display",
      expectedName: baseTool.displayName,
      expectedDescription: baseInvocation.getDescription(),
    },
  ];

  testCases.forEach(
    ({
      name: testName,
      status,
      extraProps,
      expectedStatus,
      expectedResultDisplay,
      expectedName,
      expectedDescription,
    }) => {
      it(`should map ToolCall with status '${status}' (${testName}) correctly`, () => {
        const toolCall: ToolCall = {
          request: baseRequest,
          status,
          ...(extraProps || {}),
        } as ToolCall;

        const display = mapToDisplay(toolCall);
        expect(display.type).toBe("tool_group");
        expect(display.tools.length).toBe(1);
        const toolDisplay = display.tools[0];

        expect(toolDisplay.callId).toBe(baseRequest.callId);
        expect(toolDisplay.status).toBe(expectedStatus);
        expect(toolDisplay.resultDisplay).toBe(expectedResultDisplay);

        expect(toolDisplay.name).toBe(expectedName);
        expect(toolDisplay.description).toBe(expectedDescription);

        expect(toolDisplay.renderOutputAsMarkdown).toBe(
          extraProps?.tool?.isOutputMarkdown ?? false,
        );
        if (status === "awaiting_approval") {
          expect(toolDisplay.confirmationDetails).toBe(
            extraProps!.confirmationDetails,
          );
        } else {
          expect(toolDisplay.confirmationDetails).toBeUndefined();
        }
      });
    },
  );

  it("should map an array of ToolCalls correctly", () => {
    const toolCall1: ToolCall = {
      request: { ...baseRequest, callId: "call1" },
      status: "success",
      tool: baseTool,
      invocation: baseTool.build(baseRequest.args),
      response: { ...baseResponse, callId: "call1" },
    } as ToolCall;
    const toolForCall2 = new MockTool(
      baseTool.name,
      baseTool.displayName,
      false,
      false,
      true,
    );
    const toolCall2: ToolCall = {
      request: { ...baseRequest, callId: "call2" },
      status: "executing",
      tool: toolForCall2,
      invocation: toolForCall2.build(baseRequest.args),
      liveOutput: "markdown output",
    } as ToolCall;

    const display = mapToDisplay([toolCall1, toolCall2]);
    expect(display.tools.length).toBe(2);
    expect(display.tools[0].callId).toBe("call1");
    expect(display.tools[0].status).toBe(ToolCallStatus.Success);
    expect(display.tools[0].renderOutputAsMarkdown).toBe(false);
    expect(display.tools[1].callId).toBe("call2");
    expect(display.tools[1].status).toBe(ToolCallStatus.Executing);
    expect(display.tools[1].resultDisplay).toBe("markdown output");
    expect(display.tools[1].renderOutputAsMarkdown).toBe(true);
  });
});
