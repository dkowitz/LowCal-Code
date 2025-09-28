/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Config } from '@qwen-code/qwen-code-core';
import {
  setErrorReportListener,
  type ErrorReportEvent,
} from '@qwen-code/qwen-code-core';
import {
  SessionMarkdownLogger,
  type SessionLoggingController,
} from '../../services/SessionMarkdownLogger.js';
import type { HistoryItem } from '../types.js';
import type { SessionStatsState } from '../contexts/SessionContext.js';
import { appEvents, AppEvent } from '../../utils/events.js';

interface UseSessionLoggingControllerOptions {
  history: HistoryItem[];
  config: Config;
  sessionStats: SessionStatsState;
}

export function useSessionLoggingController(
  options: UseSessionLoggingControllerOptions,
): SessionLoggingController {
  const { history, config, sessionStats } = options;
  const loggerRef = useRef(new SessionMarkdownLogger());
  const historyRef = useRef(history);
  const previousHistoryRef = useRef(history);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    if (!loggerRef.current.isEnabled()) {
      previousHistoryRef.current = history;
      return;
    }
    loggerRef.current.syncHistory(previousHistoryRef.current, history);
    previousHistoryRef.current = history;
  }, [history]);

  useEffect(() => {
    const handleAppError = (message: unknown) => {
      const text = typeof message === 'string' ? message : String(message);
      void loggerRef.current.logAppError({
        timestamp: new Date().toISOString(),
        message: text,
      });
    };

    appEvents.on(AppEvent.LogError, handleAppError);
    return () => {
      appEvents.off(AppEvent.LogError, handleAppError);
    };
  }, []);

  useEffect(() => {
    const listener = (event: ErrorReportEvent) => {
      void loggerRef.current.logErrorReport({
        timestamp: event.timestamp,
        type: event.type,
        baseMessage: event.baseMessage,
        reportPath: event.reportPath,
        report: event.report,
        writeSucceeded: event.writeSucceeded,
      });
    };
    setErrorReportListener(listener);
    return () => {
      setErrorReportListener();
    };
  }, []);

  const enableLogging = useCallback(async () => {
    const additionalContext: Record<string, unknown> = {};
    const projectRoot = config.getProjectRoot();
    if (projectRoot) {
      additionalContext['workspaceRoot'] = projectRoot;
    }
    const statusResult = await loggerRef.current.enable(
      {
        sessionId: config.getSessionId(),
        sessionStartTime: sessionStats.sessionStartTime,
        model: config.getModel(),
        approvalMode: config.getApprovalMode(),
        debugMode: config.getDebugMode(),
        cwd: process.cwd(),
        additionalContext,
      },
      historyRef.current,
    );
    return statusResult;
  }, [config, sessionStats.sessionStartTime]);

  const disableLogging = useCallback(async () => {
    const statusResult = await loggerRef.current.disable();
    return statusResult;
  }, []);

  const getStatus = useCallback(() => loggerRef.current.getStatus(), []);

  const controller = useMemo<SessionLoggingController>(() => {
    return {
      enableLogging,
      disableLogging,
      getStatus,
      logCommandInvocation: (payload) => {
        void loggerRef.current.logCommandInvocation(payload);
      },
      logCommandResult: (payload) => {
        void loggerRef.current.logCommandResult(payload);
      },
      logAppError: (message: string) => {
        void loggerRef.current.logAppError({
          timestamp: new Date().toISOString(),
          message,
        });
      },
      logErrorReport: (payload) => {
        void loggerRef.current.logErrorReport(payload);
      },
    };
  }, [disableLogging, enableLogging, getStatus]);

  return controller;
}
