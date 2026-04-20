/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from "node:path";
function createDependentAliases(index, prefix) {
    return {
        [`dependent_${index}_first_name`]: `${prefix}.f1_${31 + (index - 1)}[0]`,
        [`dependent_${index}_last_name`]: `${prefix.replace("Row1[0]", "Row2[0]")}.f1_${35 + (index - 1)}[0]`,
        [`dependent_${index}_ssn`]: `${prefix.replace("Row1[0]", "Row3[0]")}.f1_${39 + (index - 1)}[0]`,
        [`dependent_${index}_relationship`]: `${prefix.replace("Row1[0]", "Row4[0]")}.f1_${43 + (index - 1)}[0]`,
    };
}
const IRS_1040_2025_ALIASES = {
    taxpayer_first_name: "topmostSubform[0].Page1[0].f1_14[0]",
    taxpayer_last_name: "topmostSubform[0].Page1[0].f1_15[0]",
    taxpayer_ssn: "topmostSubform[0].Page1[0].f1_16[0]",
    spouse_first_name: "topmostSubform[0].Page1[0].f1_17[0]",
    spouse_last_name: "topmostSubform[0].Page1[0].f1_18[0]",
    spouse_ssn: "topmostSubform[0].Page1[0].f1_19[0]",
    home_address: "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_20[0]",
    apartment_number: "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_21[0]",
    city: "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_22[0]",
    state: "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_23[0]",
    zip_code: "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_24[0]",
    foreign_country: "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_25[0]",
    foreign_province: "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_26[0]",
    foreign_postal_code: "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_27[0]",
    main_home_in_us_more_than_half_year: "topmostSubform[0].Page1[0].c1_5[0]",
    presidential_election_you: "topmostSubform[0].Page1[0].c1_6[0]",
    presidential_election_spouse: "topmostSubform[0].Page1[0].c1_7[0]",
    filing_status_single: "topmostSubform[0].Page1[0].Checkbox_ReadOrder[0].c1_8[0]",
    filing_status_married_filing_jointly: "topmostSubform[0].Page1[0].Checkbox_ReadOrder[0].c1_8[1]",
    filing_status_married_filing_separately: "topmostSubform[0].Page1[0].Checkbox_ReadOrder[0].c1_8[2]",
    filing_status_head_of_household: "topmostSubform[0].Page1[0].c1_8[0]",
    filing_status_qualifying_surviving_spouse: "topmostSubform[0].Page1[0].c1_8[1]",
    mfs_spouse_full_name: "topmostSubform[0].Page1[0].Checkbox_ReadOrder[0].f1_28[0]",
    qualifying_child_name_for_hoh_or_qss: "topmostSubform[0].Page1[0].f1_29[0]",
    treat_nonresident_spouse_as_resident: "topmostSubform[0].Page1[0].c1_9[0]",
    nonresident_spouse_name: "topmostSubform[0].Page1[0].f1_30[0]",
    digital_assets_yes: "topmostSubform[0].Page1[0].c1_10[0]",
    digital_assets_no: "topmostSubform[0].Page1[0].c1_10[1]",
    line_1a: "topmostSubform[0].Page1[0].f1_47[0]",
    line_1b: "topmostSubform[0].Page1[0].f1_48[0]",
    line_1c: "topmostSubform[0].Page1[0].f1_49[0]",
    line_1d: "topmostSubform[0].Page1[0].f1_50[0]",
    line_1e: "topmostSubform[0].Page1[0].f1_51[0]",
    line_1f: "topmostSubform[0].Page1[0].f1_52[0]",
    line_1g: "topmostSubform[0].Page1[0].f1_53[0]",
    line_1h_description: "topmostSubform[0].Page1[0].f1_54[0]",
    line_1h: "topmostSubform[0].Page1[0].f1_55[0]",
    line_1i: "topmostSubform[0].Page1[0].f1_56[0]",
    line_1z: "topmostSubform[0].Page1[0].f1_57[0]",
    line_2a: "topmostSubform[0].Page1[0].f1_58[0]",
    line_2b: "topmostSubform[0].Page1[0].f1_59[0]",
    line_3a: "topmostSubform[0].Page1[0].f1_60[0]",
    line_3b: "topmostSubform[0].Page1[0].f1_61[0]",
    line_4a: "topmostSubform[0].Page1[0].f1_62[0]",
    line_4b: "topmostSubform[0].Page1[0].f1_63[0]",
    line_4c_rollover: "topmostSubform[0].Page1[0].c1_35[0]",
    line_4c_qcd: "topmostSubform[0].Page1[0].c1_36[0]",
    line_4c_other_checkbox: "topmostSubform[0].Page1[0].c1_37[0]",
    line_4c_other_value: "topmostSubform[0].Page1[0].f1_64[0]",
    line_5a: "topmostSubform[0].Page1[0].f1_65[0]",
    line_5b: "topmostSubform[0].Page1[0].f1_66[0]",
    line_5c_rollover: "topmostSubform[0].Page1[0].c1_38[0]",
    line_5c_pso: "topmostSubform[0].Page1[0].c1_39[0]",
    line_5c_other_checkbox: "topmostSubform[0].Page1[0].c1_40[0]",
    line_5c_other_value: "topmostSubform[0].Page1[0].f1_67[0]",
    line_6a: "topmostSubform[0].Page1[0].f1_68[0]",
    line_6b: "topmostSubform[0].Page1[0].f1_69[0]",
    line_6c_lump_sum_election: "topmostSubform[0].Page1[0].c1_41[0]",
    line_6d_mfs_lived_apart: "topmostSubform[0].Page1[0].c1_42[0]",
    line_7a: "topmostSubform[0].Page1[0].f1_70[0]",
    line_7b_schedule_d_not_required: "topmostSubform[0].Page1[0].c1_43[0]",
    line_7b_includes_child_capital_gain: "topmostSubform[0].Page1[0].c1_44[0]",
    line_7b_child_capital_gain_reference: "topmostSubform[0].Page1[0].f1_71[0]",
    line_8: "topmostSubform[0].Page1[0].f1_72[0]",
    line_9_total_income: "topmostSubform[0].Page1[0].f1_73[0]",
    line_10: "topmostSubform[0].Page1[0].f1_74[0]",
    line_11a_adjusted_gross_income: "topmostSubform[0].Page1[0].f1_75[0]",
    line_11b: "topmostSubform[0].Page2[0].f2_01[0]",
    line_12a_you_can_be_claimed_as_dependent: "topmostSubform[0].Page2[0].c2_1[0]",
    line_12a_spouse_can_be_claimed_as_dependent: "topmostSubform[0].Page2[0].c2_2[0]",
    line_12b: "topmostSubform[0].Page2[0].c2_3[0]",
    line_12c: "topmostSubform[0].Page2[0].c2_4[0]",
    line_12d_you_born_before_january_2_1961: "topmostSubform[0].Page2[0].c2_5[0]",
    line_12d_you_blind: "topmostSubform[0].Page2[0].c2_6[0]",
    line_12d_spouse_born_before_january_2_1961: "topmostSubform[0].Page2[0].c2_7[0]",
    line_12d_spouse_blind: "topmostSubform[0].Page2[0].c2_8[0]",
    line_12e: "topmostSubform[0].Page2[0].f2_02[0]",
    line_13a: "topmostSubform[0].Page2[0].f2_03[0]",
    line_13b: "topmostSubform[0].Page2[0].f2_04[0]",
    line_14: "topmostSubform[0].Page2[0].f2_05[0]",
    line_15_taxable_income: "topmostSubform[0].Page2[0].f2_06[0]",
    line_16_form_8814: "topmostSubform[0].Page2[0].c2_9[0]",
    line_16_form_4972: "topmostSubform[0].Page2[0].c2_10[0]",
    line_16_other_form_checkbox: "topmostSubform[0].Page2[0].c2_11[0]",
    line_16_other_form_value: "topmostSubform[0].Page2[0].f2_07[0]",
    line_16_tax: "topmostSubform[0].Page2[0].f2_08[0]",
    line_17: "topmostSubform[0].Page2[0].f2_09[0]",
    line_18: "topmostSubform[0].Page2[0].f2_10[0]",
    line_19: "topmostSubform[0].Page2[0].f2_11[0]",
    line_20: "topmostSubform[0].Page2[0].f2_12[0]",
    line_21: "topmostSubform[0].Page2[0].f2_13[0]",
    line_22: "topmostSubform[0].Page2[0].f2_14[0]",
    line_23: "topmostSubform[0].Page2[0].f2_15[0]",
    line_24_total_tax: "topmostSubform[0].Page2[0].f2_16[0]",
    line_25a: "topmostSubform[0].Page2[0].f2_17[0]",
    line_25b: "topmostSubform[0].Page2[0].f2_18[0]",
    line_25c: "topmostSubform[0].Page2[0].f2_19[0]",
    line_25d: "topmostSubform[0].Page2[0].f2_20[0]",
    line_26: "topmostSubform[0].Page2[0].f2_21[0]",
    line_27a_former_spouse_ssn: "topmostSubform[0].Page2[0].SSN_ReadOrder[0].f2_22[0]",
    line_27a: "topmostSubform[0].Page2[0].f2_23[0]",
    line_27b: "topmostSubform[0].Page2[0].c2_12[0]",
    line_27c: "topmostSubform[0].Page2[0].c2_13[0]",
    line_28_do_not_claim_actc: "topmostSubform[0].Page2[0].Line28_ReadOrder[0].c2_14[0]",
    line_28: "topmostSubform[0].Page2[0].f2_24[0]",
    line_29: "topmostSubform[0].Page2[0].f2_25[0]",
    line_30: "topmostSubform[0].Page2[0].f2_26[0]",
    line_31: "topmostSubform[0].Page2[0].f2_27[0]",
    line_32: "topmostSubform[0].Page2[0].f2_28[0]",
    line_33_total_payments: "topmostSubform[0].Page2[0].f2_29[0]",
    line_34_overpaid: "topmostSubform[0].Page2[0].f2_30[0]",
    line_35a_refund: "topmostSubform[0].Page2[0].f2_31[0]",
    line_35a_form_8888_attached: "topmostSubform[0].Page2[0].c2_15[0]",
    routing_number: "topmostSubform[0].Page2[0].RoutingNo[0].f2_32[0]",
    direct_deposit_checking: "topmostSubform[0].Page2[0].c2_16[0]",
    direct_deposit_savings: "topmostSubform[0].Page2[0].c2_16[1]",
    account_number: "topmostSubform[0].Page2[0].AccountNo[0].f2_33[0]",
    line_36_apply_to_2026_estimated_tax: "topmostSubform[0].Page2[0].f2_34[0]",
    line_37_amount_you_owe: "topmostSubform[0].Page2[0].f2_35[0]",
    line_38_estimated_tax_penalty: "topmostSubform[0].Page2[0].f2_36[0]",
    third_party_designee_no: "topmostSubform[0].Page2[0].c2_17[0]",
    third_party_designee_yes: "topmostSubform[0].Page2[0].c2_17[1]",
    third_party_designee_name: "topmostSubform[0].Page2[0].f2_37[0]",
    third_party_designee_phone: "topmostSubform[0].Page2[0].f2_38[0]",
    third_party_designee_pin: "topmostSubform[0].Page2[0].f2_39[0]",
    taxpayer_ip_pin: "topmostSubform[0].Page2[0].f2_41[0]",
    spouse_ip_pin: "topmostSubform[0].Page2[0].f2_43[0]",
    taxpayer_phone: "topmostSubform[0].Page2[0].f2_44[0]",
    taxpayer_email: "topmostSubform[0].Page2[0].f2_45[0]",
    paid_preparer_name: "topmostSubform[0].Page2[0].f2_46[0]",
    paid_preparer_ptin: "topmostSubform[0].Page2[0].f2_47[0]",
    paid_preparer_self_employed: "topmostSubform[0].Page2[0].c2_18[0]",
    paid_preparer_firm_name: "topmostSubform[0].Page2[0].f2_48[0]",
    paid_preparer_firm_phone: "topmostSubform[0].Page2[0].f2_49[0]",
    paid_preparer_firm_address: "topmostSubform[0].Page2[0].f2_50[0]",
    paid_preparer_firm_ein: "topmostSubform[0].Page2[0].f2_51[0]",
    ...createDependentAliases(1, "topmostSubform[0].Page1[0].Table_Dependents[0].Row1[0]"),
    ...createDependentAliases(2, "topmostSubform[0].Page1[0].Table_Dependents[0].Row1[0]"),
    ...createDependentAliases(3, "topmostSubform[0].Page1[0].Table_Dependents[0].Row1[0]"),
    ...createDependentAliases(4, "topmostSubform[0].Page1[0].Table_Dependents[0].Row1[0]"),
};
const DEPENDENT_FIELD_NAMES = [
    {
        lived_with_you_more_than_half_year: [12, 14, 16, 18],
        lived_in_us: [13, 15, 17, 19],
        full_time_student: [20, 22, 24, 26],
        permanently_disabled: [21, 23, 25, 27],
        child_tax_credit: [28, 29, 30, 31],
    },
];
for (let index = 1; index <= 4; index += 1) {
    const dependentPrefix = `topmostSubform[0].Page1[0].Table_Dependents[0].Row5[0].Dependent${index}[0]`;
    IRS_1040_2025_ALIASES[`dependent_${index}_lived_with_you_more_than_half_year`] = `${dependentPrefix}.c1_${DEPENDENT_FIELD_NAMES[0].lived_with_you_more_than_half_year[index - 1]}[0]`;
    IRS_1040_2025_ALIASES[`dependent_${index}_lived_in_us`] =
        `${dependentPrefix}.c1_${DEPENDENT_FIELD_NAMES[0].lived_in_us[index - 1]}[0]`;
    const row6Prefix = `topmostSubform[0].Page1[0].Table_Dependents[0].Row6[0].Dependent${index}[0]`;
    IRS_1040_2025_ALIASES[`dependent_${index}_full_time_student`] =
        `${row6Prefix}.c1_${DEPENDENT_FIELD_NAMES[0].full_time_student[index - 1]}[0]`;
    IRS_1040_2025_ALIASES[`dependent_${index}_permanently_disabled`] =
        `${row6Prefix}.c1_${DEPENDENT_FIELD_NAMES[0].permanently_disabled[index - 1]}[0]`;
    const row7Prefix = `topmostSubform[0].Page1[0].Table_Dependents[0].Row7[0].Dependent${index}[0]`;
    IRS_1040_2025_ALIASES[`dependent_${index}_child_tax_credit`] =
        `${row7Prefix}.c1_${DEPENDENT_FIELD_NAMES[0].child_tax_credit[index - 1]}[0]`;
    IRS_1040_2025_ALIASES[`dependent_${index}_credit_for_other_dependents`] =
        `${row7Prefix}.c1_${DEPENDENT_FIELD_NAMES[0].child_tax_credit[index - 1]}[1]`;
}
const PDF_FORM_PROFILES = {
    irs_1040_2025: {
        name: "irs_1040_2025",
        description: "Alias profile for the 2025 IRS Form 1040 sample included in the repository.",
        aliases: IRS_1040_2025_ALIASES,
    },
};
export function normalizePdfAlias(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}
export function getPdfFormProfile(profileName) {
    if (!profileName) {
        return undefined;
    }
    return PDF_FORM_PROFILES[profileName];
}
export function detectPdfFormProfile(filePath) {
    const normalizedBasename = path.basename(filePath).toLowerCase();
    if (normalizedBasename.includes("1040") && normalizedBasename.includes("2025")) {
        return PDF_FORM_PROFILES.irs_1040_2025;
    }
    return undefined;
}
export function getPdfFormProfileForFile(filePath, requestedProfile) {
    return getPdfFormProfile(requestedProfile) ?? detectPdfFormProfile(filePath);
}
export function buildAliasesByField(profile) {
    const aliasesByField = new Map();
    if (!profile) {
        return aliasesByField;
    }
    for (const [alias, fieldName] of Object.entries(profile.aliases)) {
        const normalizedAlias = normalizePdfAlias(alias);
        const aliases = aliasesByField.get(fieldName) ?? [];
        aliases.push(normalizedAlias);
        aliasesByField.set(fieldName, aliases);
    }
    for (const aliases of aliasesByField.values()) {
        aliases.sort((left, right) => left.localeCompare(right));
    }
    return aliasesByField;
}
export function resolvePdfFieldAlias(profile, fieldReference) {
    if (!profile) {
        return undefined;
    }
    return profile.aliases[normalizePdfAlias(fieldReference)];
}
//# sourceMappingURL=pdf-form-profiles.js.map