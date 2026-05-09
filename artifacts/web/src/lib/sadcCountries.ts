import type { Country } from "react-phone-number-input";

/**
 * Southern African Development Community (SADC) member states. Pinned to the
 * top of the country picker on the public report-a-problem form because the
 * majority of Eride users are based in this region.
 */
export const SADC_COUNTRIES: Country[] = [
  "ZA", // South Africa
  "AO", // Angola
  "BW", // Botswana
  "KM", // Comoros
  "CD", // DR Congo
  "SZ", // Eswatini
  "LS", // Lesotho
  "MG", // Madagascar
  "MW", // Malawi
  "MU", // Mauritius
  "MZ", // Mozambique
  "NA", // Namibia
  "SC", // Seychelles
  "TZ", // Tanzania
  "ZM", // Zambia
  "ZW", // Zimbabwe
];

/**
 * Order passed to react-phone-number-input's `countryOptionsOrder`: SADC
 * states first, a divider, then everything else in alphabetical order
 * (the library's default for unspecified entries).
 */
export const COUNTRY_OPTIONS_ORDER: (Country | "|" | "...")[] = [
  ...SADC_COUNTRIES,
  "|",
  "...",
];
