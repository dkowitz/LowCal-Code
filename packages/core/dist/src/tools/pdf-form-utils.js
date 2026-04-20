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
import { buildAliasesByField, getPdfFormProfileForFile, resolvePdfFieldAlias, } from "./pdf-form-profiles.js";
const require = createNodeRequire(import.meta.url);
const pdfJsPackageJsonPath = require.resolve("pdfjs-dist/package.json");
const standardFontDataUrl = pathToFileURL(path.join(path.dirname(pdfJsPackageJsonPath), "standard_fonts/")).href;
function getPdfLoadingTask(filePath) {
    return fs.readFile(filePath).then((data) => getDocument({
        data: new Uint8Array(data),
        standardFontDataUrl,
        verbosity: VerbosityLevel.ERRORS,
    }));
}
function isFillableField(field) {
    return Boolean(field?.id && field.name && field.type);
}
function normalizeExportValues(exportValues) {
    if (Array.isArray(exportValues)) {
        return exportValues;
    }
    if (typeof exportValues === "string" && exportValues.length > 0) {
        return [exportValues];
    }
    return undefined;
}
function toPageNumber(page) {
    return typeof page === "number" && page >= 0 ? page + 1 : null;
}
function getFillableWidgets(fieldObjects, fieldName) {
    const widgets = fieldObjects?.[fieldName] ?? [];
    return widgets.filter(isFillableField);
}
function getToggleValue(exportValues, rawValue) {
    const onValue = exportValues?.[0] ?? "Yes";
    if (typeof rawValue === "boolean") {
        return rawValue ? onValue : "Off";
    }
    if (typeof rawValue === "number") {
        return rawValue === 0 ? "Off" : onValue;
    }
    const normalizedValue = rawValue.trim().toLowerCase();
    if (normalizedValue === "" ||
        normalizedValue === "off" ||
        normalizedValue === "false" ||
        normalizedValue === "0" ||
        normalizedValue === "no" ||
        normalizedValue === "unchecked") {
        return "Off";
    }
    if (normalizedValue === "on" ||
        normalizedValue === "true" ||
        normalizedValue === "1" ||
        normalizedValue === "yes" ||
        normalizedValue === "checked") {
        return onValue;
    }
    return rawValue;
}
function getWrittenValue(widgets, rawValue) {
    const type = widgets[0]?.type;
    if (type === "checkbox" || type === "radiobutton") {
        return getToggleValue(normalizeExportValues(widgets[0]?.exportValues), rawValue);
    }
    return String(rawValue);
}
export async function inspectPdfFormFields(filePath, requestedProfile) {
    const loadingTask = await getPdfLoadingTask(filePath);
    try {
        const document = await loadingTask.promise;
        const fieldObjects = (await document.getFieldObjects());
        const aliasesByField = buildAliasesByField(getPdfFormProfileForFile(filePath, requestedProfile));
        const summaries = [];
        for (const [name, widgets] of Object.entries(fieldObjects ?? {})) {
            const fillableWidgets = widgets.filter(isFillableField);
            if (fillableWidgets.length === 0) {
                continue;
            }
            const firstWidget = fillableWidgets[0];
            const normalizedExportValues = [
                ...new Set(fillableWidgets.flatMap((widget) => normalizeExportValues(widget.exportValues) ?? [])),
            ];
            summaries.push({
                name,
                type: firstWidget.type,
                widgetCount: fillableWidgets.length,
                pageNumbers: [
                    ...new Set(fillableWidgets
                        .map((widget) => toPageNumber(widget.page))
                        .filter((page) => page !== null)),
                ],
                value: fillableWidgets.length === 1
                    ? firstWidget.value ?? ""
                    : fillableWidgets.map((widget) => widget.value ?? ""),
                defaultValue: fillableWidgets.length === 1
                    ? firstWidget.defaultValue ?? ""
                    : fillableWidgets.map((widget) => widget.defaultValue ?? ""),
                exportValues: normalizedExportValues.length > 0 ? normalizedExportValues : undefined,
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
    }
    finally {
        await loadingTask.destroy();
    }
}
export async function fillPdfFormFields(inputPdfPath, requestedFields, requestedProfile) {
    const loadingTask = await getPdfLoadingTask(inputPdfPath);
    try {
        const document = await loadingTask.promise;
        const fieldObjects = (await document.getFieldObjects());
        const profile = getPdfFormProfileForFile(inputPdfPath, requestedProfile);
        const filledFields = [];
        const missingFields = [];
        for (const requestedField of requestedFields) {
            const requestedReference = requestedField.alias ?? requestedField.name ?? "";
            const resolvedFieldName = fieldObjects?.[requestedReference] !== undefined
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
                    value: widget.type === "checkbox" || widget.type === "radiobutton"
                        ? getToggleValue(normalizeExportValues(widget.exportValues), requestedField.value)
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
    }
    finally {
        await loadingTask.destroy();
    }
}
export function formatPdfFormInspection(filePath, fields, requestedProfile) {
    const profile = getPdfFormProfileForFile(filePath, requestedProfile);
    return safeJsonStringify({
        file_path: filePath,
        form_profile: profile?.name ?? null,
        field_count: fields.length,
        fields,
    }, 2);
}
export function formatPdfFormFillResult(inputPdfPath, outputPdfPath, fillResult, requestedProfile) {
    const profile = getPdfFormProfileForFile(inputPdfPath, requestedProfile);
    return safeJsonStringify({
        input_pdf_path: inputPdfPath,
        output_pdf_path: outputPdfPath,
        form_profile: profile?.name ?? null,
        filled_field_count: fillResult.filledFields.length,
        missing_field_count: fillResult.missingFields.length,
        filled_fields: fillResult.filledFields,
        missing_fields: fillResult.missingFields,
    }, 2);
}
//# sourceMappingURL=pdf-form-utils.js.map