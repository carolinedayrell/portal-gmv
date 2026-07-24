const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const pool = require("../db");
const { authMiddleware } = require("../middlewares/auth");

const rateLimit = require("express-rate-limit");
const {
  enfileirarEmail,
} = require("../services/email-outbox.services");
const {
  PERFIS_VALIDOS,
  normalizarPerfil,
  normalizarShoppingIds,
  podeAlterarUsuario,
  podeConcederPerfil,
  podeGerenciarUsuarios,
} = require("../services/usuario-acesso.service");

const solicitacaoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Muitas tentativas. Aguarde e tente novamente.",
  },
});

const consultaPublicaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Muitas tentativas. Aguarde e tente novamente.",
  },
});

const router = express.Router();

function erroBancoTemporariamenteIndisponivel(error) {
  const codigos = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "EPIPE",
    "ENETUNREACH",
    "EHOSTUNREACH",
    "57P01",
    "57P02",
    "57P03",
    "53300",
  ]);

  if (codigos.has(error?.code)) return true;

  const mensagem = String(error?.message || "").toLowerCase();
  return [
    "connection terminated",
    "connection timeout",
    "secure tls connection",
    "socket disconnected",
  ].some((trecho) => mensagem.includes(trecho));
}

async function rollbackSeguro(client, transacaoAberta) {
  if (!client || !transacaoAberta) return;

  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.error("Erro ao desfazer transacao de usuario:", rollbackError);
  }
}

function responderErroUsuario(res, error, operacao) {
  console.error(`[USUARIOS] Erro ao ${operacao}:`, {
    message: error?.message,
    code: error?.code,
    detail: error?.detail,
    constraint: error?.constraint,
  });

  if (res.headersSent) return;

  if (erroBancoTemporariamenteIndisponivel(error)) {
    res.status(503).json({
      message:
        "Banco de dados temporariamente indisponivel. Aguarde e tente novamente.",
    });
    return;
  }

  if (error?.code === "23505") {
    res.status(409).json({
      message: "Ja existe um usuario cadastrado com os dados informados.",
    });
    return;
  }

  res.status(500).json({
    message: `Erro ao ${operacao}: ${error?.detail || error?.message}`,
  });
}

async function obterGerenciadorUsuarios(client, req, res) {
  const result = await client.query(
    `
    SELECT id, nome, email, perfil
    FROM portal_usuarios
    WHERE id = $1
      AND ativo = TRUE
      AND status_cadastro = 'APROVADO'
    LIMIT 1
    FOR SHARE
    `,
    [req.user.id]
  );

  const usuario = result.rows[0];

  if (
    !usuario ||
    !podeGerenciarUsuarios(usuario.perfil)
  ) {
    res.status(403).json({
      message:
        "Apenas Mestre ou Gerente CSC pode gerenciar usuários.",
    });

    return null;
  }

  return usuario;
}

async function obterShoppingIdsInvalidos(client, shoppingIds) {
  if (!shoppingIds.length) return [];

  const result = await client.query(
    `
    SELECT DISTINCT num_shopping::text AS id
    FROM gbi_shopping
    WHERE num_shopping::text = ANY($1::text[])
    `,
    [shoppingIds]
  );

  const idsValidos = new Set(
    result.rows.map((row) => String(row.id))
  );

  return shoppingIds.filter((id) => !idsValidos.has(id));
}

async function criarSenhaInicialInutilizavel() {
  const credencialAleatoria = crypto
    .randomBytes(48)
    .toString("base64url");

  return bcrypt.hash(credencialAleatoria, 10);
}

