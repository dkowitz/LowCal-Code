/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import AjvPkg from "ajv";
import * as addFormats from "ajv-formats";
function getDefaultExport(module) {
    const candidate = module;
    if (typeof candidate === "object" &&
        candidate !== null &&
        "default" in candidate &&
        candidate.default !== undefined) {
        return candidate.default;
    }
    return module;
}
const AjvClass = getDefaultExport(AjvPkg);
const ajValidator = new AjvClass({ coerceTypes: true });
const addFormatsFunc = getDefaultExport(addFormats);
addFormatsFunc(ajValidator);
/**
 * Simple utility to validate objects against JSON Schemas
 */
export class SchemaValidator {
    /**
     * Returns null if the data confroms to the schema described by schema (or if schema
     *  is null). Otherwise, returns a string describing the error.
     */
    static validate(schema, data) {
        if (!schema) {
            return null;
        }
        if (typeof data !== "object" || data === null) {
            return "Value of params must be an object";
        }
        const validate = ajValidator.compile(schema);
        const valid = validate(data);
        if (!valid && validate.errors) {
            // Find any True or False values and lowercase them
            fixBooleanCasing(data);
            const validate = ajValidator.compile(schema);
            const valid = validate(data);
            if (!valid && validate.errors) {
                return ajValidator.errorsText(validate.errors, { dataVar: "params" });
            }
        }
        return null;
    }
}
function fixBooleanCasing(data) {
    for (const key of Object.keys(data)) {
        if (!(key in data))
            continue;
        if (typeof data[key] === "object") {
            fixBooleanCasing(data[key]);
        }
        else if (data[key] === "True")
            data[key] = "true";
        else if (data[key] === "False")
            data[key] = "false";
    }
}
//# sourceMappingURL=schemaValidator.js.map