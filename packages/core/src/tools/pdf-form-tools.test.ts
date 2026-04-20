/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "../config/config.js";
import { FileDiscoveryService } from "../services/fileDiscoveryService.js";
import { createMockWorkspaceContext } from "../test-utils/mockWorkspaceContext.js";
import { FillPdfFormTool } from "./fill-pdf-form.js";
import { InspectPdfFormTool } from "./inspect-pdf-form.js";
import { inspectPdfFormFields } from "./pdf-form-utils.js";
import { ToolErrorType } from "./tool-error.js";
import type { ToolInvocation, ToolResult } from "./tools.js";
import type { FillPdfFormToolParams } from "./fill-pdf-form.js";
import type { InspectPdfFormToolParams } from "./inspect-pdf-form.js";

const fixtureSourcePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "testdata",
  "2025_Form_1040.pdf",
);

describe("PDF form tools", () => {
  let tempRootDir: string;
  let inputPdfPath: string;
  let inspectTool: InspectPdfFormTool;
  let fillTool: FillPdfFormTool;
  const abortSignal = new AbortController().signal;

  beforeEach(async () => {
    tempRootDir = await fsp.mkdtemp(path.join(os.tmpdir(), "pdf-form-tool-"));
    inputPdfPath = path.join(tempRootDir, "2025_Form_1040.pdf");
    await fsp.copyFile(fixtureSourcePath, inputPdfPath);

    const mockConfigInstance = {
      getFileService: () => new FileDiscoveryService(tempRootDir),
      getTargetDir: () => tempRootDir,
      getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
    } as unknown as Config;

    inspectTool = new InspectPdfFormTool(mockConfigInstance);
    fillTool = new FillPdfFormTool(mockConfigInstance);
  });

  afterEach(async () => {
    if (fs.existsSync(tempRootDir)) {
      await fsp.rm(tempRootDir, { recursive: true, force: true });
    }
  });

  it("inspects editable fields in the IRS 1040 fixture", async () => {
    const invocation = inspectTool.build({
      absolute_path: inputPdfPath,
    }) as ToolInvocation<InspectPdfFormToolParams, ToolResult>;

    const result = await invocation.execute(abortSignal);

    expect(result.error).toBeUndefined();
    expect(result.returnDisplay).toBe("Found 199 editable PDF form fields.");
    expect(typeof result.llmContent).toBe("string");

    const payload = JSON.parse(result.llmContent as string);
    expect(payload.field_count).toBe(199);
    expect(payload.form_profile).toBe("irs_1040_2025");

    const nameField = payload.fields.find(
      (field: { name: string }) =>
        field.name === "topmostSubform[0].Page1[0].f1_01[0]",
    );
    expect(nameField).toMatchObject({
      type: "text",
      widgetCount: 1,
      pageNumbers: [1],
    });

    const ssnField = payload.fields.find(
      (field: { name: string }) =>
        field.name === "topmostSubform[0].Page1[0].f1_16[0]",
    );
    expect(ssnField).toMatchObject({
      type: "text",
      charLimit: 9,
      comb: true,
    });

    const filingStatusField = payload.fields.find(
      (field: { name: string }) =>
        field.name === "topmostSubform[0].Page1[0].c1_1[0]",
    );
    expect(filingStatusField).toMatchObject({
      type: "checkbox",
      exportValues: ["1"],
    });

    const taxpayerFirstNameField = payload.fields.find(
      (field: { name: string }) =>
        field.name === "topmostSubform[0].Page1[0].f1_14[0]",
    );
    expect(taxpayerFirstNameField.knownAliases).toContain("taxpayer_first_name");
  });

  it("fills text and checkbox fields and persists the updated PDF", async () => {
    const outputPdfPath = path.join(tempRootDir, "filled-2025_Form_1040.pdf");
    const invocation = fillTool.build({
      input_pdf_path: inputPdfPath,
      output_pdf_path: outputPdfPath,
      fields: [
        {
          name: "topmostSubform[0].Page1[0].f1_01[0]",
          value: "Ada",
        },
        {
          name: "topmostSubform[0].Page1[0].f1_16[0]",
          value: "123456789",
        },
        {
          name: "topmostSubform[0].Page1[0].c1_1[0]",
          value: true,
        },
      ],
    }) as ToolInvocation<FillPdfFormToolParams, ToolResult>;

    const result = await invocation.execute(abortSignal);

    expect(result.error).toBeUndefined();
    expect(result.returnDisplay).toContain("Filled 3 PDF form fields");
    expect(fs.existsSync(outputPdfPath)).toBe(true);

    const fields = await inspectPdfFormFields(outputPdfPath);
    const fieldsByName = new Map(fields.map((field) => [field.name, field]));

    expect(fieldsByName.get("topmostSubform[0].Page1[0].f1_01[0]")?.value).toBe(
      "Ada",
    );
    expect(fieldsByName.get("topmostSubform[0].Page1[0].f1_16[0]")?.value).toBe(
      "123456789",
    );
    expect(fieldsByName.get("topmostSubform[0].Page1[0].c1_1[0]")?.value).toBe(
      "1",
    );
  });

  it("fills the IRS 1040 using friendly aliases from the auto-detected profile", async () => {
    const outputPdfPath = path.join(tempRootDir, "filled-by-alias-1040.pdf");
    const invocation = fillTool.build({
      input_pdf_path: inputPdfPath,
      output_pdf_path: outputPdfPath,
      fields: [
        {
          alias: "taxpayer_first_name",
          value: "Grace",
        },
        {
          alias: "taxpayer_last_name",
          value: "Hopper",
        },
        {
          alias: "filing_status_single",
          value: true,
        },
        {
          alias: "line_1a",
          value: "50000",
        },
        {
          alias: "routing_number",
          value: "123456789",
        },
      ],
    }) as ToolInvocation<FillPdfFormToolParams, ToolResult>;

    const result = await invocation.execute(abortSignal);
    expect(result.error).toBeUndefined();

    const payload = JSON.parse(result.llmContent as string);
    expect(payload.form_profile).toBe("irs_1040_2025");

    const fields = await inspectPdfFormFields(outputPdfPath);
    const fieldsByName = new Map(fields.map((field) => [field.name, field]));
    expect(fieldsByName.get("topmostSubform[0].Page1[0].f1_14[0]")?.value).toBe(
      "Grace",
    );
    expect(fieldsByName.get("topmostSubform[0].Page1[0].f1_15[0]")?.value).toBe(
      "Hopper",
    );
    expect(
      fieldsByName.get(
        "topmostSubform[0].Page1[0].Checkbox_ReadOrder[0].c1_8[0]",
      )?.value,
    ).toBe("1");
    expect(fieldsByName.get("topmostSubform[0].Page1[0].f1_47[0]")?.value).toBe(
      "50000",
    );
    expect(
      fieldsByName.get("topmostSubform[0].Page2[0].RoutingNo[0].f2_32[0]")?.value,
    ).toBe("123456789");
  });

  it("returns a validation-style error when a requested field is missing", async () => {
    const outputPdfPath = path.join(tempRootDir, "missing-field.pdf");
    const invocation = fillTool.build({
      input_pdf_path: inputPdfPath,
      output_pdf_path: outputPdfPath,
      fields: [
        {
          name: "not_a_real_field",
          value: "x",
        },
      ],
    }) as ToolInvocation<FillPdfFormToolParams, ToolResult>;

    const result = await invocation.execute(abortSignal);

    expect(result.error?.type).toBe(ToolErrorType.INVALID_TOOL_PARAMS);
    expect(result.returnDisplay).toBe("Requested PDF fields were not found.");
    expect(fs.existsSync(outputPdfPath)).toBe(false);
  });
});