router.get(
  "/solicitacoes/shoppings",
  consultaPublicaLimiter,
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          MIN(num_shopping)::text AS id,
          MIN(TRIM(nome_reduzido_coligada)) AS nome
        FROM gbi_shopping
        WHERE num_shopping IS NOT NULL
          AND nome_reduzido_coligada IS NOT NULL
          AND TRIM(nome_reduzido_coligada) <> ''
        GROUP BY LOWER(TRIM(nome_reduzido_coligada))
        ORDER BY nome
      `);

      return res.json(result.rows);
    } catch (error) {
      return res.status(500).json({
        message: "Erro ao carregar shoppings.",
      });
    }
  }
);

router.post(
  "/solicitacoes",
  solicitacaoLimiter,
  async (req, res) => {
    const client = await pool.connect();
    let transacaoAberta = false;

    try {
      const nome = String(req.body.nome || "").trim();
      const email = String(req.body.email || "")
        .trim()
        .toLowerCase();
      const shoppingId = String(req.body.shoppingId || "").trim();

      if (!nome || !email || !shoppingId) {
        return res.status(400).json({
          message: "Informe nome, e-mail e shopping.",
        });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
          message: "Informe um e-mail válido.",
        });
      }

      const shoppingResult = await client.query(
        `
        SELECT
          num_shopping::text AS id,
          COALESCE(
            nome_reduzido_coligada,
            nome_shopping,
            num_shopping::text
          ) AS nome
        FROM gbi_shopping
        WHERE num_shopping::text = $1
        LIMIT 1
        `,
        [shoppingId]
      );

      if (!shoppingResult.rows.length) {
        return res.status(400).json({
          message: "Shopping inválido.",
        });
      }

      await client.query("BEGIN");
      transacaoAberta = true;

      const usuarioResult = await client.query(
        `
        INSERT INTO portal_usuarios (
          nome,
          email,
          senha_hash,
          perfil,
          ativo,
          status_cadastro,
          shopping_solicitado,
          solicitado_em
        )
        VALUES (
          $1,
          $2,
          NULL,
          NULL,
          FALSE,
          'AGUARDANDO_APROVACAO',
          $3,
          NOW()
        )
        RETURNING id
        `,
        [nome, email, shoppingId]
      );

      const usuarioId = usuarioResult.rows[0].id;
      const shopping = shoppingResult.rows[0];

      await client.query(
        `
        INSERT INTO portal_usuario_aprovacao_historico (
          usuario_id,
          status_anterior,
          status_novo,
          shopping_solicitado
        )
        VALUES (
          $1,
          NULL,
          'AGUARDANDO_APROVACAO',
          $2
        )
        `,
        [usuarioId, shoppingId]
      );

      const mestresResult = await client.query(`
        SELECT id, email
        FROM portal_usuarios
        WHERE perfil = 'MESTRE'
          AND ativo = TRUE
          AND status_cadastro = 'APROVADO'
      `);

      for (const mestre of mestresResult.rows) {
        await enfileirarEmail(client, {
          chave:
            `NOVA_SOLICITACAO:${usuarioId}:MESTRE:${mestre.id}`,
          tipo: "NOVA_SOLICITACAO_USUARIO",
          destinatario: mestre.email,
          payload: {
            usuarioId,
            nome,
            email,
            shoppingId,
            shoppingNome: shopping.nome,
          },
        });
      }

      await client.query("COMMIT");
      transacaoAberta = false;

      return res.status(201).json({
        message: "Solicitação enviada para aprovação.",
      });
    } catch (error) {
      if (transacaoAberta) {
        await client.query("ROLLBACK");
      }

      if (error.code === "23505") {
        return res.status(409).json({
          message:
            "Já existe usuário ou solicitação para este e-mail.",
        });
      }

      console.error("[SOLICITAÇÃO] Erro:", {
        message: error.message,
        code: error.code,
      });

      return res.status(500).json({
        message: "Erro ao registrar solicitação.",
      });
    } finally {
      client.release();
    }
  }
);

router.get("/", authMiddleware, async (req, res) => {
  try {
    const gerenciador = await obterGerenciadorUsuarios(pool, req, res);
    if (!gerenciador) return;

    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);
    const offset = (page - 1) * limit;

    const { busca, perfil, ativo, status } = req.query;

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

    if (status) {
      params.push(String(status).trim().toUpperCase());
      where.push(`u.status_cadastro = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totalResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM portal_usuarios u
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
        u.status_cadastro,
        u.shopping_solicitado,
        u.solicitado_em,
        u.analisado_em,
        u.analisado_por,
        u.motivo_rejeicao,
        u.primeiro_acesso,
        u.credencial_expira_em,
        u.criado_em,
        COALESCE(vinculos.shoppings, '') AS shoppings,
        COALESCE(vinculos.shopping_ids, '{}') AS shopping_ids,
        COALESCE(
          shopping_solicitado.nome_reduzido_coligada,
          shopping_solicitado.nome_shopping,
          u.shopping_solicitado
        ) AS shopping_solicitado_nome,
        (
          u.credencial_expira_em IS NOT NULL
          AND u.credencial_expira_em <= NOW()
        ) AS convite_expirado
      FROM portal_usuarios u
      LEFT JOIN LATERAL (
        SELECT
          STRING_AGG(
            COALESCE(s.nome_reduzido_coligada, s.nome_shopping),
            ', '
            ORDER BY COALESCE(
              s.nome_reduzido_coligada,
              s.nome_shopping
            )
          ) AS shoppings,
          ARRAY_AGG(
            s.num_shopping::text
            ORDER BY COALESCE(
              s.nome_reduzido_coligada,
              s.nome_shopping
            )
          ) AS shopping_ids
        FROM portal_usuario_shopping us
        JOIN gbi_shopping s
          ON s.num_shopping::text = us.coligada_totvs::text
        WHERE us.usuario_id = u.id
      ) vinculos ON TRUE
      LEFT JOIN gbi_shopping shopping_solicitado
        ON shopping_solicitado.num_shopping::text =
          u.shopping_solicitado
      ${whereSql}
      ORDER BY
        CASE
          WHEN u.status_cadastro = 'AGUARDANDO_APROVACAO' THEN 0
          ELSE 1
        END,
        u.solicitado_em DESC,
        u.nome
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
    const gerenciador = await obterGerenciadorUsuarios(pool, req, res);
    if (!gerenciador) return;

    const perfis = await pool.query(`
      SELECT DISTINCT perfil
      FROM portal_permissoes
      ORDER BY perfil
    `);

const shoppings = await pool.query(`
  SELECT
    STRING_AGG(num_shopping::text, ',' ORDER BY num_shopping::text) AS id,
    MIN(TRIM(nome_reduzido_coligada)) AS nome
  FROM gbi_shopping
  WHERE nome_reduzido_coligada IS NOT NULL
    AND TRIM(nome_reduzido_coligada) <> ''
  GROUP BY LOWER(TRIM(nome_reduzido_coligada))
  ORDER BY nome
`);

    res.json({
      perfis: perfis.rows
        .map((row) => row.perfil)
        .filter((perfil) =>
          podeConcederPerfil(gerenciador.perfil, perfil)
        ),
      shoppings: shoppings.rows,
    });
  } catch (error) {
    console.error("Erro ao buscar opções de usuários:", error);
    res.status(500).json({ message: "Erro ao buscar opções de usuários." });
  }
});

