import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { supportTicketsTable } from "./tickets";

export const supportTicketAttachmentsTable = pgTable(
  "support_ticket_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supportTicketId: uuid("support_ticket_id")
      .notNull()
      .references(() => supportTicketsTable.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    originalFileName: text("original_file_name").notNull(),
    fileType: text("file_type").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull(),
    storagePath: text("storage_path").notNull(),
    uploadedByName: text("uploaded_by_name"),
    uploadedByEmail: text("uploaded_by_email"),
    uploadedByRole: text("uploaded_by_role"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type SupportTicketAttachment =
  typeof supportTicketAttachmentsTable.$inferSelect;
