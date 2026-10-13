// Applies database/schema.sql against DATABASE_URL. Safe to re-run (every statement is
// create-if-not-exists / insert-on-conflict).
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, "..", "database", "schema.sql"), "utf8");
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Schema applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
