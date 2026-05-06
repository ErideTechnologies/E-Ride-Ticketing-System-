import { pgEnum } from "drizzle-orm/pg-core";

export const organisationStatuses = ["active", "inactive"] as const;
export type OrganisationStatus = (typeof organisationStatuses)[number];
export const organisationStatusEnum = pgEnum(
  "organisation_status",
  organisationStatuses,
);

export const publicTicketStatuses = [
  "received",
  "under_review",
  "more_info_needed",
  "being_fixed",
  "fixed",
  "resolved",
  "closed",
] as const;
export type PublicTicketStatus = (typeof publicTicketStatuses)[number];
export const publicTicketStatusEnum = pgEnum(
  "public_ticket_status",
  publicTicketStatuses,
);

export const internalTicketStatuses = [
  "new",
  "triage_required",
  "support_review",
  "needs_user_info",
  "engineering_escalation_required",
  "linear_created",
  "in_engineering",
  "in_review",
  "in_qa_verification",
  "fixed_waiting_user_notification",
  "user_notified",
  "resolved",
  "closed",
  "duplicate",
  "not_a_bug",
  "deferred",
  "spam",
] as const;
export type InternalTicketStatus = (typeof internalTicketStatuses)[number];
export const internalTicketStatusEnum = pgEnum(
  "internal_ticket_status",
  internalTicketStatuses,
);

export const ticketCategories = [
  "technical_bug",
  "account_login_issue",
  "otp_verification_issue",
  "document_upload_issue",
  "application_flow_confusion",
  "payment_issue",
  "b2b_firm_admin_issue",
  "consultant_issue",
  "partner_issue",
  "feature_request",
  "complaint",
  "data_correction_request",
  "security_privacy_concern",
  "performance_issue",
  "system_downtime",
  "general_support",
] as const;
export type TicketCategory = (typeof ticketCategories)[number];
export const ticketCategoryEnum = pgEnum("ticket_category", ticketCategories);

export const ticketPriorities = ["urgent", "high", "medium", "low"] as const;
export type TicketPriority = (typeof ticketPriorities)[number];
export const ticketPriorityEnum = pgEnum("ticket_priority", ticketPriorities);

export const ticketSeverities = [
  "critical",
  "major",
  "moderate",
  "minor",
  "cosmetic",
] as const;
export type TicketSeverity = (typeof ticketSeverities)[number];
export const ticketSeverityEnum = pgEnum("ticket_severity", ticketSeverities);

export const messageDirections = ["outbound", "inbound", "internal"] as const;
export type MessageDirection = (typeof messageDirections)[number];
export const messageDirectionEnum = pgEnum(
  "support_message_direction",
  messageDirections,
);

export const messageChannels = [
  "email",
  "whatsapp",
  "phone",
  "in_app",
  "manual",
  "internal_note",
] as const;
export type MessageChannel = (typeof messageChannels)[number];
export const messageChannelEnum = pgEnum(
  "support_message_channel",
  messageChannels,
);

export const messageTypes = [
  "ticket_received",
  "under_review",
  "more_info_needed",
  "escalated_to_engineering",
  "fixed",
  "resolved",
  "closed",
  "reopened",
  "custom",
  "user_reply",
  "internal_update",
] as const;
export type MessageType = (typeof messageTypes)[number];
export const messageTypeEnum = pgEnum("support_message_type", messageTypes);

export const messageDeliveryStatuses = [
  "drafted",
  "copied",
  "sent_manual",
  "received",
  "failed",
  "not_applicable",
] as const;
export type MessageDeliveryStatus = (typeof messageDeliveryStatuses)[number];
export const messageDeliveryStatusEnum = pgEnum(
  "support_message_delivery_status",
  messageDeliveryStatuses,
);
