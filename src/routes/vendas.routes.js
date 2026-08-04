const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");

const {
  authMiddleware,
  requireModulePermission,
  shoppingScopeMiddleware,
} = require("../middlewares/auth");

const router = express.Router();

const NOME_MODELO_VENDAS =
  "modelo-importacao-vendas-v1.xlsx";

const CAMINHO_MODELO_VENDAS = path.join(
  __dirname,
  "..",
  "assets",
  "modelos",
  NOME_MODELO_VENDAS
);

const TIPO_CONTEUDO_EXCEL =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const pool = require("../db");
const {
  lerArquivoVendas,
  validarLinhasVendas,
} = require("../services/vendas-importacao.service");
const {
  confirmarImportacao,
  criarImportacao,
  listarImportacoes,
  marcarImportacaoComErro,
  obterContratosOficiais,
  obterImportacaoDetalhada,
  salvarResultadoValidacao,
} = require("../services/vendas-dados.service");
const {
  consultarRelatorioVendas,
  gerarExcelOcorrencias,
  gerarExcelRelatorioVendas,
} = require("../services/vendas-relatorio.service");
const {
  SHOPPINGS_VENDAS,
} = require("../utils/vendas-shoppings");

const receberArquivoExcel = express.raw({
  type: [TIPO_CONTEUDO_EXCEL, "application/octet-stream"],
  limit: "10mb",
});

const importacaoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message:
      "Muitas tentativas de importação. Aguarde alguns minutos e tente novamente.",
  },
});

function receberArquivoExcelComErroJson(req, res, next) {
  receberArquivoExcel(req, res, (error) => {
    if (!error) return next();

    if (error.type === "entity.too.large") {
      return res.status(413).json({
        message: "O arquivo ultrapassa o limite de 10 MB.",
        code: "ARQUIVO_MUITO_GRANDE",
      });
    }

    return res.status(400).json({
      message: "Não foi possível receber o arquivo.",
      code: "ARQUIVO_NAO_RECEBIDO",
    });
  });
}

function nomeArquivoRecebido(req) {
  const cabecalho = String(
    req.headers["x-file-name"] || "vendas.xlsx"
  );
  let decodificado = cabecalho;

  try {
    decodificado = decodeURIComponent(cabecalho);
  } catch {
    decodificado = cabecalho;
  }

  return path.basename(decodificado).slice(0, 255);
}

function responderErroRota(res, error, mensagemPadrao) {
  const status = Number(error?.status) || 500;

  if (status >= 500) {
    console.error("[VENDAS] Erro na requisição:", {
      code: error?.code,
      message: error?.message,
    });
  }

  return res.status(status).json({
    message: error?.message || mensagemPadrao,
    code: error?.code || "ERRO_INTERNO",
  });
}

/**
 * Verifica se o arquivo existe, é um arquivo regular e não está vazio.
 *
 * Essa verificação evita responder com sucesso quando o modelo estiver
 * ausente, corrompido ou tiver sido criado como um arquivo vazio.
 */
async function verificarModeloDisponivel() {
  const arquivo = await fs.promises.stat(
    CAMINHO_MODELO_VENDAS
  );

  if (!arquivo.isFile() || arquivo.size <= 0) {
    const error = new Error(
      "O modelo de importação de vendas está indisponível."
    );

    error.code = "MODELO_VENDAS_INVALIDO";
    throw error;
  }

  return arquivo;
}

/**
 * Todas as rotas de Vendas exigem uma sessão válida.
 *
 * O authMiddleware consulta novamente o usuário no banco e não depende
 * somente das informações gravadas no token.
 */
router.use(authMiddleware);

/**
 * GET /api/vendas/modelo
 *
 * Baixa o modelo oficial de importação de vendas.
 *
 * Permissão exigida:
 * - módulo: VENDAS
 * - ação: pode_criar
 *
 * O modelo não contém dados de shopping. Por isso, este endpoint não
 * precisa do shoppingScopeMiddleware.
 */
