/**
 * English — plain, not enterprise jargon. "Add Staff", never "Create
 * Personnel Record". Sentence case for labels and buttons.
 *
 * Terms follow GLOSSARY.md; don't invent synonyms mid-way.
 *
 * The type comes from id.ts, so a missing or misspelled key is a build
 * error rather than raw text leaking onto a user's screen.
 */

import type { Messages } from "./id";

export const en: Messages = {
  common: {
    appName: "SANCI Partner Hub",
    // Buttons & actions
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    add: "Add",
    search: "Search",
    back: "Back",
    close: "Close",
    retry: "Try again",
    activate: "Activate",
    deactivate: "Deactivate",
    saving: "Saving…",
    loading: "Loading…",
    // Common statuses
    statusActive: "Active",
    statusInactive: "Inactive",
    statusDraft: "Draft",
    statusSuspended: "Suspended",
    // Page states
    emptyDefault: "Nothing here yet.",
    errorLoad: "Could not load the data. Reload the page to try again.",
    errorSection: "This section failed to load — reload the page.",
    required: "Required",
    optional: "Optional",
    yes: "Yes",
    no: "No",
    // Core terms (see GLOSSARY.md)
    partner: "Partner",
    branch: "Branch",
    staff: "Staff",
    account: "Account",
    customer: "Customer",
    order: "Order",
    orderNumber: "Order no.",
    package: "Package",
    product: "Product",
    catalog: "Catalog",
    activity: "Activity",
    reason: "Reason",
    notes: "Notes",
    phone: "Phone",
    whatsapp: "WhatsApp",
    address: "Address",
    city: "City",
    province: "Province",
    name: "Name",
    fullName: "Full name",
    code: "Code",
    createdAt: "Created",
    serverTime: "server time",
    language: "Language",
  },
};
