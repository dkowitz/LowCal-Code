/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire as createNodeRequire } from "node:module";
import { pathToFileURL } from "node:url";
// eslint-disable-next-line import/no-internal-modules -- pdfjs-dist requires the legacy Node build for form access and save support.
import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";
import { safeJsonStringify } from "../utils/safeJsonStringify.js";
import {
  buildAliasesByField,
  getPdfFormProfileForFile,
  resolvePdfFieldAlias,
} from "./pdf-form-profiles.js";

const require = createNodeRequire(import.meta.url);
const pdfJsPackageJsonPath = require.resolve("pdfjs-dist/package.json");
const standardFontDataUrl = pathToFileURL(
  path.join(path.dirname(pdfJsPackageJsonPath), "standard_fonts/"),
).href;

type PdfFieldValue = string | number | boolean;

interface PdfFieldObject {
  id: string;
  name: string;
  type: string;
  value?: unknown;
  defaultValue?: unknown;
  exportValues?: string | string[];
  editable?: boolean;
  hidden?: boolean;
  page?: number;
  rect?: number[];
  charLimit?: number;
  comb?: boolean;
  multiline?: boolean;
  password?: boolean;
}

export interface PdfFormFieldSummary {
  name: string;
  type: string;
  widgetCount: number;
  pageNumbers: number[];
  value: unknown;
  defaultValue: unknown;
  exportValues?: string[];
  charLimit?: number;
  comb?: boolean;
  multiline?: boolean;
  hidden: boolean;
  knownAliases?: string[];
  widgets: Array<{
    id: string;
    page: number | null;
    value: unknown;
    exportValues?: string[];
    rect?: number[];
  }>;
}

export interface PdfFormFillRequest {
  name?: string;
  alias?: string;
  value: PdfFieldValue;
}

export interface PdfFormFillResult {
  filledFields: Array<{
    requestedField: string;
    resolvedFieldName: string;
    type: string;
    widgetCount: number;
    writtenValue: string;
  }>;
  missingFields: string[];
  outputBytes: Uint8Array;
}

function getPdfLoadingTask(filePath: string) {
  return fs.readFile(filePath).then((data) =>
    getDocument({
      data: new Uint8Array(data),
      standardFontDataUrl,
      verbosity: VerbosityLevel.ERRORS,
    }),
  );
}

function isFillableField(
  field: PdfFieldObject | undefined,
): field is PdfFieldObject {
  return Boolean(field?.id && field.name && field.type);
}

function normalizeExportValues(
  exportValues: string | string[] | undefined,
): string[] | undefined {
  if (Array.isArray(exportValues)) {
    return exportValues;
  }
  if (typeof exportValues === "string" && exportValues.length > 0) {
    return [exportValues];
  }
  return undefined;
}

function toPageNumber(page: number | undefined): number | null {
  return typeof page === "number" && page >= 0 ? page + 1 : null;
}

function getFillableWidgets(
  fieldObjects: Record<string, PdfFieldObject[]> | null,
  fieldName: string,
): PdfFieldObject[] {
  const widgets = fieldObjects?.[fieldName] ?? [];
  return widgets.filter(isFillableField);
}

