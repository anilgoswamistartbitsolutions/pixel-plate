// Loads database/seed-demo.sql (demo floor plan + menu). Safe to re-run.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, "..", "database", "seed-demo.sql"), "utf8");
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Demo data seeded successfully.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exit(1);
});