router.get(
  "/modelo",
  requireModulePermission(
    "VENDAS",
    "pode_criar"
  ),
  async (req, res) => {
    try {
      await verificarModeloDisponivel();
    } catch (error) {
      console.error(
        "[VENDAS] Modelo de importação indisponível:",
        {
          code: error?.code,
          message: error?.message,
        }
      );

      return res.status(503).json({
        message:
          "O modelo de importação de vendas não está disponível no momento.",
      });
    }

    res.setHeader(
      "Content-Type",
      TIPO_CONTEUDO_EXCEL
    );

    res.setHeader(
      "Cache-Control",
      "private, no-store, max-age=0"
    );

    res.setHeader(
      "X-Content-Type-Options",
      "nosniff"
    );

    return res.download(
      CAMINHO_MODELO_VENDAS,
      NOME_MODELO_VENDAS,
      (error) => {
        if (!error) return;

        console.error(
          "[VENDAS] Erro durante o download do modelo:",
          {
            code: error?.code,
            message: error?.message,
            usuarioId: req.user?.id,
          }
        );

        if (!res.headersSent) {
          res.status(500).json({
            message:
              "Não foi possível baixar o modelo de importação.",
          });

          return;
        }

        if (!res.writableEnded) {
          res.end();
        }
      }
    );
  }
);

/**
 * GET /api/vendas/filtros
 *
 * Retorna apenas os shoppings que o usuário
 * autenticado pode visualizar.
 */
router.get(
  "/filtros",
  requireModulePermission(
    "VENDAS",
    "pode_visualizar"
  ),
  shoppingScopeMiddleware,
  async (req, res) => {
    try {
      const autorizados = req.shoppingScope.acessoTotal
        ? null
        : new Set(req.shoppingScope.shoppingIds.map(String));
      const shoppingsDisponiveis = SHOPPINGS_VENDAS.filter(
        ({ id }) => !autorizados || autorizados.has(id)
      );

      if (!shoppingsDisponiveis.length) {
        return res.json({ shoppings: [] });
      }

      const resultado = await pool.query(
        `
        SELECT DISTINCT num_shopping::text AS id
        FROM gbi_shopping
        WHERE num_shopping IS NOT NULL
          AND num_shopping::text = ANY($1::text[])
        `,
        [shoppingsDisponiveis.map(({ id }) => id)]
      );
      const idsExistentes = new Set(
        resultado.rows.map(({ id }) => String(id))
      );

      return res.json({
        shoppings: shoppingsDisponiveis.filter(
          ({ id }) => idsExistentes.has(id)
        ),
      });
    } catch (error) {
      console.error(
        "[VENDAS] Erro ao carregar filtros:",
        {
          code: error?.code,
          message: error?.message,
          usuarioId: req.user?.id,
        }
      );

      return res.status(500).json({
        message:
          "Não foi possível carregar os shoppings.",
      });
    }
  }
);

router.post(
  "/importacoes/validar",
  importacaoLimiter,
  requireModulePermission("VENDAS", "pode_criar"),
  shoppingScopeMiddleware,
  receberArquivoExcelComErroJson,
  async (req, res) => {
    if (String(req.headers["x-rules-accepted"] || "") !== "true") {
      return res.status(400).json({
        message:
          "Confirme que leu e compreendeu as regras antes de validar o arquivo.",
        code: "REGRAS_NAO_ACEITAS",
      });
    }

    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({
        message: "Selecione um arquivo .xlsx para validar.",
        code: "ARQUIVO_VAZIO",
      });
    }

    const arquivoNome = nomeArquivoRecebido(req);

    if (!arquivoNome.toLowerCase().endsWith(".xlsx")) {
      return res.status(400).json({
        message: "O arquivo deve utilizar o formato .xlsx.",
        code: "EXTENSAO_INVALIDA",
      });
    }

    const arquivoHash = crypto
      .createHash("sha256")
      .update(req.body)
      .digest("hex");

    let importacaoId;
    let validacaoSalva = false;

    try {
      importacaoId = await criarImportacao({
        usuario: req.user,
        arquivoNome,
        arquivoHash,
        arquivoTamanho: req.body.length,
      });

      const linhasRecebidas = await lerArquivoVendas(req.body);
      const contratos = linhasRecebidas
        .map((linha) => linha.contratoInformado)
        .filter(Boolean);
      const oficiais = await obterContratosOficiais(contratos);
      const validacao = validarLinhasVendas(
        linhasRecebidas,
        oficiais,
        req.shoppingScope.shoppingIds
      );

      await salvarResultadoValidacao(importacaoId, validacao);
      validacaoSalva = true;

      if (validacao.encontrouShoppingNaoAutorizado) {
        return res.status(403).json({
          importacaoId,
          status: "REJEITADA",
          message:
            "A carga inteira foi rejeitada porque contém shopping não autorizado.",
          code: "CARGA_COM_SHOPPING_NAO_AUTORIZADO",
        });
      }

      const detalhe = await obterImportacaoDetalhada(
        importacaoId,
        req.user,
        { pagina: 1, limite: 200 },
        req.shoppingScope
      );

      return res
        .status(validacao.totalErros ? 422 : 201)
        .json(detalhe);
    } catch (error) {
      if (importacaoId && !validacaoSalva) {
        try {
          await marcarImportacaoComErro(importacaoId, {
            codigo: error?.code || "ERRO_VALIDACAO_ARQUIVO",
            mensagem:
              error?.message || "Não foi possível validar o arquivo.",
          });
        } catch (registroError) {
          console.error(
            "[VENDAS] Falha ao registrar erro da importação:",
            registroError
          );
        }
      }

      const status = [
        "ARQUIVO_XLSX_INVALIDO",
        "PLANILHA_IMPORTACAO_AUSENTE",
        "CABECALHO_INVALIDO",
        "LIMITE_LINHAS_EXCEDIDO",
        "ARQUIVO_SEM_DADOS",
      ].includes(error?.code)
        ? 422
        : 500;

      return res.status(status).json({
        importacaoId,
        message:
          error?.message || "Não foi possível validar o arquivo.",
        code: error?.code || "ERRO_VALIDACAO_ARQUIVO",
      });
    }
  }
);

