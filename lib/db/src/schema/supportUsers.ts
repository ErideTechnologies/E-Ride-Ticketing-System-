import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const supportUsersTable = pgTable(
  "support_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name").notNull(),
    surname: text("surname").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("support_admin"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("support_users_email_unique").on(t.email)],
);

export const insertSupportUserSchema = createInsertSchema(
  supportUsersTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSupportUser = z.infer<typeof insertSupportUserSchema>;
export type SupportUser = typeof supportUsersTable.$inferSelect;