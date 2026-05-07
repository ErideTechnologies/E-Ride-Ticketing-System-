import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { supportTicketsTable } from "./tickets";
import {
  internalTicketStatusEnum,
  messageChannelEnum,
  messageDeliveryStatusEnum,
  messageDirectionEnum,
  messageTypeEnum,
  publicTicketStatusEnum,
} from "./enums";

export const supportTicketMessagesTable = pgTable("support_ticket_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  supportTicketId: uuid("support_ticket_id")
    .notNull()
    .references(() => supportTicketsTable.id, { onDelete: "cascade" }),
  direction: messageDirectionEnum("direction").notNull(),
  channel: messageChannelEnum("channel").notNull(),
  messageType: messageTypeEnum("message_type").notNull(),
  senderName: text("sender_name"),
  senderRole: text("sender_role"),
  recipientName: text("recipient_name"),
  recipientEmail: text("recipient_email"),
  recipientWhatsapp: text("recipient_whatsapp"),
  messageBody: text("message_body").notNull(),
  deliveryStatus: messageDeliveryStatusEnum("delivery_status").notNull(),
  relatedPublicStatus: publicTicketStatusEnum("related_public_status"),
  relatedInternalStatus: internalTicketStatusEnum("related_internal_status"),
  providerMessageId: text("provider_message_id"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SupportTicketMessage =
  typeof supportTicketMessagesTable.$inferSelect;
