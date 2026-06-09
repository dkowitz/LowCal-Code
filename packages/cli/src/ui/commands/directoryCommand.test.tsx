/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { directoryCommand, expandHomeDir, validateDirectory } from "./directoryCommand.js";
import type { Config, WorkspaceContext } from "@qwen-code/qwen-code-core";
import type { CommandContext } from "./types.js";
import { MessageType } from "../types.js";
import * as os from "node:os";
import * as path from "node:path";

describe("directoryCommand", () => {
  let mockContext: CommandContext;
  let mockConfig: Config;
  let mockWorkspaceContext: WorkspaceContext;
  const addCommand = directoryCommand.subCommands?.find(
    (c) => c.name === "add",
  );
  const showCommand = directoryCommand.subCommands?.find(
    (c) => c.name === "show",
  );

  beforeEach(() => {
    mockWorkspaceContext = {
      addDirectory: vi.fn(),
      getDirectories: vi
        .fn()
        .mockReturnValue([
          path.normalize("/home/user/project1"),
          path.normalize("/home/user/project2"),
        ]),
    } as unknown as WorkspaceContext;

    mockConfig = {
      getWorkspaceContext: () => mockWorkspaceContext,
      isRestrictiveSandbox: vi.fn().mockReturnValue(false),
      getGeminiClient: vi.fn().mockReturnValue({
        addDirectoryContext: vi.fn(),
      }),
      getWorkingDir: () => "/test/dir",
      shouldLoadMemoryFromIncludeDirectories: () => false,
      getDebugMode: () => false,
      getFileService: () => ({}),
      getExtensionContextFilePaths: () => [],
      getFileFilteringOptions: () => ({ ignore: [], include: [] }),
      setUserMemory: vi.fn(),
      setGeminiMdFileCount: vi.fn(),
    } as unknown as Config;

    mockContext = {
      services: {
        config: mockConfig,
        settings: {
          merged: {
            memoryDiscoveryMaxDirs: 1000,
          },
        },
      },
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext;
  });

  describe("validateDirectory", () => {
    it("should return valid for existing directories", () => {
      // Use /tmp which always exists on Linux
      const result = validateDirectory("/tmp");
      expect(result).toEqual({ valid: true });
    });

    it("should return invalid error for non-existent directory", () => {
      const result = validateDirectory("/nonexistent/path/that/does/not/exist/xyz123");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("Directory does not exist");
        expect(result.error).toContain("/nonexistent/path/that/does/not/exist/xyz123");
      }
    });

    it("should return invalid error for a file path", () => {
      // /etc/passwd exists but is a file on Linux
      const result = validateDirectory("/etc/passwd");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("Path is not a directory");
      }
    });

    it("should return invalid for empty string", () => {
      const result = validateDirectory("");
      expect(result.valid).toBe(false);
    });
  });

  describe("show", () => {
    it("should display the list of directories", () => {
      if (!showCommand?.action) throw new Error("No action");
      showCommand.action(mockContext, "");
      expect(mockWorkspaceContext.getDirectories).toHaveBeenCalled();
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: `Current workspace directories:\n- ${path.normalize(
            "/home/user/project1",
          )}\n- ${path.normalize("/home/user/project2")}`,
        }),
        expect.any(Number),
      );
    });

    it("should show an error if getDirectories returns undefined", () => {
      mockWorkspaceContext.getDirectories = vi.fn().mockReturnValue(undefined);
      if (!showCommand?.action) throw new Error("No action");
      showCommand.action(mockContext, "");
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: "Unable to retrieve workspace directories.",
        }),
        expect.any(Number),
      );
    });
  });

  describe("add", () => {
    it("should show an error if no path is provided", () => {
      if (!addCommand?.action) throw new Error("No action");
      addCommand.action(mockContext, "");
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: "Please provide at least one path to add.",
        }),
        expect.any(Number),
      );
    });

    it("should show an error if the directory does not exist", async () => {
      const nonExistentPath = "/nonexistent/path/that/does/not/exist/abc123xyz";
      if (!addCommand?.action) throw new Error("No action");
      await addCommand.action(mockContext, nonExistentPath);
      expect(mockWorkspaceContext.addDirectory).not.toHaveBeenCalled();
      const calls = (mockContext.ui.addItem as ReturnType<typeof vi.fn>).mock.calls;
      const errorCalls = calls.filter(
        (call) => call[0] && typeof call[0] === "object" && "type" in call[0] && call[0].type === MessageType.ERROR,
      );
      expect(errorCalls.length).toBeGreaterThan(0);
      expect(errorCalls[0][0]).toEqual(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: expect.stringContaining(`Directory does not exist`),
        }),
      );
    });

    it("should show an error if the path is a file, not a directory", async () => {
      // /etc/passwd exists but is a file on Linux
      const filePath = "/etc/passwd";
      if (!addCommand?.action) throw new Error("No action");
      await addCommand.action(mockContext, filePath);
      expect(mockWorkspaceContext.addDirectory).not.toHaveBeenCalled();
      const calls = (mockContext.ui.addItem as ReturnType<typeof vi.fn>).mock.calls;
      const errorCalls = calls.filter(
        (call) => call[0] && typeof call[0] === "object" && "type" in call[0] && call[0].type === MessageType.ERROR,
      );
      expect(errorCalls.length).toBeGreaterThan(0);
      expect(errorCalls[0][0]).toEqual(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: expect.stringContaining("Path is not a directory"),
        }),
      );
    });

    it("should call addDirectory and show a success message for a valid path", async () => {
      // Use /tmp which exists on Linux
      if (!addCommand?.action) throw new Error("No action");
      await addCommand.action(mockContext, "/tmp");
      expect(mockWorkspaceContext.addDirectory).toHaveBeenCalledWith("/tmp");
    });

    it("should handle a mix of valid and invalid paths", async () => {
      const validPath = "/tmp";
      const nonExistentPath = "/nonexistent/path/that/does/not/exist/xyz789abc";

      if (!addCommand?.action) throw new Error("No action");
      await addCommand.action(mockContext, `${validPath},${nonExistentPath}`);

      expect(mockWorkspaceContext.addDirectory).toHaveBeenCalledWith("/tmp");

      const calls = (mockContext.ui.addItem as ReturnType<typeof vi.fn>).mock.calls;
      const errorCalls = calls.filter(
        (call) => call[0] && typeof call[0] === "object" && "type" in call[0] && call[0].type === MessageType.ERROR,
      );
      expect(errorCalls.length).toBeGreaterThan(0);
      expect(errorCalls[0][0]).toEqual(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: expect.stringContaining("Directory does not exist"),
        }),
      );
    });

    it("should handle a mix of file paths and directory paths", async () => {
      const dirPath = "/tmp";
      const filePath = "/etc/passwd";

      if (!addCommand?.action) throw new Error("No action");
      await addCommand.action(mockContext, `${dirPath},${filePath}`);

      expect(mockWorkspaceContext.addDirectory).toHaveBeenCalledWith("/tmp");

      const calls = (mockContext.ui.addItem as ReturnType<typeof vi.fn>).mock.calls;
      const errorCalls = calls.filter(
        (call) => call[0] && typeof call[0] === "object" && "type" in call[0] && call[0].type === MessageType.ERROR,
      );
      expect(errorCalls.length).toBeGreaterThan(0);
    });

    it("should show an error if addDirectory throws an exception", async () => {
      const validPath = "/tmp";
      const error = new Error("Permission denied");
      vi.mocked(mockWorkspaceContext.addDirectory).mockImplementation(() => {
        throw error;
      });
      if (!addCommand?.action) throw new Error("No action");
      await addCommand.action(mockContext, validPath);
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: `Error adding '${validPath}': ${error.message}`,
        }),
        expect.any(Number),
      );
    });
  });

  describe("expandHomeDir", () => {
    it("should correctly expand a Windows-style home directory path", () => {
      const windowsPath = "%userprofile%\\\\Documents";
      const expectedPath = path.win32.join(os.homedir(), "Documents");
      const result = expandHomeDir(windowsPath);
      expect(path.win32.normalize(result)).toBe(
        path.win32.normalize(expectedPath),
      );
    });

    it("should correctly expand a tilde home directory path", () => {
      const tildePath = "~/Documents";
      const expectedPath = os.homedir() + "/Documents";
      const result = expandHomeDir(tildePath);
      expect(result).toBe(path.normalize(expectedPath));
    });

    it("should return empty string for empty input", () => {
      expect(expandHomeDir("")).toBe("");
    });
  });
});