function getToggleValue(
  exportValues: string[] | undefined,
  rawValue: PdfFieldValue,
): string {
  const onValue = exportValues?.[0] ?? "Yes";

  if (typeof rawValue === "boolean") {
    return rawValue ? onValue : "Off";
  }

  if (typeof rawValue === "number") {
    return rawValue === 0 ? "Off" : onValue;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  if (
    normalizedValue === "" ||
    normalizedValue === "off" ||
    normalizedValue === "false" ||
    normalizedValue === "0" ||
    normalizedValue === "no" ||
    normalizedValue === "unchecked"
  ) {
    return "Off";
  }
  if (
    normalizedValue === "on" ||
    normalizedValue === "true" ||
    normalizedValue === "1" ||
    normalizedValue === "yes" ||
    normalizedValue === "checked"
  ) {
    return onValue;
  }
  return rawValue;
}

function getWrittenValue(
  widgets: PdfFieldObject[],
  rawValue: PdfFieldValue,
): string {
  const type = widgets[0]?.type;
  if (type === "checkbox" || type === "radiobutton") {
    return getToggleValue(normalizeExportValues(widgets[0]?.exportValues), rawValue);
  }
  return String(rawValue);
}

export async function inspectPdfFormFields(
  filePath: string,
  requestedProfile?: string,
): Promise<PdfFormFieldSummary[]> {
  const loadingTask = await getPdfLoadingTask(filePath);

  try {
    const document = await loadingTask.promise;
    const fieldObjects =
      (await document.getFieldObjects()) as Record<string, PdfFieldObject[]> | null;
    const aliasesByField = buildAliasesByField(
      getPdfFormProfileForFile(filePath, requestedProfile),
    );
    const summaries: PdfFormFieldSummary[] = [];

    for (const [name, widgets] of Object.entries(fieldObjects ?? {})) {
      const fillableWidgets = widgets.filter(isFillableField);
      if (fillableWidgets.length === 0) {
        continue;
      }

      const firstWidget = fillableWidgets[0];
      const normalizedExportValues = [
        ...new Set(
          fillableWidgets.flatMap(
            (widget) => normalizeExportValues(widget.exportValues) ?? [],
          ),
        ),
      ];

      summaries.push({
        name,
        type: firstWidget.type,
        widgetCount: fillableWidgets.length,
        pageNumbers: [
          ...new Set(
            fillableWidgets
              .map((widget) => toPageNumber(widget.page))
              .filter((page): page is number => page !== null),
          ),
        ],
        value:
          fillableWidgets.length === 1
            ? firstWidget.value ?? ""
            : fillableWidgets.map((widget) => widget.value ?? ""),
        defaultValue:
          fillableWidgets.length === 1
            ? firstWidget.defaultValue ?? ""
            : fillableWidgets.map((widget) => widget.defaultValue ?? ""),
        exportValues:
          normalizedExportValues.length > 0 ? normalizedExportValues : undefined,
        charLimit: firstWidget.charLimit,
        comb: firstWidget.comb,
        multiline: firstWidget.multiline,
        hidden: fillableWidgets.every((widget) => widget.hidden === true),
        knownAliases: aliasesByField.get(name),
        widgets: fillableWidgets.map((widget) => ({
          id: widget.id,
          page: toPageNumber(widget.page),
          value: widget.value ?? "",
          exportValues: normalizeExportValues(widget.exportValues),
          rect: widget.rect,
        })),
      });
    }

    return summaries.sort((left, right) => left.name.localeCompare(right.name));
  } finally {
    await loadingTask.destroy();
  }
}

export async function fillPdfFormFields(
  inputPdfPath: string,
  requestedFields: PdfFormFillRequest[],
  requestedProfile?: string,
): Promise<PdfFormFillResult> {
  const loadingTask = await getPdfLoadingTask(inputPdfPath);

  try {
    const document = await loadingTask.promise;
    const fieldObjects =
      (await document.getFieldObjects()) as Record<string, PdfFieldObject[]> | null;
    const profile = getPdfFormProfileForFile(inputPdfPath, requestedProfile);

    const filledFields: PdfFormFillResult["filledFields"] = [];
    const missingFields: string[] = [];

    for (const requestedField of requestedFields) {
      const requestedReference = requestedField.alias ?? requestedField.name ?? "";
      const resolvedFieldName =
        fieldObjects?.[requestedReference] !== undefined
          ? requestedReference
          : resolvePdfFieldAlias(profile, requestedReference) ?? requestedReference;
      const widgets = getFillableWidgets(fieldObjects, resolvedFieldName);
      if (widgets.length === 0) {
        missingFields.push(requestedReference);
        continue;
      }

      const writtenValue = getWrittenValue(widgets, requestedField.value);
      for (const widget of widgets) {
        document.annotationStorage.setValue(widget.id, {
          value:
            widget.type === "checkbox" || widget.type === "radiobutton"
              ? getToggleValue(
                  normalizeExportValues(widget.exportValues),
                  requestedField.value,
                )
              : String(requestedField.value),
        });
      }

      filledFields.push({
        requestedField: requestedReference,
        resolvedFieldName,
        type: widgets[0].type,
        widgetCount: widgets.length,
        writtenValue,
      });
    }

    return {
      filledFields,
      missingFields,
      outputBytes: await document.saveDocument(),
    };
  } finally {
    await loadingTask.destroy();
  }
}

export function formatPdfFormInspection(
  filePath: string,
  fields: PdfFormFieldSummary[],
  requestedProfile?: string,
): string {
  const profile = getPdfFormProfileForFile(filePath, requestedProfile);
  return safeJsonStringify(
    {
      file_path: filePath,
      form_profile: profile?.name ?? null,
      field_count: fields.length,
      fields,
    },
    2,
  );
}

export function formatPdfFormFillResult(
  inputPdfPath: string,
  outputPdfPath: string,
  fillResult: Omit<PdfFormFillResult, "outputBytes">,
  requestedProfile?: string,
): string {
  const profile = getPdfFormProfileForFile(inputPdfPath, requestedProfile);
  return safeJsonStringify(
    {
      input_pdf_path: inputPdfPath,
      output_pdf_path: outputPdfPath,
      form_profile: profile?.name ?? null,
      filled_field_count: fillResult.filledFields.length,
      missing_field_count: fillResult.missingFields.length,
      filled_fields: fillResult.filledFields,
      missing_fields: fillResult.missingFields,
    },
    2,
  );
}
