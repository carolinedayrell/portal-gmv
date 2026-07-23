const jwt = require("jsonwebtoken");
const pool = require("../db");
const {
  sessaoEstaAtiva,
} = require("../services/usuario-acesso.service");

const PERFIS_ACESSO_TOTAL = new Set(["MESTRE", "GERENTE_CSC"]);

function extrairBearerToken(req) {
  const authHeader = String(req.headers.authorization || "");
  const [tipo, token] = authHeader.split(" ");

  if (tipo !== "Bearer" || !token) return null;
  return token;
}

async function authMiddleware(req, res, next) {
  const token = extrairBearerToken(req);

  if (!token) {
    return res.status(401).json({ message: "Token nao informado." });
  }

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch {
    return res.status(401).json({
      message: "Sessao invalida ou expirada.",
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        id,
        nome,
        email,
        perfil,
        ativo,
        status_cadastro,
        primeiro_acesso,
        versao_sessao
      FROM portal_usuarios
      WHERE id = $1
      LIMIT 1
      `,
      [decoded.id]
    );

    const usuario = result.rows[0];
    if (!sessaoEstaAtiva(decoded, usuario)) {
      return res.status(401).json({
        message: "Sessao invalida ou expirada.",
      });
    }

    req.user = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      primeiroAcesso: usuario.primeiro_acesso,
      versaoSessao: usuario.versao_sessao,
    };

    return next();
  } catch (error) {
    console.error("Erro ao validar sessao no banco:", {
      code: error?.code,
      message: error?.message,
    });

    return res.status(503).json({
      message:
        "Nao foi possivel validar a sessao. Tente novamente em instantes.",
    });
  }
}

function requireModule(moduleName) {
  return async function (req, res, next) {
    try {
      const result = await pool.query(
        `
        SELECT pode_visualizar
        FROM portal_permissoes
        WHERE perfil = $1
          AND modulo = $2
        `,
        [req.user.perfil, moduleName]
      );

      if (!result.rows[0]?.pode_visualizar) {
        return res.status(403).json({
          message: "Voce nao tem permissao para acessar este modulo.",
        });
      }

      return next();
    } catch (error) {
      console.error("Erro ao validar permissao:", error);
      return res.status(500).json({
        message: "Erro ao validar permissao.",
      });
    }
  };
}

async function shoppingScopeMiddleware(req, res, next) {
  try {
    if (PERFIS_ACESSO_TOTAL.has(req.user.perfil)) {
      req.shoppingScope = {
        acessoTotal: true,
        shoppingIds: null,
      };

      return next();
    }

    const result = await pool.query(
      `
      SELECT DISTINCT coligada_totvs::text AS id
      FROM portal_usuario_shopping
      WHERE usuario_id = $1
        AND coligada_totvs IS NOT NULL
        AND TRIM(coligada_totvs::text) <> ''
      `,
      [req.user.id]
    );

    req.shoppingScope = {
      acessoTotal: false,
      shoppingIds: result.rows.map((row) => String(row.id)),
    };

    return next();
  } catch (error) {
    console.error("Erro ao carregar escopo de shoppings:", error);
    return res.status(500).json({
      message: "Erro ao validar os shoppings permitidos.",
    });
  }
}

module.exports = {
  authMiddleware,
  requireModule,
  shoppingScopeMiddleware,
};
