import { eq } from "drizzle-orm";
import { db, pool } from "./index";
import { supportOrganisationsTable } from "./schema/organisations";
import { supportProductsTable } from "./schema/products";

async function seed() {
  console.log("Seeding support organisations and products...");

  const [eride] = await db
    .insert(supportOrganisationsTable)
    .values({
      organisationName: "Eride Technologies",
      organisationCode: "ERIDE",
      status: "active",
      supportEmail: "support@eridetech.africa",
    })
    .onConflictDoNothing({
      target: supportOrganisationsTable.organisationCode,
    })
    .returning();

  const organisation =
    eride ??
    (await db.query.supportOrganisationsTable.findFirst({
      where: eq(supportOrganisationsTable.organisationCode, "ERIDE"),
    }));

  if (!organisation) throw new Error("Failed to seed Eride organisation");

  const products = [
    {
      productCode: "EMA",
      productName: "E-Migration Assist",
      isActive: true,
      isPublicVisible: true,
    },
    {
      productCode: "8BT",
      productName: "8Beauty",
      isActive: true,
      isPublicVisible: true,
    },
    {
      productCode: "ERD",
      productName: "Eride General Support",
      isActive: true,
      isPublicVisible: true,
    },
  ];

  for (const p of products) {
    await db
      .insert(supportProductsTable)
      .values({ ...p, organisationId: organisation.id })
      .onConflictDoNothing({
        target: [
          supportProductsTable.organisationId,
          supportProductsTable.productCode,
        ],
      });
  }

  console.log(`Seeded organisation ${organisation.organisationCode} and ${products.length} products.`);
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
