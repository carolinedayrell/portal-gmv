const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../db");
const { authMiddleware } = require("../middlewares/auth");

const router = express.Router();

function requireMestre(req, res) {
  if (req.user.perfil !== "MESTRE") {
    res.status(403).json({ message: "Apenas Mestre pode acessar usuários." });
    return false;
  }

  return true;
}

router.get("/", authMiddleware, async (req, res) => {
  try {
    if (!requireMestre(req, res)) return;

    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);
    const offset = (page - 1) * limit;

    const { busca, perfil, ativo } = req.query;

    const params = [];
    const where = [];

    if (busca) {
      params.push(`%${busca}%`);
      where.push(`(u.nome ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }

    if (perfil) {
      params.push(perfil);
      where.push(`u.perfil = $${params.length}`);
    }

    if (ativo === "true" || ativo === "false") {
      params.push(ativo === "true");
      where.push(`u.ativo = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totalResult = await pool.query(
      `
      SELECT COUNT(DISTINCT u.id)::int AS total
      FROM portal_usuarios u
      LEFT JOIN portal_usuario_shopping us
        ON us.usuario_id = u.id
LEFT JOIN gbi_shopping s
  ON s.num_shopping::text = us.coligada_totvs::text
      ${whereSql}
      `,
      params
    );

    const listParams = [...params, limit, offset];

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.nome,
        u.email,
        u.perfil,
        u.ativo,
        u.criado_em,
COALESCE(
  STRING_AGG(
    COALESCE(s.nome_reduzido_coligada, s.nome_shopping),
    ', '
    ORDER BY COALESCE(s.nome_reduzido_coligada, s.nome_shopping)
  )
  FILTER (WHERE s.num_shopping IS NOT NULL),
  ''
) AS shoppings,
COALESCE(
  ARRAY_AGG(
    s.num_shopping::text
    ORDER BY COALESCE(s.nome_reduzido_coligada, s.nome_shopping)
  )
  FILTER (WHERE s.num_shopping IS NOT NULL),
  '{}'
) AS shopping_ids
      FROM portal_usuarios u
      LEFT JOIN portal_usuario_shopping us
        ON us.usuario_id = u.id
LEFT JOIN gbi_shopping s
  ON s.num_shopping::text = us.coligada_totvs::text
      ${whereSql}
      GROUP BY u.id, u.nome, u.email, u.perfil, u.ativo, u.criado_em
      ORDER BY u.nome
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
      `,
      listParams
    );

    const total = totalResult.rows[0].total;

    res.json({
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    res.status(500).json({ message: "Erro ao buscar usuários." });
  }
});

router.get("/opcoes", authMiddleware, async (req, res) => {
  try {

    const perfis = await pool.query(`
      SELECT DISTINCT perfil
      FROM portal_permissoes
      ORDER BY perfil
    `);

const shoppings = await pool.query(`
  SELECT
    STRING_AGG(num_shopping::text, ',' ORDER BY num_shopping::text) AS id,
    nome_reduzido_coligada AS nome
  FROM gbi_shopping
  WHERE nome_reduzido_coligada IS NOT NULL
    AND TRIM(nome_reduzido_coligada) <> ''
  GROUP BY nome_reduzido_coligada
  ORDER BY nome_reduzido_coligada
`);

    res.json({
      perfis: perfis.rows.map((row) => row.perfil),
      shoppings: shoppings.rows,
    });
  } catch (error) {
    console.error("Erro ao buscar opções de usuários:", error);
    res.status(500).json({ message: "Erro ao buscar opções de usuários." });
  }
});


router.post("/", authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    if (!requireMestre(req, res)) return;

const { nome, email, senha, perfil, shoppingIds = [] } = req.body;

if (perfil === "GERENTE_SHOPPING" && shoppingIds.length === 0) {
  return res.status(400).json({
    message:
      "Selecione pelo menos um shopping para o perfil GERENTE_SHOPPING.",
  });
}

const senha_hash = await bcrypt.hash(String(senha), 10);

    await client.query("BEGIN");

    const usuarioResult = await client.query(
      `
      INSERT INTO portal_usuarios (nome, email, senha_hash, perfil, ativo)
      VALUES ($1, $2, $3, $4, TRUE)
      RETURNING id, nome, email, perfil, ativo
      `,
      [nome, email, senha_hash, perfil]
    );

    const usuario = usuarioResult.rows[0];

 for (const shoppingIdGrupo of shoppingIds) {
  const shoppingIdsSeparados = String(shoppingIdGrupo)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const shoppingId of shoppingIdsSeparados) {
    await client.query(
      `
      INSERT INTO portal_usuario_shopping (usuario_id, coligada_totvs)
      VALUES ($1, $2)
      ON CONFLICT (usuario_id, coligada_totvs) DO NOTHING
      `,
      [usuario.id, shoppingId]
    );
  }
}

    await client.query("COMMIT");

    res.status(201).json(usuario);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Erro ao cadastrar usuário:", error);
    res.status(500).json({ message: "Erro ao cadastrar usuário." });
  } finally {
    client.release();
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    if (!requireMestre(req, res)) return;

    const { id } = req.params;
    const { nome, email, senha, perfil, ativo, shoppingIds = [] } = req.body;

    if (!nome || !email || !perfil) {
      return res.status(400).json({
        message: "Informe nome, e-mail e perfil.",
      });
    }
if (perfil === "GERENTE_SHOPPING" && shoppingIds.length === 0) {
  return res.status(400).json({
    message:
      "Selecione pelo menos um shopping para o perfil GERENTE_SHOPPING.",
  });
}
    await client.query("BEGIN");

    if (senha) {
      const senha_hash = await bcrypt.hash(String(senha), 10);

      await client.query(
        `
UPDATE portal_usuarios
SET nome = $1,
    email = $2,
    senha_hash = $3,
    perfil = $4,
    ativo = $5
WHERE id = $6
        `,
        [nome, email, senha_hash, perfil, ativo, id]
      );
    } else {
      await client.query(
        `
UPDATE portal_usuarios
SET nome = $1,
    email = $2,
    perfil = $3,
    ativo = $4
WHERE id = $5
        `,
        [nome, email, perfil, ativo, id]
      );
    }

    await client.query(
      `
      DELETE FROM portal_usuario_shopping
      WHERE usuario_id = $1
      `,
      [id]
    );

for (const shoppingIdGrupo of shoppingIds) {
  const shoppingIdsSeparados = String(shoppingIdGrupo)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const shoppingId of shoppingIdsSeparados) {
    await client.query(
      `
      INSERT INTO portal_usuario_shopping (usuario_id, coligada_totvs)
      VALUES ($1, $2)
      ON CONFLICT (usuario_id, coligada_totvs) DO NOTHING
      `,
      [id, shoppingId]
    );
  }
}

    await client.query("COMMIT");

    res.json({ message: "Usuário atualizado com sucesso." });
  } catch (error) {
    await client.query("ROLLBACK");
console.error("Erro ao atualizar usuário:", {
  message: error.message,
  code: error.code,
  detail: error.detail,
  column: error.column,
  constraint: error.constraint,
});

res.status(500).json({
  message: `Erro ao atualizar usuário: ${error.detail || error.message}`,
});
  } finally {
    client.release();
  }
});

module.exports = router;