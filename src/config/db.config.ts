import "dotenv/config";

export const config = {
  client: "pg",
  connection: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  pool: {
    min: 2,
    max: 100, // Increase based on load – 20 is safe for medium usage
    acquireTimeoutMillis: 20000, // optional: wait 10s for a connection
    idleTimeoutMillis: 40000,    // optional: release idle connections after 30s
  },
};
