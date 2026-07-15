const express = require("express");
const pool = require("../db");
const { authMiddleware } = require("../middlewares/auth");

const router = express.Router();

function normalizarCnpjAlfanumerico(value) {
  const limpo = String(value ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 14);

  const base = limpo.slice(0, 12);
  const dv = limpo.slice(12, 14).replace(/\D/g, "");

  return `${base}${dv}`.slice(0, 14);
}

function requireMestre(req, res) {
  if (req.user.perfil !== "MESTRE") {
    res.status(403).json({ message: "Apenas Usuário do tipo Mestre pode editar shoppings." });
    return false;
  }

  return true;
}

router.get("/", authMiddleware, async (req, res) => {
  try {
    const { busca } = req.query;

    const params = [];
    const where = [];

    if (busca) {
      params.push(`%${busca}%`);
      where.push(`
        (
          nome_shopping ILIKE $${params.length}
          OR num_shopping::text ILIKE $${params.length}
          OR cnpjshopping ILIKE $${params.length}
          OR coligada_totvs ILIKE $${params.length}
          OR nome_reduzido_coligada ILIKE $${params.length}
        )
      `);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const result = await pool.query(
      `
SELECT
  num_shopping,
  nome_shopping,
  cnpjshopping,
  cnpj_totvs,
  coligada_totvs,
  nome_reduzido_coligada
      FROM gbi_shopping
      ${whereSql}
      ORDER BY nome_shopping
      `,
      params
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar shoppings:", error);
    res.status(500).json({ message: "Erro ao buscar shoppings." });
  }
});

router.put("/:numShopping", authMiddleware, async (req, res) => {
  try {
    if (!requireMestre(req, res)) return;

    const { numShopping } = req.params;
    const { cnpj_totvs, coligada_totvs, nome_reduzido_coligada } = req.body;
const cnpjTotvsTratado = normalizarCnpjAlfanumerico(cnpj_totvs);

    const result = await pool.query(
      `
UPDATE gbi_shopping
SET cnpj_totvs = $1,
    coligada_totvs = $2,
    nome_reduzido_coligada = $3
WHERE num_shopping::text = $4
RETURNING
  num_shopping,
  nome_shopping,
  cnpjshopping,
  cnpj_totvs,
  coligada_totvs,
  nome_reduzido_coligada
      `,
     [
  cnpjTotvsTratado || null,
  coligada_totvs || null,
  nome_reduzido_coligada || null,
  numShopping,
]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: "Shopping não encontrado." });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar shopping:", {
  message: error.message,
  code: error.code,
  detail: error.detail,
  column: error.column,
  constraint: error.constraint,
});

res.status(500).json({
  message: `Erro ao atualizar shopping: ${error.detail || error.message}`,
});
  }
});

module.exports = router;