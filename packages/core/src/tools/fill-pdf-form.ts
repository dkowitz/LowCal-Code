/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { Config } from "../config/config.js";
import { makeRelative, shortenPath } from "../utils/paths.js";
import type { ToolInvocation, ToolLocation, ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";
import { ToolErrorType } from "./tool-error.js";
import { ToolNames } from "./tool-names.js";
import type { PdfFormFillRequest } from "./pdf-form-utils.js";
import {
  fillPdfFormFields,
  formatPdfFormFillResult,
  inspectPdfFormFields,
} from "./pdf-form-utils.js";

export interface FillPdfFormToolParams {
  input_pdf_path: string;
  output_pdf_path: string;
  fields: PdfFormFillRequest[];
  allow_missing_fields?: boolean;
  form_profile?: string;
}

class FillPdfFormToolInvocation extends BaseToolInvocation<
  FillPdfFormToolParams,
  ToolResult
> {
  constructor(
    private readonly config: Config,
    params: FillPdfFormToolParams,
  ) {
    super(params);
  }

  override toolLocations(): ToolLocation[] {
    return [
      { path: this.params.input_pdf_path },
      { path: this.params.output_pdf_path },
    ];
  }

  override getDescription(): string {
    const inputPath = shortenPath(
      makeRelative(this.params.input_pdf_path, this.config.getTargetDir()),
    );
    const outputPath = shortenPath(
      makeRelative(this.params.output_pdf_path, this.config.getTargetDir()),
    );
    return `Filling PDF form ${inputPath} -> ${outputPath}`;
  }

  override async execute(): Promise<ToolResult> {
    if (!fs.existsSync(this.params.input_pdf_path)) {
      return {
        llmContent:
          "Could not fill the PDF form because no input file was found at the specified path.",
        returnDisplay: "PDF file not found.",
        error: {
          message: `File not found: ${this.params.input_pdf_path}`,
          type: ToolErrorType.FILE_NOT_FOUND,
        },
      };
    }

    const stats = fs.lstatSync(this.params.input_pdf_path);
    if (stats.isDirectory()) {
      return {
        llmContent:
          "Could not fill the PDF form because the input path is a directory, not a file.",
        returnDisplay: "Path is a directory.",
        error: {
          message: `Path is a directory, not a file: ${this.params.input_pdf_path}`,
          type: ToolErrorType.TARGET_IS_DIRECTORY,
        },
      };
    }

    const availableFields = await inspectPdfFormFields(this.params.input_pdf_path);
    if (availableFields.length === 0) {
      return {
        llmContent:
          "No editable PDF form fields were found in this file. Inspect the PDF form first to confirm that it is fillable.",
        returnDisplay: "No editable PDF fields found.",
        error: {
          message: `No editable PDF form fields found in ${this.params.input_pdf_path}`,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }

    const fillResult = await fillPdfFormFields(
      this.params.input_pdf_path,
      this.params.fields,
      this.params.form_profile,
    );

    if (
      fillResult.missingFields.length > 0 &&
      !this.params.allow_missing_fields
    ) {
      return {
        llmContent: [
          "One or more requested PDF fields were not found.",
          "",
          `Missing fields: ${fillResult.missingFields.join(", ")}`,
          `Available field count: ${availableFields.length}`,
          "Use inspect_pdf_form to retrieve the exact field names before trying again.",
        ].join("\n"),
        returnDisplay: "Requested PDF fields were not found.",
        error: {
          message: `Missing PDF fields: ${fillResult.missingFields.join(", ")}`,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    await fsp.mkdir(path.dirname(this.params.output_pdf_path), {
      recursive: true,
    });
    await fsp.writeFile(this.params.output_pdf_path, fillResult.outputBytes);

    return {
      llmContent: formatPdfFormFillResult(
        this.params.input_pdf_path,
        this.params.output_pdf_path,
        {
          filledFields: fillResult.filledFields,
          missingFields: fillResult.missingFields,
        },
        this.params.form_profile,
      ),
      returnDisplay: `Filled ${fillResult.filledFields.length} PDF form fields and wrote ${shortenPath(makeRelative(this.params.output_pdf_path, this.config.getTargetDir()))}.`,
    };
  }
}

export class FillPdfFormTool extends BaseDeclarativeTool<
  FillPdfFormToolParams,
  ToolResult
> {
  static readonly Name = ToolNames.FILL_PDF_FORM;

  constructor(private readonly config: Config) {
    super(
      FillPdfFormTool.Name,
      "FillPdfForm",
      "Fills editable fields in a fillable PDF form and writes the updated PDF to an output path. Use inspect_pdf_form first to discover the exact field names. Supports text fields, comb fields, checkboxes, and radio-style toggle fields that expose PDF form widgets. For supported forms such as the included 2025 IRS Form 1040, you can also use friendly aliases via a form profile.",
      Kind.Edit,
      {
        type: "object",
        properties: {
          input_pdf_path: {
            type: "string",
            description:
              "Absolute path to the input PDF form. Relative paths are not supported.",
          },
          output_pdf_path: {
            type: "string",
            description:
              "Absolute path where the filled PDF should be written. This may be the same as the input path.",
          },
          fields: {
            type: "array",
            description:
              "The fields to write. Use exact field names returned by inspect_pdf_form, or provide a friendly alias when a supported form profile is available.",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description:
                    "Exact PDF field name, or an alias if a supported form profile is active.",
                },
                alias: {
                  type: "string",
                  description:
                    "Optional friendly alias for supported form profiles, for example 'taxpayer_first_name' or 'line_1a'.",
                },
                value: {
                  type: ["string", "number", "boolean"],
                  description:
                    "Value to write. For checkboxes and radio-style fields, true/false map to on/off automatically.",
                },
              },
              required: ["value"],
            },
          },
          allow_missing_fields: {
            type: "boolean",
            description:
              "If true, missing field names are ignored and the tool still writes the output PDF.",
          },
          form_profile: {
            type: "string",
            description:
              "Optional form profile name. If omitted, the tool will auto-detect supported forms such as the included 2025 IRS Form 1040 when possible.",
          },
        },
        required: ["input_pdf_path", "output_pdf_path", "fields"],
      },
    );
  }

  protected override validateToolParamValues(
    params: FillPdfFormToolParams,
  ): string | null {
    if (params.input_pdf_path.trim() === "") {
      return "The 'input_pdf_path' parameter must be non-empty.";
    }
    if (params.output_pdf_path.trim() === "") {
      return "The 'output_pdf_path' parameter must be non-empty.";
    }
    if (!path.isAbsolute(params.input_pdf_path)) {
      return `File path must be absolute, but was relative: ${params.input_pdf_path}.`;
    }
    if (!path.isAbsolute(params.output_pdf_path)) {
      return `File path must be absolute, but was relative: ${params.output_pdf_path}.`;
    }

    const workspaceContext = this.config.getWorkspaceContext();
    for (const filePath of [params.input_pdf_path, params.output_pdf_path]) {
      if (!workspaceContext.isPathWithinWorkspace(filePath)) {
        const directories = workspaceContext.getDirectories();
        return `File path must be within one of the workspace directories: ${directories.join(", ")}`;
      }
      if (path.extname(filePath).toLowerCase() !== ".pdf") {
        return `File path must point to a PDF file: ${filePath}`;
      }
    }

    if (!Array.isArray(params.fields) || params.fields.length === 0) {
      return "The 'fields' parameter must include at least one field update.";
    }

    for (const field of params.fields) {
      const fieldReference = field.alias ?? field.name;
      if (!fieldReference || fieldReference.trim() === "") {
        return "Each PDF field update must include a non-empty 'name' or 'alias'.";
      }
    }

    const fileService = this.config.getFileService();
    if (fileService.shouldGeminiIgnoreFile(params.input_pdf_path)) {
      return `File path '${params.input_pdf_path}' is ignored by .qwenignore pattern(s).`;
    }
    if (fileService.shouldGeminiIgnoreFile(params.output_pdf_path)) {
      return `File path '${params.output_pdf_path}' is ignored by .qwenignore pattern(s).`;
    }

    try {
      if (fs.existsSync(params.output_pdf_path)) {
        const outputStats = fs.lstatSync(params.output_pdf_path);
        if (outputStats.isDirectory()) {
          return `Path is a directory, not a file: ${params.output_pdf_path}`;
        }
      }
    } catch (error) {
      return `Error accessing path properties for validation: ${params.output_pdf_path}. Reason: ${error instanceof Error ? error.message : String(error)}`;
    }

    return null;
  }

  protected createInvocation(
    params: FillPdfFormToolParams,
  ): ToolInvocation<FillPdfFormToolParams, ToolResult> {
    return new FillPdfFormToolInvocation(this.config, params);
  }
}
