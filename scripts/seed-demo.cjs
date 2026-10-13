// Loads database/seed-demo.sql (floor plan + starter menu) then seed-california.sql
// (overwrites with the California-themed demo catalog, floors, and sample menu
// configurations). Safe to re-run.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const dbDir = path.join(__dirname, "..", "database");
  const files = ["seed-demo.sql", "seed-california.sql"];
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dbDir, file), "utf8");
      await client.query(sql);
      console.log(`Applied ${file}`);
    }
    console.log("Demo data seeded successfully.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exit(1);
});
