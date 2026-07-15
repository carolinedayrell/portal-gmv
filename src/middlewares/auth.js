const PERFIS_ACESSO_TOTAL = new Set(["MESTRE", "GERENTE_CSC"]);

async function shoppingScopeMiddleware(req, res, next) {
  try {
    const perfil = String(req.user?.perfil || "").toUpperCase();

    if (PERFIS_ACESSO_TOTAL.has(perfil)) {
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

    next();
  } catch (error) {
    console.error("Erro ao carregar escopo de shoppings:", error);
    res.status(500).json({
      message: "Erro ao validar os shoppings permitidos.",
    });
  }
}

async function shoppingScopeMiddleware(req, res, next) {
  try {
    const perfil = String(req.user?.perfil || "").toUpperCase();

    if (PERFIS_ACESSO_TOTAL.has(perfil)) {
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

    next();
  } catch (error) {
    console.error("Erro ao carregar escopo de shoppings:", error);
    res.status(500).json({
      message: "Erro ao validar os shoppings permitidos.",
    });
  }
}

const jwt = require("jsonwebtoken");
const pool = require("../db");

function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "Token nao informado." });
    }

    const [, token] = authHeader.split(" ");

    if (!token) {
      return res.status(401).json({ message: "Token invalido." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({ message: "Sessao invalida ou expirada." });
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

      const permitido = result.rows[0]?.pode_visualizar;

      if (!permitido) {
        return res.status(403).json({
          message: "Voce nao tem permissao para acessar este modulo.",
        });
      }

      next();
    } catch (error) {
      console.error("Erro ao validar permissao:", error);
      res.status(500).json({ message: "Erro ao validar permissao." });
    }
  };
}

module.exports = {
  authMiddleware,
  requireModule,
  shoppingScopeMiddleware,
};