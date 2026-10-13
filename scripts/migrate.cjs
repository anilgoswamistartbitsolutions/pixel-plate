// Applies database/schema.sql, then every database/migrate-*.sql file (alphabetically) against
// DATABASE_URL. Safe to re-run -- every statement is create-if-not-exists / insert-on-conflict.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const dbDir = path.join(__dirname, "..", "database");
  const files = [
    "schema.sql",
    ...fs.readdirSync(dbDir).filter((f) => f.startsWith("migrate-") && f.endsWith(".sql")).sort()
  ];

  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dbDir, file), "utf8");
      await client.query(sql);
      console.log(`Applied ${file}`);
    }
    console.log("Schema up to date.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
