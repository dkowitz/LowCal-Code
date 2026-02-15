/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from "node:path";
import { makeRelative, shortenPath } from "../utils/paths.js";
import type { ToolInvocation, ToolLocation, ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";
import { ToolNames } from "./tool-names.js";

import type { PartUnion } from "@google/genai";
import {
  detectFileType,
  getSpecificMimeType,
  processSingleFileContent,
} from "../utils/fileUtils.js";
import type { Config } from "../config/config.js";
import { FileOperation } from "../telemetry/metrics.js";
import { getProgrammingLanguage } from "../telemetry/telemetry-utils.js";
import { logFileOperation } from "../telemetry/loggers.js";
import { FileOperationEvent } from "../telemetry/types.js";
import { ToolErrorType } from "./tool-error.js";

export interface ReadImageToolParams {
  /**
   * The absolute path to the image file to load for vision analysis.
   */
  absolute_path: string;
}

class ReadImageToolInvocation extends BaseToolInvocation<
  ReadImageToolParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: ReadImageToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    const relativePath = makeRelative(
      this.params.absolute_path,
      this.config.getTargetDir(),
    );
    return shortenPath(relativePath);
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: this.params.absolute_path }];
  }

  async execute(): Promise<ToolResult> {
    const fileType = await detectFileType(this.params.absolute_path);
    if (fileType !== "image") {
      return {
        llmContent:
          `Cannot load this file for vision analysis because it is not an image. Detected type: ${fileType}.` +
          ` Use 'read_file' for non-image files.`,
        returnDisplay: `Not an image file: ${shortenPath(makeRelative(this.params.absolute_path, this.config.getTargetDir()))}`,
        error: {
          message: `Expected an image file but detected "${fileType}": ${this.params.absolute_path}`,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    const result = await processSingleFileContent(
      this.params.absolute_path,
      this.config.getTargetDir(),
      this.config.getFileSystemService(),
    );

    if (result.error) {
      return {
        llmContent: result.llmContent,
        returnDisplay: result.returnDisplay || "Error reading image",
        error: {
          message: result.error,
          type: result.errorType,
        },
      };
    }

    const relativePath = makeRelative(
      this.params.absolute_path,
      this.config.getTargetDir(),
    );
    let llmContent: PartUnion | PartUnion[] = result.llmContent || "";
    if (typeof llmContent !== "string" && !Array.isArray(llmContent)) {
      llmContent = [
        {
          text: `Image loaded from ${relativePath}. Analyze the visual content and answer the user's request.`,
        },
        llmContent,
      ];
    }

    const mimetype = getSpecificMimeType(this.params.absolute_path);
    const programming_language = getProgrammingLanguage({
      absolute_path: this.params.absolute_path,
    });
    logFileOperation(
      this.config,
      new FileOperationEvent(
        ReadImageTool.Name,
        FileOperation.READ,
        undefined,
        mimetype,
        path.extname(this.params.absolute_path),
        undefined,
        programming_language,
      ),
    );

    return {
      llmContent,
      returnDisplay: result.returnDisplay || "",
    };
  }
}

export class ReadImageTool extends BaseDeclarativeTool<
  ReadImageToolParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.READ_IMAGE;

  constructor(private config: Config) {
    super(
      ReadImageTool.Name,
      "ReadImage",
      "Loads an image file into vision input parts for analysis. Use this when the user asks what is depicted in an image, to compare images, or to describe visual content. Requires an absolute path to an image file inside the workspace.",
      Kind.Read,
      {
        properties: {
          absolute_path: {
            description:
              "The absolute path to the image file to read (e.g., '/home/user/project/assets/photo.jpg'). Relative paths are not supported.",
            type: "string",
          },
        },
        required: ["absolute_path"],
        type: "object",
      },
    );
  }

  protected override validateToolParamValues(
    params: ReadImageToolParams,
  ): string | null {
    const filePath = params.absolute_path;
    if (params.absolute_path.trim() === "") {
      return "The 'absolute_path' parameter must be non-empty.";
    }

    if (!path.isAbsolute(filePath)) {
      return `File path must be absolute, but was relative: ${filePath}. You must provide an absolute path.`;
    }

    const workspaceContext = this.config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(filePath)) {
      const directories = workspaceContext.getDirectories();
      return `File path must be within one of the workspace directories: ${directories.join(", ")}`;
    }

    const fileService = this.config.getFileService();
    if (fileService.shouldGeminiIgnoreFile(params.absolute_path)) {
      return `File path '${filePath}' is ignored by .qwenignore pattern(s).`;
    }

    return null;
  }

  protected createInvocation(
    params: ReadImageToolParams,
  ): ToolInvocation<ReadImageToolParams, ToolResult> {
    return new ReadImageToolInvocation(this.config, params);
  }
}
