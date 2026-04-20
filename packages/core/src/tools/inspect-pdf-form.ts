/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs";
import path from "node:path";
import type { Config } from "../config/config.js";
import { makeRelative, shortenPath } from "../utils/paths.js";
import type { ToolInvocation, ToolLocation, ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";
import { ToolNames } from "./tool-names.js";
import { ToolErrorType } from "./tool-error.js";
import {
  formatPdfFormInspection,
  inspectPdfFormFields,
} from "./pdf-form-utils.js";

export interface InspectPdfFormToolParams {
  absolute_path: string;
  form_profile?: string;
}

class InspectPdfFormToolInvocation extends BaseToolInvocation<
  InspectPdfFormToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: InspectPdfFormToolParams,
  ) {
    super(params);
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: this.params.absolute_path }];
  }

  override getDescription(): string {
    const relativePath = makeRelative(
      this.params.absolute_path,
      this.config.getTargetDir(),
    );
    return `Inspecting fillable fields in ${shortenPath(relativePath)}`;
  }

  override async execute(): Promise<ToolResult> {
    if (!fs.existsSync(this.params.absolute_path)) {
      return {
        llmContent:
          "Could not inspect the PDF form because no file was found at the specified path.",
        returnDisplay: "PDF file not found.",
        error: {
          message: `File not found: ${this.params.absolute_path}`,
          type: ToolErrorType.FILE_NOT_FOUND,
        },
      };
    }

    const stats = fs.lstatSync(this.params.absolute_path);
    if (stats.isDirectory()) {
      return {
        llmContent:
          "Could not inspect the PDF form because the provided path is a directory, not a file.",
        returnDisplay: "Path is a directory.",
        error: {
          message: `Path is a directory, not a file: ${this.params.absolute_path}`,
          type: ToolErrorType.TARGET_IS_DIRECTORY,
        },
      };
    }

    const fields = await inspectPdfFormFields(
      this.params.absolute_path,
      this.params.form_profile,
    );
    if (fields.length === 0) {
      return {
        llmContent:
          "No editable PDF form fields were found in this file. It may not be a fillable form.",
        returnDisplay: "No editable PDF fields found.",
      };
    }

    return {
      llmContent: formatPdfFormInspection(
        this.params.absolute_path,
        fields,
        this.params.form_profile,
      ),
      returnDisplay: `Found ${fields.length} editable PDF form fields.`,
    };
  }
}

export class InspectPdfFormTool extends BaseDeclarativeTool<
  InspectPdfFormToolParams,
  ToolResult
> {
  static readonly Name = ToolNames.INSPECT_PDF_FORM;

  constructor(private readonly config: Config) {
    super(
      InspectPdfFormTool.Name,
      "InspectPdfForm",
      "Inspects a fillable PDF form and returns the editable field names, field types, current values, page numbers, checkbox export values, and any known aliases from a supported form profile. Use this before filling a PDF form so you know the exact field names or aliases to write.",
      Kind.Read,
      {
        type: "object",
        properties: {
          absolute_path: {
            type: "string",
            description:
              "Absolute path to the PDF form to inspect. Relative paths are not supported.",
          },
          form_profile: {
            type: "string",
            description:
              "Optional form profile name. If omitted, the tool will auto-detect supported forms such as the included 2025 IRS Form 1040 when possible.",
          },
        },
        required: ["absolute_path"],
      },
    );
  }

  protected override validateToolParamValues(
    params: InspectPdfFormToolParams,
  ): string | null {
    const filePath = params.absolute_path;
    if (filePath.trim() === "") {
      return "The 'absolute_path' parameter must be non-empty.";
    }
    if (!path.isAbsolute(filePath)) {
      return `File path must be absolute, but was relative: ${filePath}.`;
    }

    const workspaceContext = this.config.getWorkspaceContext();
    if (!workspaceContext.isPathWithinWorkspace(filePath)) {
      const directories = workspaceContext.getDirectories();
      return `File path must be within one of the workspace directories: ${directories.join(", ")}`;
    }

    if (path.extname(filePath).toLowerCase() !== ".pdf") {
      return `File path must point to a PDF file: ${filePath}`;
    }

    const fileService = this.config.getFileService();
    if (fileService.shouldGeminiIgnoreFile(filePath)) {
      return `File path '${filePath}' is ignored by .qwenignore pattern(s).`;
    }

    return null;
  }

  protected createInvocation(
    params: InspectPdfFormToolParams,
  ): ToolInvocation<InspectPdfFormToolParams, ToolResult> {
    return new InspectPdfFormToolInvocation(this.config, params);
  }
}
