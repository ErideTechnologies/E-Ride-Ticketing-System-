import { and, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { supportProductsTable } from "./schema/products";
import { supportTicketSequencesTable } from "./schema/tickets";

/**
 * Atomically allocates the next ticket reference for the given
 * organisation + product + current year. Format:
 *
 *   PRODUCTCODE-SUP-YYYY-NNNNNN
 *
 * Example: `EMA-SUP-2026-000001`.
 *
 * The sequence is scoped per organisationId + productId + year, so each
 * organisation/product pair restarts numbering at 1 each calendar year.
 */
export async function generateSupportTicketReference(
  organisationId: string,
  productId: string,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getUTCFullYear();

  const product = await db.query.supportProductsTable.findFirst({
    where: and(
      eq(supportProductsTable.id, productId),
      eq(supportProductsTable.organisationId, organisationId),
    ),
  });

  if (!product) {
    throw new Error(
      `Product ${productId} not found for organisation ${organisationId}`,
    );
  }

  const [row] = await db
    .insert(supportTicketSequencesTable)
    .values({
      organisationId,
      productId,
      year,
      lastSequence: 1,
    })
    .onConflictDoUpdate({
      target: [
        supportTicketSequencesTable.organisationId,
        supportTicketSequencesTable.productId,
        supportTicketSequencesTable.year,
      ],
      set: {
        lastSequence: sql`${supportTicketSequencesTable.lastSequence} + 1`,
      },
    })
    .returning({ lastSequence: supportTicketSequencesTable.lastSequence });

  const sequence = String(row.lastSequence).padStart(6, "0");
  return `${product.productCode}-SUP-${year}-${sequence}`;
}
