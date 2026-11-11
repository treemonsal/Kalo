import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  owner: text("owner").primaryKey().notNull(),
  revision: integer("revision").notNull(),
  payload: text("payload").notNull(),
});
