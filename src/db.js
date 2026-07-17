const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: Number(
    process.env.PGPOOL_IDLE_TIMEOUT_MS || 30000
  ),
  connectionTimeoutMillis: Number(
    process.env.PGPOOL_CONNECTION_TIMEOUT_MS || 30000
  ),
  keepAlive: true,
  keepAliveInitialDelayMillis: Number(
    process.env.PGPOOL_KEEPALIVE_DELAY_MS || 10000
  ),
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("error", (error) => {
  console.error(
    "[POSTGRES] Conexão ociosa encerrada inesperadamente; " +
      "o pool abrirá uma nova conexão quando necessário:",
    error
  );
});

module.exports = pool;
