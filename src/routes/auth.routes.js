const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const pool = require("../db");
const { authMiddleware } = require("../middlewares/auth");
const {
  enfileirarEmail,
} = require("../services/email-outbox.services");
const {
  validarTokenDefinicaoSenha,
} = require("../services/password-setup-token-service");
const {
  senhaAtendePolitica,
} = require("../services/usuario-acesso.service");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Muitas tentativas. Aguarde e tente novamente.",
  },
});

const redefinicaoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Muitas tentativas. Aguarde e tente novamente.",
  },
});

async function rollbackSeguro(client, transacaoAberta) {
  if (!client || !transacaoAberta) return;

  try {
    await client.query("ROLLBACK");
  } catch (error) {
    console.error("Erro ao desfazer transacao de autenticacao:", {
      code: error?.code,
      message: error?.message,
    });
  }
}

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const senha = String(req.body.senha || "");

    if (!email || !senha) {
      return res.status(400).json({
        message: "Informe email e senha.",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        nome,
        email,
        senha_hash,
        perfil,
        ativo,
        status_cadastro,
        primeiro_acesso,
        versao_sessao
      FROM portal_usuarios
      WHERE LOWER(TRIM(email)) = $1
      LIMIT 1
      `,
      [email]
    );

    const usuario = result.rows[0];

    if (
      !usuario ||
      !usuario.ativo ||
      usuario.status_cadastro !== "APROVADO" ||
      !usuario.senha_hash ||
      !usuario.perfil
    ) {
      return res.status(401).json({
        message: "Usuario ou senha invalidos.",
      });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);

    if (!senhaValida) {
      return res.status(401).json({
        message: "Usuario ou senha invalidos.",
      });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
        versaoSessao: usuario.versao_sessao,
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "8h",
      }
    );

    const permissoes = await pool.query(
      `
      SELECT modulo, pode_visualizar, pode_criar, pode_editar, pode_excluir
      FROM portal_permissoes
      WHERE perfil = $1
      `,
      [usuario.perfil]
    );

    return res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
      },
      permissoes: permissoes.rows,
    });
  } catch (error) {
    console.error("Erro no login:", {
      code: error?.code,
      message: error?.message,
    });

    return res.status(500).json({
      message: "Erro interno no login.",
    });
  }
});

router.post(
  "/esqueci-senha",
  redefinicaoLimiter,
  async (req, res) => {
    const resposta = {
      message:
        "Se o e-mail estiver cadastrado, enviaremos as instrucoes.",
    };
    let client;
    let transacaoAberta = false;

    try {
      const email = String(req.body.email || "").trim().toLowerCase();
      if (!email) return res.json(resposta);

      client = await pool.connect();
      await client.query("BEGIN");
      transacaoAberta = true;

      const result = await client.query(
        `
        SELECT id, email, status_cadastro
        FROM portal_usuarios
        WHERE LOWER(TRIM(email)) = $1
        FOR UPDATE
        `,
        [email]
      );

      const usuario = result.rows[0];

      if (!usuario || usuario.status_cadastro !== "APROVADO") {
        await client.query("COMMIT");
        transacaoAberta = false;
        return res.json(resposta);
      }

      const atualizadoResult = await client.query(
        `
        UPDATE portal_usuarios
        SET
          credencial_versao = credencial_versao + 1,
          credencial_expira_em = NOW() + INTERVAL '24 hours',
          credencial_utilizada_em = NULL,
          versao_sessao = versao_sessao + 1,
          atualizado_em = NOW()
        WHERE id = $1
        RETURNING id, email, credencial_versao
        `,
        [usuario.id]
      );

      const atualizado = atualizadoResult.rows[0];

      await enfileirarEmail(client, {
        chave:
          `REDEFINIR_SENHA:${atualizado.id}:` +
          atualizado.credencial_versao,
        tipo: "REDEFINICAO_SENHA",
        destinatario: atualizado.email,
        payload: {
          usuarioId: atualizado.id,
          credencialVersao: atualizado.credencial_versao,
        },
      });

      await client.query("COMMIT");
      transacaoAberta = false;
      return res.json(resposta);
    } catch (error) {
      await rollbackSeguro(client, transacaoAberta);

      console.error("[REDEFINICAO] Falha interna:", {
        code: error?.code,
        message: error?.message,
      });

      return res.json(resposta);
    } finally {
      client?.release();
    }
  }
);

router.post("/definir-senha", redefinicaoLimiter, async (req, res) => {
  let client;
  let transacaoAberta = false;

  try {
    const token = String(req.body.token || "");
    const senha = String(req.body.senha || "");
    const confirmacao = String(req.body.confirmacao || "");

    if (!token || !senha || !confirmacao) {
      return res.status(400).json({
        message: "Informe token, senha e confirmacao.",
      });
    }

    if (senha !== confirmacao) {
      return res.status(400).json({
        message: "As senhas nao conferem.",
      });
    }

    if (!senhaAtendePolitica(senha)) {
      return res.status(400).json({
        message:
          "A senha deve possuir ao menos 10 caracteres, " +
          "maiuscula, minuscula, numero e simbolo.",
      });
    }

    const decoded = validarTokenDefinicaoSenha(token);

    client = await pool.connect();
    await client.query("BEGIN");
    transacaoAberta = true;

    const result = await client.query(
      `
      SELECT
        id,
        status_cadastro,
        credencial_versao,
        credencial_expira_em,
        credencial_utilizada_em
      FROM portal_usuarios
      WHERE id = $1
      FOR UPDATE
      `,
      [decoded.sub]
    );

    const usuario = result.rows[0];

    if (
      !usuario ||
      usuario.status_cadastro !== "APROVADO" ||
      Number(usuario.credencial_versao) !==
        Number(decoded.credencialVersao) ||
      usuario.credencial_utilizada_em ||
      !usuario.credencial_expira_em ||
      new Date(usuario.credencial_expira_em) <= new Date()
    ) {
      await rollbackSeguro(client, transacaoAberta);
      transacaoAberta = false;

      return res.status(400).json({
        message: "Link invalido, utilizado ou expirado.",
      });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    await client.query(
      `
      UPDATE portal_usuarios
      SET
        senha_hash = $2,
        ativo = TRUE,
        primeiro_acesso = FALSE,
        credencial_utilizada_em = NOW(),
        credencial_expira_em = NULL,
        versao_sessao = versao_sessao + 1,
        atualizado_em = NOW()
      WHERE id = $1
      `,
      [usuario.id, senhaHash]
    );

    await client.query("COMMIT");
    transacaoAberta = false;

    return res.json({
      message: "Senha definida com sucesso. Faca seu login.",
    });
  } catch (error) {
    await rollbackSeguro(client, transacaoAberta);

    return res.status(400).json({
      message: "Link invalido ou expirado.",
    });
  } finally {
    client?.release();
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  return res.json({
    usuario: req.user,
  });
});

module.exports = router;