router.post("/:id/aprovar", authMiddleware, async (req, res) => {
  let client;
  let transacaoAberta = false;

  try {
    const perfil = normalizarPerfil(req.body.perfil);
    const shoppingIds = normalizarShoppingIds(
      req.body.shoppingIds || []
    );

    if (!PERFIS_VALIDOS.has(perfil)) {
      return res.status(400).json({
        message: "Selecione um perfil valido.",
      });
    }

    if (perfil === "GERENTE_SHOPPING" && !shoppingIds.length) {
      return res.status(400).json({
        message:
          "Selecione pelo menos um shopping para o Gerente Shopping.",
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    transacaoAberta = true;

    const gerenciador = await obterGerenciadorUsuarios(
      client,
      req,
      res
    );

    if (!gerenciador) {
      await rollbackSeguro(client, transacaoAberta);
      transacaoAberta = false;
      return;
    }

    if (!podeConcederPerfil(gerenciador.perfil, perfil)) {
      await rollbackSeguro(client, transacaoAberta);
      transacaoAberta = false;
      return res.status(403).json({
        message: "Seu perfil nao pode conceder o perfil solicitado.",
      });
    }

    const usuarioResult = await client.query(
      `
      SELECT *
      FROM portal_usuarios
      WHERE id = $1
      FOR UPDATE
      `,
      [req.params.id]
    );

    const usuario = usuarioResult.rows[0];

    if (!usuario) {
      await rollbackSeguro(client, transacaoAberta);
      transacaoAberta = false;
      return res.status(404).json({
        message: "Solicitacao nao encontrada.",
      });
    }

    if (usuario.status_cadastro === "APROVADO") {
      await client.query("COMMIT");
      transacaoAberta = false;
      return res.json({
        message: "Solicitacao ja aprovada.",
        idempotente: true,
      });
    }

    if (usuario.status_cadastro !== "AGUARDANDO_APROVACAO") {
      await rollbackSeguro(client, transacaoAberta);
      transacaoAberta = false;
      return res.status(409).json({
        message: "Esta solicitacao ja foi analisada.",
      });
    }

    if (perfil === "GERENTE_SHOPPING") {
      const idsInvalidos = await obterShoppingIdsInvalidos(
        client,
        shoppingIds
      );

      if (idsInvalidos.length) {
        await rollbackSeguro(client, transacaoAberta);
        transacaoAberta = false;
        return res.status(400).json({
          message: "Um ou mais shoppings informados sao invalidos.",
        });
      }
    }

    const senhaInicialInutilizavel =
      await criarSenhaInicialInutilizavel();

    const atualizadoResult = await client.query(
      `
      UPDATE portal_usuarios
      SET
        perfil = $2,
        senha_hash = $4,
        ativo = TRUE,
        status_cadastro = 'APROVADO',
        analisado_em = NOW(),
        analisado_por = $3,
        motivo_rejeicao = NULL,
        primeiro_acesso = TRUE,
        credencial_versao = credencial_versao + 1,
        credencial_expira_em = NOW() + INTERVAL '24 hours',
        credencial_utilizada_em = NULL,
        versao_sessao = versao_sessao + 1,
        atualizado_em = NOW()
      WHERE id = $1
      RETURNING id, email, credencial_versao
      `,
      [
        usuario.id,
        perfil,
        gerenciador.id,
        senhaInicialInutilizavel,
      ]
    );

    const atualizado = atualizadoResult.rows[0];

    await client.query(
      `
      DELETE FROM portal_usuario_shopping
      WHERE usuario_id = $1
      `,
      [usuario.id]
    );

    if (perfil === "GERENTE_SHOPPING") {
      for (const shoppingId of shoppingIds) {
        await client.query(
          `
          INSERT INTO portal_usuario_shopping (
            usuario_id,
            coligada_totvs
          )
          VALUES ($1, $2)
          ON CONFLICT (usuario_id, coligada_totvs) DO NOTHING
          `,
          [usuario.id, shoppingId]
        );
      }
    }

    await client.query(
      `
      INSERT INTO portal_usuario_aprovacao_historico (
        usuario_id,
        status_anterior,
        status_novo,
        perfil_concedido,
        shopping_solicitado,
        shopping_ids_aprovados,
        responsavel_id
      )
      VALUES ($1, $2, $3, $4, $5, $6::text[], $7)
      `,
      [
        usuario.id,
        usuario.status_cadastro,
        "APROVADO",
        perfil,
        usuario.shopping_solicitado,
        perfil === "GERENTE_SHOPPING" ? shoppingIds : [],
        gerenciador.id,
      ]
    );

    await enfileirarEmail(client, {
      chave:
        `CADASTRO_APROVADO:${atualizado.id}:` +
        atualizado.credencial_versao,
      tipo: "CADASTRO_APROVADO",
      destinatario: atualizado.email,
      payload: {
        usuarioId: atualizado.id,
        credencialVersao: atualizado.credencial_versao,
      },
    });

    await client.query("COMMIT");
    transacaoAberta = false;

    return res.json({
      message:
        "Solicitacao aprovada. O convite sera enviado por e-mail.",
    });
  } catch (error) {
    await rollbackSeguro(client, transacaoAberta);
    return responderErroUsuario(res, error, "aprovar solicitacao");
  } finally {
    client?.release();
  }
});

router.post("/:id/rejeitar", authMiddleware, async (req, res) => {
  let client;
  let transacaoAberta = false;

  try {
    const motivo = String(req.body.motivo || "").trim();

    if (motivo.length < 5 || motivo.length > 1000) {
      return res.status(400).json({
        message:
          "Informe um motivo entre 5 e 1000 caracteres.",
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    transacaoAberta = true;

    const gerenciador = await obterGerenciadorUsuarios(
      client,
      req,
      res
    );

    if (!gerenciador) {
      await rollbackSeguro(client, transacaoAberta);
      transacaoAberta = false;
      return;
    }

    const usuarioResult = await client.query(
      `
      SELECT *
      FROM portal_usuarios
      WHERE id = $1
      FOR UPDATE
      `,
      [req.params.id]
    );

    const usuario = usuarioResult.rows[0];

    if (!usuario) {
      await rollbackSeguro(client, transacaoAberta);
      transacaoAberta = false;
      return res.status(404).json({
        message: "Solicitacao nao encontrada.",
      });
    }

    if (usuario.status_cadastro === "REJEITADO") {
      await client.query("COMMIT");
      transacaoAberta = false;
      return res.json({
        message: "Solicitacao ja rejeitada.",
        idempotente: true,
      });
    }

    if (usuario.status_cadastro !== "AGUARDANDO_APROVACAO") {
      await rollbackSeguro(client, transacaoAberta);
      transacaoAberta = false;
      return res.status(409).json({
        message: "Esta solicitacao ja foi analisada.",
      });
    }

    await client.query(
      `
      UPDATE portal_usuarios
      SET
        ativo = FALSE,
        perfil = NULL,
        senha_hash = NULL,
        status_cadastro = 'REJEITADO',
        analisado_em = NOW(),
        analisado_por = $2,
        motivo_rejeicao = $3,
        credencial_expira_em = NULL,
        credencial_utilizada_em = NULL,
        versao_sessao = versao_sessao + 1,
        atualizado_em = NOW()
      WHERE id = $1
      `,
      [usuario.id, gerenciador.id, motivo]
    );

    await client.query(
      `
      INSERT INTO portal_usuario_aprovacao_historico (
        usuario_id,
        status_anterior,
        status_novo,
        shopping_solicitado,
        responsavel_id,
        motivo
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        usuario.id,
        usuario.status_cadastro,
        "REJEITADO",
        usuario.shopping_solicitado,
        gerenciador.id,
        motivo,
      ]
    );

    await client.query("COMMIT");
    transacaoAberta = false;

    return res.json({
      message: "Solicitacao rejeitada.",
    });
  } catch (error) {
    await rollbackSeguro(client, transacaoAberta);
    return responderErroUsuario(res, error, "rejeitar solicitacao");
  } finally {
    client?.release();
  }
});

router.post(
  "/:id/reenviar-convite",
  authMiddleware,
  async (req, res) => {
    let client;
    let transacaoAberta = false;

    try {
      client = await pool.connect();
      await client.query("BEGIN");
      transacaoAberta = true;

      const gerenciador = await obterGerenciadorUsuarios(
        client,
        req,
        res
      );

      if (!gerenciador) {
        await rollbackSeguro(client, transacaoAberta);
        transacaoAberta = false;
        return;
      }

      const usuarioResult = await client.query(
        `
        SELECT *
        FROM portal_usuarios
        WHERE id = $1
        FOR UPDATE
        `,
        [req.params.id]
      );

      const usuario = usuarioResult.rows[0];

      if (!usuario) {
        await rollbackSeguro(client, transacaoAberta);
        transacaoAberta = false;
        return res.status(404).json({
          message: "Usuario nao encontrado.",
        });
      }

      if (
        !podeAlterarUsuario(
          gerenciador.perfil,
          usuario.perfil,
          usuario.perfil
        )
      ) {
        await rollbackSeguro(client, transacaoAberta);
        transacaoAberta = false;
        return res.status(403).json({
          message: "Seu perfil nao pode reenviar este convite.",
        });
      }

      if (
        usuario.status_cadastro !== "APROVADO" ||
        !usuario.primeiro_acesso
      ) {
        await rollbackSeguro(client, transacaoAberta);
        transacaoAberta = false;
        return res.status(409).json({
          message:
            "Este usuario ja definiu a senha. Use a recuperacao de senha.",
        });
      }

      const senhaInicialInutilizavel =
        await criarSenhaInicialInutilizavel();

      const atualizadoResult = await client.query(
        `
        UPDATE portal_usuarios
        SET
          ativo = TRUE,
          senha_hash = COALESCE(senha_hash, $2),
          credencial_versao = credencial_versao + 1,
          credencial_expira_em = NOW() + INTERVAL '24 hours',
          credencial_utilizada_em = NULL,
          versao_sessao = versao_sessao + 1,
          atualizado_em = NOW()
        WHERE id = $1
        RETURNING id, email, credencial_versao
        `,
        [usuario.id, senhaInicialInutilizavel]
      );

      const atualizado = atualizadoResult.rows[0];

      await client.query(
        `
        INSERT INTO portal_usuario_aprovacao_historico (
          usuario_id,
          status_anterior,
          status_novo,
          perfil_concedido,
          shopping_solicitado,
          responsavel_id,
          motivo
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          usuario.id,
          "APROVADO",
          "APROVADO",
          usuario.perfil,
          usuario.shopping_solicitado,
          gerenciador.id,
          "Convite reenviado",
        ]
      );

      await enfileirarEmail(client, {
        chave:
          `CADASTRO_APROVADO:${atualizado.id}:` +
          atualizado.credencial_versao,
        tipo: "CADASTRO_APROVADO",
        destinatario: atualizado.email,
        payload: {
          usuarioId: atualizado.id,
          credencialVersao: atualizado.credencial_versao,
        },
      });

      await client.query("COMMIT");
      transacaoAberta = false;

      return res.json({
        message: "Novo convite colocado na fila de envio.",
      });
    } catch (error) {
      await rollbackSeguro(client, transacaoAberta);
      return responderErroUsuario(res, error, "reenviar convite");
    } finally {
      client?.release();
    }
  }
);


router.post("/", authMiddleware, async (req, res) => {
  try {
    const gerenciador = await obterGerenciadorUsuarios(pool, req, res);
    if (!gerenciador) return;

    return res.status(405).json({
      message:
        "O cadastro direto foi desativado. Utilize a solicitacao publica e o fluxo de aprovacao.",
    });
  } catch (error) {
    responderErroUsuario(res, error, "validar o cadastro de usuario");
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  let transacaoAberta = false;

  try {
    const { id } = req.params;
    const { nome, email, perfil, ativo, shoppingIds = [] } = req.body;
    const nomeNormalizado = String(nome || "").trim();
    const emailNormalizado = String(email || "").trim().toLowerCase();
    const perfilNormalizado = normalizarPerfil(perfil);
    const shoppingIdsNormalizados = normalizarShoppingIds(shoppingIds);

    if (!nomeNormalizado || !emailNormalizado || !perfilNormalizado) {
      return res.status(400).json({
        message: "Informe nome, e-mail e perfil.",
      });
    }

    if (typeof ativo !== "boolean") {
      return res.status(400).json({
        message: "Informe se o usuario esta ativo.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
      return res.status(400).json({
        message: "Informe um e-mail valido.",
      });
    }

    if (!PERFIS_VALIDOS.has(perfilNormalizado)) {
      return res.status(400).json({
        message: "Perfil invalido.",
      });
    }

    if (
      perfilNormalizado === "GERENTE_SHOPPING" &&
      shoppingIdsNormalizados.length === 0
    ) {
      return res.status(400).json({
        message:
          "Selecione pelo menos um shopping para o perfil GERENTE_SHOPPING.",
      });
    }

    await client.query("BEGIN");
    transacaoAberta = true;

    const gerenciador = await obterGerenciadorUsuarios(client, req, res);

    if (!gerenciador) {
      await rollbackSeguro(client, transacaoAberta);
      transacaoAberta = false;
      return;
    }

    const usuarioAtualResult = await client.query(
      `
      SELECT
        id,
        email,
        perfil,
        status_cadastro,
        primeiro_acesso,
        senha_hash
      FROM portal_usuarios
      WHERE id = $1
      FOR UPDATE
      `,
      [id]
    );

    const usuarioAtual = usuarioAtualResult.rows[0];

    if (!usuarioAtual) {
      await rollbackSeguro(client, transacaoAberta);
      transacaoAberta = false;
      return res.status(404).json({
        message: "Usuario nao encontrado.",
      });
    }

    if (usuarioAtual.status_cadastro !== "APROVADO") {
      await rollbackSeguro(client, transacaoAberta);
      transacaoAberta = false;
      return res.status(409).json({
        message:
          "Solicitacoes pendentes ou rejeitadas devem ser tratadas pelo fluxo de aprovacao.",
      });
    }

    if (
      !podeAlterarUsuario(
        gerenciador.perfil,
        usuarioAtual.perfil,
        perfilNormalizado
      )
    ) {
      await rollbackSeguro(client, transacaoAberta);
      transacaoAberta = false;
      return res.status(403).json({
        message:
          "Gerente CSC nao pode criar, alterar ou desativar usuarios Mestre.",
      });
    }

    if (perfilNormalizado === "GERENTE_SHOPPING") {
      const idsInvalidos = await obterShoppingIdsInvalidos(
        client,
        shoppingIdsNormalizados
      );

      if (idsInvalidos.length) {
        await rollbackSeguro(client, transacaoAberta);
        transacaoAberta = false;
        return res.status(400).json({
          message: "Um ou mais shoppings informados sao invalidos.",
        });
      }
    }

    const senhaInicialInutilizavel =
      usuarioAtual.primeiro_acesso && !usuarioAtual.senha_hash
        ? await criarSenhaInicialInutilizavel()
        : null;

    const atualizadoResult = await client.query(
      `
UPDATE portal_usuarios
SET nome = $1,
    email = $2,
    perfil = $3,
    ativo = $4,
    senha_hash = COALESCE(senha_hash, $6),
    atualizado_em = NOW(),
    versao_sessao = versao_sessao + 1,
    credencial_versao = credencial_versao + 1,
    credencial_expira_em = CASE
      WHEN primeiro_acesso = TRUE
        THEN NOW() + INTERVAL '24 hours'
      ELSE NULL
    END,
    credencial_utilizada_em = CASE
      WHEN primeiro_acesso = TRUE
        THEN NULL
      ELSE credencial_utilizada_em
    END
WHERE id = $5
RETURNING
  id,
  email,
  primeiro_acesso,
  senha_hash,
  credencial_versao
      `,
      [
        nomeNormalizado,
        emailNormalizado,
        perfilNormalizado,
        ativo,
        id,
        senhaInicialInutilizavel,
      ]
    );

    const usuarioAtualizado = atualizadoResult.rows[0];

    await client.query(
      `
      DELETE FROM portal_usuario_shopping
      WHERE usuario_id = $1
      `,
      [id]
    );

    if (perfilNormalizado === "GERENTE_SHOPPING") {
      for (const shoppingId of shoppingIdsNormalizados) {
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

    if (
      usuarioAtualizado.primeiro_acesso
    ) {
      await enfileirarEmail(client, {
        chave:
          `CADASTRO_APROVADO:${usuarioAtualizado.id}:` +
          usuarioAtualizado.credencial_versao,
        tipo: "CADASTRO_APROVADO",
        destinatario: usuarioAtualizado.email,
        payload: {
          usuarioId: usuarioAtualizado.id,
          credencialVersao: usuarioAtualizado.credencial_versao,
        },
      });
    }

    await client.query("COMMIT");
    transacaoAberta = false;

    res.json({ message: "Usuário atualizado com sucesso." });
  } catch (error) {
    await rollbackSeguro(client, transacaoAberta);
    responderErroUsuario(res, error, "atualizar usuario");
  } finally {
    client.release();
  }
});

module.exports = router;
