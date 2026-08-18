import { neon } from "@neondatabase/serverless";

async function main() {
  const sourceUrl = process.env.VONG_E2E_PARENT_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL;

  if (!sourceUrl || !targetUrl) {
    throw new Error("Missing E2E migration source or target database URL");
  }

  const source = neon(sourceUrl);
  const target = neon(targetUrl);
  const migrations = (await source`
    select hash, created_at::text as "createdAt"
    from drizzle.__drizzle_migrations
    order by created_at
  `) as Array<{ hash: string; createdAt: string }>;

  for (const migration of migrations) {
    await target`
      insert into drizzle.__drizzle_migrations (hash, created_at)
      select ${migration.hash}, ${migration.createdAt}::bigint
      where not exists (
        select 1
        from drizzle.__drizzle_migrations
        where hash = ${migration.hash}
      )
    `;
  }

  console.log(`Baselined ${migrations.length} production migration(s)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