router.get(
  "/importacoes",
  requireModulePermission("VENDAS", "pode_visualizar"),
  shoppingScopeMiddleware,
  async (req, res) => {
    try {
      const resultado = await listarImportacoes(
        req.user,
        req.shoppingScope,
        req.query
      );

      return res.json(resultado);
    } catch (error) {
      return responderErroRota(
        res,
        error,
        "Não foi possível consultar o histórico de importações."
      );
    }
  }
);

router.get(
  "/importacoes/:id",
  requireModulePermission("VENDAS", "pode_criar"),
  shoppingScopeMiddleware,
  async (req, res) => {
    try {
      const detalhe = await obterImportacaoDetalhada(
        req.params.id,
        req.user,
        req.query,
        req.shoppingScope
      );

      return res.json(detalhe);
    } catch (error) {
      return responderErroRota(
        res,
        error,
        "Não foi possível consultar a importação."
      );
    }
  }
);

router.get(
  "/importacoes/:id/ocorrencias.xlsx",
  requireModulePermission("VENDAS", "pode_criar"),
  shoppingScopeMiddleware,
  async (req, res) => {
    try {
      const arquivo = await gerarExcelOcorrencias(
        req.params.id,
        req.user,
        req.shoppingScope
      );

      res.setHeader("Content-Type", TIPO_CONTEUDO_EXCEL);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="ocorrencias-vendas-${req.params.id}.xlsx"`
      );
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      return res.send(Buffer.from(arquivo));
    } catch (error) {
      return responderErroRota(
        res,
        error,
        "Não foi possível exportar as ocorrências."
      );
    }
  }
);

router.post(
  "/importacoes/:id/confirmar",
  requireModulePermission("VENDAS", "pode_criar"),
  shoppingScopeMiddleware,
  async (req, res) => {
    if (req.body?.confirmarDivergencias !== true) {
      return res.status(400).json({
        message:
          "Confirme explicitamente que revisou as divergências antes de concluir.",
        code: "DIVERGENCIAS_NAO_CONFIRMADAS",
      });
    }

    try {
      const resultado = await confirmarImportacao(
        req.params.id,
        req.user,
        req.shoppingScope
      );

      return res.json(resultado);
    } catch (error) {
      return responderErroRota(
        res,
        error,
        "Não foi possível confirmar a importação."
      );
    }
  }
);

router.get(
  "/relatorio",
  requireModulePermission("VENDAS", "pode_visualizar"),
  shoppingScopeMiddleware,
  async (req, res) => {
    try {
      const resultado = await consultarRelatorioVendas(
        req.query,
        req.shoppingScope
      );

      return res.json(resultado);
    } catch (error) {
      return responderErroRota(
        res,
        error,
        "Não foi possível consultar o relatório de vendas."
      );
    }
  }
);

router.get(
  "/exportacao.xlsx",
  requireModulePermission("VENDAS", "pode_visualizar"),
  shoppingScopeMiddleware,
  async (req, res) => {
    try {
      const arquivo = await gerarExcelRelatorioVendas(
        req.query,
        req.shoppingScope
      );

      res.setHeader("Content-Type", TIPO_CONTEUDO_EXCEL);
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="relatorio-vendas.xlsx"'
      );
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      return res.send(Buffer.from(arquivo));
    } catch (error) {
      return responderErroRota(
        res,
        error,
        "Não foi possível exportar o relatório de vendas."
      );
    }
  }
);

module.exports = router;
