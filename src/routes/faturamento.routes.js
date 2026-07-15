const ExcelJS = require("exceljs");
const express = require("express");
const pool = require("../db");
const {
  authMiddleware,
  shoppingScopeMiddleware,
} = require("../middlewares/auth");
const {
  gerarWorkbookDetalhado,
} = require("../services/faturado-recebido-detalhado.service");

const router = express.Router();

router.use(authMiddleware, shoppingScopeMiddleware);

const DATA_MINIMA_BUSCA = "2024-01-01";
const FATURAMENTO_CACHE_TTL_MS = Number(process.env.FATURAMENTO_CACHE_TTL_MS || 4 * 60 * 60 * 1000);
const FATURAMENTO_EXPORT_COLUMNS = [
  { id: "idlancamento", label: "ID Lançamento" },
  { id: "data_baixa", label: "Data de baixa", type: "date" },
  { id: "competencia", label: "Competência" },
  { id: "shopping", label: "Shopping" },
  { id: "contrato", label: "Contrato" },
  { id: "tipo_loja", label: "Tipo Loja" },
  { id: "loja", label: "Loja" },
  { id: "tipo", label: "Tipo" },
  { id: "nome_da_classe", label: "Classe" },
  { id: "area", label: "Área", type: "number" },
  { id: "valor_lancado", label: "Valor Lançado", type: "money" },
  { id: "descontos", label: "Descontos", type: "money" },
  { id: "juros", label: "Juros", type: "money" },
  { id: "correcoes", label: "Correções", type: "money" },
  { id: "multa", label: "Multa", type: "money" },
  { id: "valor_faturado_total", label: "Faturado Total", type: "money" },
  { id: "valor_liquidado", label: "Valor Liquidado", type: "money" },
  { id: "valor_m2", label: "R$/m²", type: "number" },
];

const faturamentoCache = {
  dados: null,
  carregadoEm: null,
  expiraEm: 0,
  carregando: null,
};

function splitParam(value) {
  return value ? String(value).split(",").filter(Boolean) : [];
}

function competenciaSql(alias = "c") {
  return `NULLIF(${alias}.mes_mapa::text, '')`;
}

function competenciaValidaSql(alias = "c") {
  return `${competenciaSql(alias)} ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'`;
}

function dataCompetenciaSql(alias = "c") {
  return `TO_DATE(${competenciaSql(alias)}, 'MM/YYYY')`;
}

function obterCompetenciaAlvoPelaDataAtual() {
  const hoje = new Date();
  let mes = hoje.getMonth() + 1;
  let ano = hoje.getFullYear();

  if (hoje.getDate() <= 15) {
    mes -= 1;

    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
  }

  return `${String(mes).padStart(2, "0")}/${ano}`;
}

function tipoLojaSql(alias = "c") {
  return `
    CASE ${alias}.tipo_loja
      WHEN 'M' THEN 'ADM'
      WHEN 'A' THEN 'ANCORA'
      WHEN 'B' THEN 'BANCO'
      WHEN 'X' THEN 'BOX'
      WHEN 'D' THEN 'DEPOSITO'
      WHEN 'C' THEN 'DEPOSITO L'
      WHEN 'H' THEN 'ESCRITORIO'
      WHEN 'E' THEN 'ESTACIONAMENTO'
      WHEN 'L' THEN 'LOJAS'
      WHEN 'J' THEN 'LOJAS'
      WHEN 'G' THEN 'MEGABOX'
      WHEN 'F' THEN 'MEZANINO II'
      WHEN 'N' THEN 'MEZANINO III'
      WHEN 'K' THEN 'MEZANINO IIII'
      WHEN 'Q' THEN 'QUIOSQUE'
      WHEN 'R' THEN 'RESTAURANTE'
      WHEN 'S' THEN 'STAND'
      WHEN 'T' THEN 'TEMPORARIA'
      WHEN 'V' THEN 'VITRINE'
      WHEN 'P' THEN 'PAINEL'
      ELSE 'OUTROS'
    END
  `;
}

function tipoSql(alias = "c") {
  return `
    CASE ${alias}.num_classe_da_conta::text
      WHEN '1' THEN 'ALUGUEL'
      WHEN '2' THEN 'COND. + FPP'
      WHEN '3' THEN 'COND. + FPP'
      WHEN '4' THEN 'COND. + FPP'
      WHEN '5' THEN 'COND. + FPP'
      WHEN '6' THEN 'ALUGUEL'
      WHEN '7' THEN 'ALUGUEL'
      WHEN '9' THEN 'COND. + FPP'
      WHEN '11' THEN 'ALUGUEL'
      WHEN '13' THEN 'CDU'
      WHEN '14' THEN 'ESPECÍFICOS'
      WHEN '18' THEN 'COND. + FPP'
      WHEN '11506' THEN 'ALUGUEL'
      WHEN '2111' THEN 'ALUGUEL'
      WHEN '11582' THEN 'ESPECÍFICOS'
      WHEN '11505' THEN 'ESPECÍFICOS'
      WHEN '11503' THEN 'ESPECÍFICOS'
      WHEN '11233' THEN 'ESPECÍFICOS'
      WHEN '1250' THEN 'ESPECÍFICOS'
      WHEN '482' THEN 'ESPECÍFICOS'
      WHEN '434' THEN 'ESPECÍFICOS'
      WHEN '145' THEN 'ESPECÍFICOS'
      WHEN '23' THEN 'ESPECÍFICOS'
      WHEN '1245' THEN 'ESPECÍFICOS'
      WHEN '1099' THEN 'ESPECÍFICOS'
      WHEN '460' THEN 'ESPECÍFICOS'
      WHEN '246' THEN 'ESPECÍFICOS'
      WHEN '144' THEN 'ESPECÍFICOS'
      WHEN '412' THEN 'ESPECÍFICOS'
      WHEN '111' THEN 'ESPECÍFICOS'
      WHEN '156' THEN 'ESPECÍFICOS'
      WHEN '56' THEN 'ESPECÍFICOS'
      WHEN '11264' THEN 'ESPECÍFICOS'
      WHEN '11459' THEN 'COND. + FPP'
      WHEN '11415' THEN 'COND. + FPP'
      WHEN '1244' THEN 'ESPECÍFICOS'
      WHEN '1100' THEN 'ESPECÍFICOS'
      WHEN '459' THEN 'ESPECÍFICOS'
      WHEN '411' THEN 'ESPECÍFICOS'
      WHEN '143' THEN 'ESPECÍFICOS'
      WHEN '25' THEN 'ESPECÍFICOS'
      WHEN '11236' THEN 'ESPECÍFICOS'
      WHEN '11235' THEN 'ESPECÍFICOS'
      WHEN '11229' THEN 'ESPECÍFICOS'
      WHEN '11225' THEN 'ESPECÍFICOS'
      WHEN '217' THEN 'ESPECÍFICOS'
      WHEN '138' THEN 'ESPECÍFICOS'
      WHEN '11257' THEN 'ESPECÍFICOS'
      WHEN '1297' THEN 'ESPECÍFICOS'
      WHEN '1296' THEN 'ESPECÍFICOS'
      WHEN '1097' THEN 'ESPECÍFICOS'
      WHEN '176' THEN 'ESPECÍFICOS'
      WHEN '11527' THEN 'ESPECÍFICOS'
      WHEN '11240' THEN 'ALUGUEL'
      WHEN '11509' THEN 'ESPECÍFICOS'
      WHEN '278' THEN 'ALUGUEL'
      WHEN '78' THEN 'ALUGUEL'
      WHEN '11238' THEN 'ALUGUEL'
      ELSE 'ESPECÍFICOS'
    END
  `;
}

function valorFaturadoSql(alias = "c") {
  return `
    COALESCE(${alias}.valor_lcto, 0) +
    -COALESCE(${alias}.descontos, 0) +
    COALESCE(${alias}.juros, 0) +
    COALESCE(${alias}.correcoes, 0) +
    COALESCE(${alias}.multa, 0)
  `;
}

function baseFromSql() {
  return `
    FROM gshop_contas c
    LEFT JOIN gbi_shopping s
      ON s.num_shopping::text = c.idfilial::text
    LEFT JOIN gshop_classes_de_contas nc
      ON nc.num_classe_da_conta::text = c.num_classe_da_conta::text
    LEFT JOIN gshop_locatarios l
      ON l.num_locatario::text = c.num_locatario::text
    LEFT JOIN gshop_nomes_de_encargos ne
      ON ne.num_classe::text = c.num_classe_contabilizacao::text
    LEFT JOIN (
      SELECT
        id_filial,
        num_locacao,
        num_loja,
        MAX(area_total) AS area_total
      FROM gshop_lojas_contratadas
      GROUP BY id_filial, num_locacao, num_loja
    ) lc
      ON lc.id_filial::text = c.idfilial::text
     AND lc.num_locacao::text = c.num_locacao::text
     AND lc.num_loja::text = c.num_loja::text
  `;
}

function filtrarBasePorEscopo(base, shoppingIdsPermitidos) {
  if (!Array.isArray(shoppingIdsPermitidos)) {
    return base;
  }

  const permitidos = new Set(
    shoppingIdsPermitidos.map((id) => String(id))
  );

  return base.filter((item) =>
    permitidos.has(String(item.shopping_id))
  );
}

async function obterCompetenciasRecentes(
  limite = 3,
  shoppingIdsPermitidos = null
) {
  const base = filtrarBasePorEscopo(
    await obterBaseFaturamento(),
    shoppingIdsPermitidos
  );

  const competencias = obterCompetenciasDaBase(base);

  return competencias
    .slice(0, limite)
    .map((row) => row.competencia);
}

async function obterCompetenciaInicial(
  shoppingIdsPermitidos = null
) {
  const competenciaAlvo = obterCompetenciaAlvoPelaDataAtual();
  const limite = dataCompetenciaTimestamp(competenciaAlvo);

  const base = filtrarBasePorEscopo(
    await obterBaseFaturamento(),
    shoppingIdsPermitidos
  );

  const competencias = obterCompetenciasDaBase(base);

  return (
    competencias.find((item) => item.ordem <= limite)?.competencia ||
    null
  );
}

function numeroCache(value) {
  return Number(value || 0);
}

function dataCompetenciaTimestamp(competencia) {
  const [mes, ano] = String(competencia || "").split("/").map(Number);
  return Date.UTC(ano || 0, (mes || 1) - 1, 1);
}

function dataParaJson(value) {
  if (!value) return null;
  const data = value instanceof Date ? value : new Date(value);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function cacheMeta() {
  return {
    ultimaAtualizacao: faturamentoCache.carregadoEm
      ? faturamentoCache.carregadoEm.toISOString()
      : null,
    expiraEm: faturamentoCache.expiraEm
      ? new Date(faturamentoCache.expiraEm).toISOString()
      : null,
  };
}

function cacheValido() {
  return Array.isArray(faturamentoCache.dados) && Date.now() < faturamentoCache.expiraEm;
}

async function obterBaseFaturamento({ force = false } = {}) {
  if (!force && cacheValido()) {
    return faturamentoCache.dados;
  }

  if (faturamentoCache.carregando) {
    return faturamentoCache.carregando;
  }

  faturamentoCache.carregando = (async () => {
    const result = await pool.query(`
      SELECT
        c.idlancamento::text AS idlancamento,
        ${competenciaSql("c")} AS competencia,
        EXTRACT(EPOCH FROM ${dataCompetenciaSql("c")}) * 1000 AS competencia_ts,
        c.idfilial::text AS shopping_id,
        COALESCE(s.nome_reduzido_coligada, s.nome_shopping, c.idfilial::text) AS shopping,
        c.num_locacao::text AS contrato,
        ${tipoLojaSql("c")} AS tipo_loja,
        l.num_locatario::text AS loja_id,
        COALESCE(l.nome_fantasia, l.num_locatario::text) AS loja,
        ${tipoSql("c")} AS tipo,
        nc.nome_da_classe,
        COALESCE(lc.area_total, 0) AS area,
        COALESCE(c.valor_lcto, 0) AS valor_lancado,
        COALESCE(c.descontos, 0) AS descontos,
        COALESCE(c.juros, 0) AS juros,
        COALESCE(c.correcoes, 0) AS correcoes,
        COALESCE(c.multa, 0) AS multa,
        ${valorFaturadoSql("c")} AS valor_faturado_total,
        COALESCE(c.valor_liquidado, 0) AS valor_liquidado,
        c.data_pagamento AS data_baixa
      ${baseFromSql()}
      WHERE ${competenciaValidaSql("c")}
        AND ${dataCompetenciaSql("c")} >= '${DATA_MINIMA_BUSCA}'::date
        AND NOT EXISTS (
          SELECT 1
          FROM gshop_contas reemitida
          WHERE reemitida.idlancamento_origem_acordo IS NOT NULL
            AND reemitida.idlancamento_origem_acordo::text = c.idlancamento::text
        )
    `);

    faturamentoCache.dados = result.rows.map((row) => ({
      ...row,
      competencia_ordem: Number(row.competencia_ts || 0),
      area: numeroCache(row.area),
      valor_lancado: numeroCache(row.valor_lancado),
      descontos: numeroCache(row.descontos),
      juros: numeroCache(row.juros),
      correcoes: numeroCache(row.correcoes),
      multa: numeroCache(row.multa),
      valor_faturado_total: numeroCache(row.valor_faturado_total),
      valor_liquidado: numeroCache(row.valor_liquidado),
      data_baixa: dataParaJson(row.data_baixa),
    }));
    faturamentoCache.carregadoEm = new Date();
    faturamentoCache.expiraEm = Date.now() + FATURAMENTO_CACHE_TTL_MS;

    return faturamentoCache.dados;
  })();

  try {
    return await faturamentoCache.carregando;
  } finally {
    faturamentoCache.carregando = null;
  }
}

function obterCompetenciasDaBase(base) {
  const mapa = new Map();

  base.forEach((item) => {
    if (!item.competencia) return;
    const atual = mapa.get(item.competencia);
    if (!atual || item.competencia_ordem > atual.ordem) {
      mapa.set(item.competencia, {
        competencia: item.competencia,
        ordem: item.competencia_ordem,
      });
    }
  });

  return Array.from(mapa.values()).sort((a, b) => b.ordem - a.ordem);
}

async function aplicarFiltros(query, options = {}) {
  const params = [];
  const where = [
    competenciaValidaSql("c"),
    `${dataCompetenciaSql("c")} >= '${DATA_MINIMA_BUSCA}'::date`,
    `NOT EXISTS (
      SELECT 1
      FROM gshop_contas reemitida
      WHERE reemitida.idlancamento_origem_acordo IS NOT NULL
        AND reemitida.idlancamento_origem_acordo::text = c.idlancamento::text
    )`,
  ];

const shoppings = splitParam(query.shopping);
const lojas = splitParam(query.loja);
const tipos = splitParam(query.tipo);
const tiposLoja = splitParam(query.tipoLoja);
const competencias = splitParam(query.competencia);
const idsLancamento = splitParam(query.idlancamento);

  if (!options.ignorarCompetencia) {
    if (competencias.length) {
      params.push(competencias);
      where.push(`${competenciaSql("c")} = ANY($${params.length})`);
    } else if (options.usarUltimasCompetencias) {
      const competenciasRecentes = await obterCompetenciasRecentes(3);

      if (competenciasRecentes.length) {
        params.push(competenciasRecentes);
        where.push(`${competenciaSql("c")} = ANY($${params.length})`);
      }
    }
  }

if (!options.ignorarIdLancamento && idsLancamento.length) {
  params.push(idsLancamento);
  where.push(`c.idlancamento::text = ANY($${params.length})`);
}

  if (!options.ignorarShopping && shoppings.length) {
    params.push(shoppings);
    where.push(`c.idfilial::text = ANY($${params.length})`);
  }

  if (!options.ignorarLoja && lojas.length) {
    params.push(lojas);
    where.push(`l.num_locatario::text = ANY($${params.length})`);
  }

  if (!options.ignorarTipo && tipos.length) {
    params.push(tipos);
    where.push(`${tipoSql("c")} = ANY($${params.length})`);
  }

  if (!options.ignorarTipoLoja && tiposLoja.length) {
    params.push(tiposLoja);
    where.push(`${tipoLojaSql("c")} = ANY($${params.length})`);
  }

  return {
    params,
    whereSql: `WHERE ${where.join(" AND ")}`,
  };
}

function getCampoConfig(campo) {
  const configs = {
    shopping: {
      ignorar: "ignorarShopping",
      idSql: "c.idfilial::text",
      nomeSql: "COALESCE(s.nome_reduzido_coligada, s.nome_shopping, c.idfilial::text)",
      buscaSql: `
        COALESCE(s.nome_reduzido_coligada, '') ILIKE $BUSCA
        OR COALESCE(s.nome_shopping, '') ILIKE $BUSCA
        OR c.idfilial::text ILIKE $BUSCA
      `,
      extraWhere: "c.idfilial IS NOT NULL",
    },
    loja: {
      ignorar: "ignorarLoja",
      idSql: "l.num_locatario::text",
      nomeSql: "COALESCE(l.nome_fantasia, l.num_locatario::text)",
      buscaSql: `
        COALESCE(l.nome_fantasia, '') ILIKE $BUSCA
        OR l.num_locatario::text ILIKE $BUSCA
      `,
      extraWhere: "l.num_locatario IS NOT NULL",
    },
    tipo: {
      ignorar: "ignorarTipo",
      idSql: tipoSql("c"),
      nomeSql: tipoSql("c"),
      buscaSql: `${tipoSql("c")} ILIKE $BUSCA`,
      extraWhere: "c.num_classe_da_conta IS NOT NULL",
    },
    tipoLoja: {
      ignorar: "ignorarTipoLoja",
      idSql: tipoLojaSql("c"),
      nomeSql: tipoLojaSql("c"),
      buscaSql: `${tipoLojaSql("c")} ILIKE $BUSCA`,
      extraWhere: "c.tipo_loja IS NOT NULL",
    },
    competencia: {
      ignorar: "ignorarCompetencia",
      idSql: competenciaSql("c"),
      nomeSql: competenciaSql("c"),
      buscaSql: `${competenciaSql("c")} ILIKE $BUSCA`,
      extraWhere: `${competenciaSql("c")} IS NOT NULL`,
    },
    idlancamento: {
  ignorar: "ignorarIdLancamento",
  idSql: "c.idlancamento::text",
  nomeSql: "c.idlancamento::text",
  buscaSql: "c.idlancamento::text ILIKE $BUSCA",
  extraWhere: "c.idlancamento IS NOT NULL",
},
  };

  return configs[campo];
}

function valorCampoFiltro(item, campo) {
  const mapa = {
    shopping: item.shopping_id,
    loja: item.loja_id,
    tipo: item.tipo,
    tipoLoja: item.tipo_loja,
    competencia: item.competencia,
    idlancamento: item.idlancamento,
  };

  return mapa[campo];
}


function filtrarBase(base, query, options = {}) {
  const baseAutorizada = filtrarBasePorEscopo(
    base,
    options.shoppingIdsPermitidos
  );

  const filtros = {
    shopping: splitParam(query.shopping),
    loja: splitParam(query.loja),
    tipo: splitParam(query.tipo),
    tipoLoja: splitParam(query.tipoLoja),
    competencia: splitParam(query.competencia),
    idlancamento: splitParam(query.idlancamento),
  };

  return baseAutorizada.filter((item) => {
    if (!options.ignorarCompetencia && filtros.competencia.length && !filtros.competencia.includes(item.competencia)) {
      return false;
    }

    if (!options.ignorarIdLancamento && filtros.idlancamento.length && !filtros.idlancamento.includes(item.idlancamento)) {
      return false;
    }

    if (!options.ignorarShopping && filtros.shopping.length && !filtros.shopping.includes(item.shopping_id)) {
      return false;
    }

    if (!options.ignorarLoja && filtros.loja.length && !filtros.loja.includes(item.loja_id)) {
      return false;
    }

    if (!options.ignorarTipo && filtros.tipo.length && !filtros.tipo.includes(item.tipo)) {
      return false;
    }

    if (!options.ignorarTipoLoja && filtros.tipoLoja.length && !filtros.tipoLoja.includes(item.tipo_loja)) {
      return false;
    }

    return true;
  });
}

function agruparRelatorio(base) {
  const grupos = new Map();

  base.forEach((item) => {
    const chave = [
      item.competencia,
      item.shopping,
      item.contrato,
      item.tipo_loja,
      item.loja,
      item.tipo,
      item.nome_da_classe,
      item.data_baixa || "",
    ].join("|");

    if (!grupos.has(chave)) {
      grupos.set(chave, {
        competencia: item.competencia,
        idlancamentos: new Set(),
        shopping: item.shopping,
        contrato: item.contrato,
        tipo_loja: item.tipo_loja,
        loja: item.loja,
        tipo: item.tipo,
        nome_da_classe: item.nome_da_classe,
        data_baixa: item.data_baixa,
        area: 0,
        valor_lancado: 0,
        descontos: 0,
        juros: 0,
        correcoes: 0,
        multa: 0,
        valor_faturado_total: 0,
        valor_liquidado: 0,
      });
    }

    const grupo = grupos.get(chave);
    grupo.idlancamentos.add(item.idlancamento);
    grupo.area = Math.max(grupo.area, item.area || 0);
    grupo.valor_lancado += item.valor_lancado || 0;
    grupo.descontos += item.descontos || 0;
    grupo.juros += item.juros || 0;
    grupo.correcoes += item.correcoes || 0;
    grupo.multa += item.multa || 0;
    grupo.valor_faturado_total += item.valor_faturado_total || 0;
    grupo.valor_liquidado += item.valor_liquidado || 0;
  });

  return Array.from(grupos.values()).map((grupo) => ({
    ...grupo,
    idlancamento: Array.from(grupo.idlancamentos).sort().join(", "),
    idlancamentos: undefined,
    valor_m2: grupo.area ? grupo.valor_faturado_total / grupo.area : 0,
  }));
}

function ordenarRelatorio(dados) {
  return dados.sort((a, b) => (
    String(a.shopping || "").localeCompare(String(b.shopping || ""), "pt-BR") ||
    String(a.loja || "").localeCompare(String(b.loja || ""), "pt-BR") ||
    String(a.tipo || "").localeCompare(String(b.tipo || ""), "pt-BR") ||
    String(a.nome_da_classe || "").localeCompare(String(b.nome_da_classe || ""), "pt-BR")
  ));
}

async function buscarOpcoes(
  campo,
  query,
  shoppingIdsPermitidos
) {
  const config = getCampoConfig(campo);

  if (!config) {
    const error = new Error("Filtro inválido.");
    error.statusCode = 400;
    throw error;
  }

  const busca = String(query.busca || "").trim();
  const filtrosOptions = {
    usarUltimasCompetencias: !busca,
    [config.ignorar]: true,
  };
  const base = filtrarBase(
    await obterBaseFaturamento(),
    query,
    {
      ...filtrosOptions,
      shoppingIdsPermitidos,
    }
  );
  const termo = busca.toLowerCase();
  const mapa = new Map();

  base.forEach((item) => {
    const id = valorCampoFiltro(item, campo);
    let nome = id;

    if (campo === "shopping") nome = item.shopping;
    if (campo === "loja") nome = item.loja;

    if (!id || !nome) return;

    const textoBusca = `${id} ${nome}`.toLowerCase();
    if (termo && !textoBusca.includes(termo)) return;

    const atual = mapa.get(id);
    if (!atual || item.competencia_ordem > atual.ordem) {
      mapa.set(id, { id, nome, ordem: item.competencia_ordem });
    }
  });

  return Array.from(mapa.values())
    .sort((a, b) => {
      if (campo === "competencia") return b.ordem - a.ordem;
      return String(a.nome).localeCompare(String(b.nome), "pt-BR");
    })
    .slice(0, 80)
    .map(({ id, nome }) => ({ id, nome }));
}

router.get("/filtros", authMiddleware, async (req, res) => {
  try {
const shoppingIdsPermitidos =
  req.shoppingScope.shoppingIds;

const competenciasRecentes = await obterCompetenciasRecentes(
  3,
  shoppingIdsPermitidos
);

const competenciaAtual = await obterCompetenciaInicial(
  shoppingIdsPermitidos
);

    const queryBase = { ...req.query };

    if (!splitParam(queryBase.competencia).length && competenciaAtual) {
      queryBase.competencia = competenciaAtual;
    }

const [
  shoppings,
  lojas,
  tipos,
  tiposLoja,
  competencias,
  idsLancamento,
] = await Promise.all([
  buscarOpcoes(
    "shopping",
    queryBase,
    shoppingIdsPermitidos
  ),
  buscarOpcoes(
    "loja",
    queryBase,
    shoppingIdsPermitidos
  ),
  buscarOpcoes(
    "tipo",
    queryBase,
    shoppingIdsPermitidos
  ),
  buscarOpcoes(
    "tipoLoja",
    queryBase,
    shoppingIdsPermitidos
  ),
  buscarOpcoes(
    "competencia",
    req.query,
    shoppingIdsPermitidos
  ),
  buscarOpcoes(
    "idlancamento",
    queryBase,
    shoppingIdsPermitidos
  ),
]);

    res.json({
      competenciaAtual,
      competenciasRecentes,
      shoppings,
      lojas,
      tipos,
      tiposLoja,
      competencias,
      idsLancamento,
      cache: cacheMeta(),
    });
  } catch (error) {
    console.error("Erro ao buscar filtros de faturamento:", error);
    res.status(error.statusCode || 500).json({
      message: `Erro ao buscar filtros de faturamento: ${error.message}`,
    });
  }
});

router.get("/opcoes/:campo", authMiddleware, async (req, res) => {
  try {
const result = await buscarOpcoes(
  req.params.campo,
  req.query,
  req.shoppingScope.shoppingIds
);
    res.json(result);
  } catch (error) {
    console.error("Erro ao buscar opções de filtro:", error);
    res.status(error.statusCode || 500).json({
      message: `Erro ao buscar opções de filtro: ${error.message}`,
    });
  }
});

router.get("/relatorio", authMiddleware, async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
    const offset = (page - 1) * limit;

    const queryRelatorio = { ...req.query };

    if (!splitParam(queryRelatorio.competencia).length) {
      const competenciaInicial = await obterCompetenciaInicial();

      if (competenciaInicial) {
        queryRelatorio.competencia = competenciaInicial;
      }
    }

    const baseFiltrada = filtrarBase(await obterBaseFaturamento(), queryRelatorio);
    const dadosAgrupados = ordenarRelatorio(agruparRelatorio(baseFiltrada));
    const dadosPagina = dadosAgrupados.slice(offset, offset + limit);

    const resumo = {
      valor_lancado: baseFiltrada.reduce((total, item) => total + item.valor_faturado_total, 0),
      valor_liquidado: baseFiltrada.reduce((total, item) => total + item.valor_liquidado, 0),
    };

    resumo.percentual_recebimento = resumo.valor_lancado
      ? (resumo.valor_liquidado / resumo.valor_lancado) * 100
      : 0;

    const total = dadosAgrupados.length;

    res.json({
      resumo,
      dados: dadosPagina,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      cache: cacheMeta(),
    });
  } catch (error) {
    console.error("Erro no relatório de faturamento:", error);
    res.status(500).json({
      message: `Erro no relatório de faturamento: ${error.message}`,
    });
  }
});

router.post("/relatorio/cache/refresh", authMiddleware, async (req, res) => {
  if (req.user.perfil !== "MESTRE") {
    return res.status(403).json({ message: "Acesso restrito ao perfil MESTRE." });
  }

  try {
    await obterBaseFaturamento({ force: true });
    res.json({ cache: cacheMeta() });
  } catch (error) {
    console.error("Erro ao atualizar cache de faturamento:", error);
    res.status(500).json({
      message: `Erro ao atualizar cache de faturamento: ${error.message}`,
    });
  }
});

function colunasExportacao(query) {
  const solicitadas = splitParam(query.colunas);
  const base = solicitadas.length
    ? FATURAMENTO_EXPORT_COLUMNS.filter((coluna) => solicitadas.includes(coluna.id))
    : FATURAMENTO_EXPORT_COLUMNS.filter((coluna) => coluna.id !== "data_baixa");

  const fixas = FATURAMENTO_EXPORT_COLUMNS.filter((coluna) => (
    coluna.id === "idlancamento" || coluna.id === "data_baixa"
  ));

  return [...fixas, ...base.filter((coluna) => !fixas.some((fixa) => fixa.id === coluna.id))];
}

function preencherCelulaExcel(cell, value, coluna) {
  if (coluna.type === "date") {
    cell.value = value ? new Date(value) : null;
    cell.numFmt = "dd/mm/yyyy";
    return;
  }

  if (coluna.type === "money" || coluna.type === "number") {
    cell.value = Number(value || 0);
    cell.numFmt = coluna.type === "money" ? '#,##0.00' : '#,##0.00';
    return;
  }

  cell.value = value || "";
}

router.get("/relatorio/exportar", authMiddleware, async (req, res) => {
  try {
    const queryRelatorio = { ...req.query };

    if (!splitParam(queryRelatorio.competencia).length) {
      const competenciaInicial = await obterCompetenciaInicial();

      if (competenciaInicial) {
        queryRelatorio.competencia = competenciaInicial;
      }
    }

    const baseFiltrada = filtrarBase(await obterBaseFaturamento(), queryRelatorio);
    const dados = ordenarRelatorio(agruparRelatorio(baseFiltrada));
    const colunas = colunasExportacao(req.query);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Faturamento");

    sheet.columns = colunas.map((coluna) => ({
      header: coluna.label,
      key: coluna.id,
      width: coluna.type === "date" ? 16 : Math.max(14, coluna.label.length + 4),
    }));

    sheet.getRow(1).font = { bold: true };

    dados.forEach((item) => {
      const row = sheet.addRow({});

      colunas.forEach((coluna, index) => {
        preencherCelulaExcel(row.getCell(index + 1), item[coluna.id], coluna);
      });
    });

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: colunas.length },
    };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="relatorio-faturamento.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Erro ao exportar relatório de faturamento:", error);
    res.status(500).json({
      message: `Erro ao exportar relatório de faturamento: ${error.message}`,
    });
  }
});


async function obterShoppingsSelecionadosExcel(
  query,
  shoppingIdsPermitidos
) {
  const shoppingIds = splitParam(query.shopping);

  if (!shoppingIds.length) {
    const error = new Error("Selecione pelo menos um shopping.");
    error.statusCode = 400;
    throw error;
  }

  if (Array.isArray(shoppingIdsPermitidos)) {
    const permitidos = new Set(
      shoppingIdsPermitidos.map((id) => String(id))
    );

    const naoAutorizados = shoppingIds.filter(
      (id) => !permitidos.has(String(id))
    );

    if (naoAutorizados.length) {
      const error = new Error(
        "Um ou mais shoppings selecionados não estão autorizados."
      );

      error.statusCode = 403;
      throw error;
    }
  }

  const result = await pool.query(
    `
    SELECT
      num_shopping::text AS id,
      COALESCE(
        nome_reduzido_coligada,
        nome_shopping,
        num_shopping::text
      ) AS nome
    FROM gbi_shopping
    WHERE num_shopping::text = ANY($1)
    ORDER BY COALESCE(
      nome_reduzido_coligada,
      nome_shopping,
      num_shopping::text
    )
    `,
    [shoppingIds]
  );

  return result.rows;
}


function nomeAbaExcel(value) {
  return String(value || "Relatorio")
    .replace(/[\\/?*[\]:]/g, "-")
    .trim()
    .slice(0, 31);
}

function competenciaMes(ano, mesZeroBased) {
  const data = dataMes(ano, mesZeroBased);
  return `${String(data.getMonth() + 1).padStart(2, "0")}/${data.getFullYear()}`;
}

function obterUltimoDiaUtil(dataBase = new Date()) {
  const data = new Date(dataBase);

  data.setHours(0, 0, 0, 0);
  data.setDate(data.getDate() - 1);

  while (data.getDay() === 0 || data.getDay() === 6) {
    data.setDate(data.getDate() - 1);
  }

  return data;
}

async function buscarValoresMensaisAgregados({ shoppingId, competencias }) {
  const result = await pool.query(
    `
    WITH contas_base AS (
      SELECT
        c.mes_mapa::text AS competencia,
        ${tipoSql("c")} AS tipo,
        ${valorFaturadoSql("c")} AS valor_faturado,
        COALESCE(c.valor_liquidado, 0) AS valor_liquidado,
        c.data_pagamento,
        c.data_definicao
      FROM gshop_contas c
      LEFT JOIN gshop_locatarios l_filtro
        ON l_filtro.num_locatario::text = c.num_locatario::text
      WHERE c.idfilial::text = $1
        AND c.mes_mapa::text = ANY($2)
        AND COALESCE(UPPER(TRIM(l_filtro.nome_fantasia)), '') <> 'EDER BARBOSA DOS REIS'
        AND NOT EXISTS (
          SELECT 1
          FROM gshop_contas reemitida
          WHERE reemitida.idlancamento_origem_acordo IS NOT NULL
            AND reemitida.idlancamento_origem_acordo::text = c.idlancamento::text
        )
    ),
    base AS (
      SELECT
        competencia,
        CASE
          WHEN tipo IN ('COND. + FPP', 'ESPECÍFICOS') THEN 'CONDOMINIO'
          ELSE tipo
        END AS tipo_grupo,
        valor_faturado,
        valor_liquidado,
        data_pagamento,
        data_definicao
      FROM contas_base
      WHERE tipo IN ('ALUGUEL', 'COND. + FPP', 'ESPECÍFICOS', 'CDU')
      )
    SELECT
      competencia,
      tipo_grupo,
      COALESCE(SUM(valor_faturado), 0) AS faturado,
      COALESCE(SUM(
        CASE
          WHEN data_pagamento IS NOT NULL THEN valor_liquidado
          ELSE 0
        END
      ), 0) AS recebido_atual,
      COALESCE(SUM(
        CASE
          WHEN data_definicao IS NULL THEN 0
          WHEN tipo_grupo = 'CONDOMINIO'
            AND data_definicao >= TO_DATE(competencia, 'MM/YYYY') + INTERVAL '1 month'
            AND data_definicao < TO_DATE(competencia, 'MM/YYYY') + INTERVAL '2 month'
            THEN valor_liquidado
          WHEN tipo_grupo <> 'CONDOMINIO'
            AND data_definicao >= TO_DATE(competencia, 'MM/YYYY')
            AND data_definicao < TO_DATE(competencia, 'MM/YYYY') + INTERVAL '1 month'
            THEN valor_liquidado
          ELSE 0
        END
      ), 0) AS recebido_mes
    FROM base
    GROUP BY competencia, tipo_grupo
    `,
    [String(shoppingId), competencias]
  );

  return new Map(
    result.rows.map((row) => [
      `${row.tipo_grupo}|${row.competencia}`,
      {
        faturado: Number(row.faturado || 0),
        recebidoMes: Number(row.recebido_mes || 0),
        recebidoAtual: Number(row.recebido_atual || 0),
      },
    ])
  );
}

function valoresMensais(mapaValores, tipo, competencia) {
  return mapaValores.get(`${tipo}|${competencia}`) || {
    faturado: 0,
    recebidoMes: 0,
    recebidoAtual: 0,
  };
}

function mesReferenciaPainel(ano) {
  const hoje = new Date();
  const anoNumero = Number(ano);
  const anoAtual = hoje.getFullYear();

  if (anoNumero < anoAtual) {
    return dataMes(anoNumero, 11);
  }

  if (anoNumero === anoAtual) {
    return dataMes(anoNumero, hoje.getMonth());
  }

  return null;
}

function montarRecebimentoMesAtual(ano, mapaValores) {
  const mesReferencia = mesReferenciaPainel(ano);

  if (!mesReferencia) {
    return {
      mesReferencia: null,
      aluguel: { faturado: 0, recebido: 0 },
      condominio: { faturado: 0, recebido: 0 },
      cdu: { faturado: 0, recebido: 0 },
    };
  }

  const mesReferenciaIndex = mesReferencia.getMonth();
  const competenciaReferencia = competenciaMes(mesReferencia.getFullYear(), mesReferenciaIndex);
  const competenciaCondominio = competenciaMes(mesReferencia.getFullYear(), mesReferenciaIndex - 1);
  const aluguel = valoresMensais(mapaValores, "ALUGUEL", competenciaReferencia);
  const condominio = valoresMensais(mapaValores, "CONDOMINIO", competenciaCondominio);
  const cdu = valoresMensais(mapaValores, "CDU", competenciaReferencia);

  return {
    mesReferencia,
    aluguel: { faturado: aluguel.faturado, recebido: aluguel.recebidoAtual },
    condominio: { faturado: condominio.faturado, recebido: condominio.recebidoAtual },
    cdu: { faturado: cdu.faturado, recebido: cdu.recebidoAtual },
  };
}

async function buscarDadosFaturadoRecebidoExcel(ano, query, shopping) {
  const competencias = Array.from(
    new Set([
      ...Array.from({ length: 12 }, (_, index) => competenciaMes(ano, index)),
      ...Array.from({ length: 12 }, (_, index) => competenciaMes(ano, index - 1)),
    ])
  );
  const valoresAgregados = await buscarValoresMensaisAgregados({
    shoppingId: shopping.id,
    competencias,
  });
  const recebimentoMesAtual = montarRecebimentoMesAtual(ano, valoresAgregados);

  return {
    ano,
 shopping: shopping.nome,
shoppingId: shopping.id,
    atualizadoAte: obterUltimoDiaUtil(),
    mesAtual: recebimentoMesAtual.mesReferencia,
    recebimentoMesAtual,
mensal: {
aluguel: Array.from({ length: 12 }, (_, index) => {
    const competencia = competenciaMes(ano, index);
    return {
      mes: dataMes(ano, index),
      ...valoresMensais(valoresAgregados, "ALUGUEL", competencia),
    };
  }),
condominio: Array.from({ length: 12 }, (_, index) => {
    const mesMapa = new Date(Number(ano), index - 1, 1);
    const competencia = competenciaMes(ano, index - 1);

    return {
      mes: mesMapa,
      ...valoresMensais(valoresAgregados, "CONDOMINIO", competencia),
    };
  }),
cdu: Array.from({ length: 12 }, (_, index) => {
    const competencia = competenciaMes(ano, index);
    return {
      mes: dataMes(ano, index),
      ...valoresMensais(valoresAgregados, "CDU", competencia),
    };
  }),
},
  };
}

function aplicarEstiloBase(cell) {
  cell.font = { name: "Arial", size: 10 };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}

function moedaCell(cell, value, size = 18, bold = false) {
  cell.value = Number(value || 0);
  cell.numFmt = '#,##0.00';
  aplicarEstiloBase(cell);
  cell.font = { name: "Arial", size, bold };
}

function percentualFormula(cell, formula, size = 18, bold = false) {
  cell.value = { formula };
  cell.numFmt = '0.0%';
  aplicarEstiloBase(cell);
  cell.font = { name: "Arial", size, bold };
}

const FORMATO_CONTABIL = '_-* #,##0.00_-;\\-* #,##0.00_-;_-* "-"??_-;_-@_-';

function dataMes(ano, mesZeroBased) {
  return new Date(Number(ano), mesZeroBased, 1);
}

function aplicarFonte(cell, size = 10, bold = false) {
  cell.font = { name: "Arial", size, bold };
}

function aplicarPreenchimento(cell, argb) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb },
  };
}

function aplicarBorda(cell) {
  cell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}

function converterBorda(codigo) {
  if (codigo === "M") return { style: "medium" };
  if (codigo === "t") return { style: "thin" };
  return undefined;
}

function aplicarBordaPorMapa(cell, codigo) {
  const [top, right, bottom, left] = codigo.split("");

  cell.border = {
    top: converterBorda(top),
    right: converterBorda(right),
    bottom: converterBorda(bottom),
    left: converterBorda(left),
  };
}

function aplicarMapaBordasReferencia(sheet) {
  const mapa = `
B2=MMMM C2=M--- D2=M--- E2=M--- F2=M--- G2=M--- H2=M--- I2=M--- J2=M--- K2=M--- L2=M--- M2=M--- N2=M--- O2=M--- P2=MM--
B3=--MM C3=--M- D3=--M- E3=--M- F3=--M- G3=--M- H3=--M- I3=--M- J3=--M- K3=--M- L3=--M- M3=--M- N3=--M- O3=--M- P3=-MM-
N5=MMMM O5=M-M- P5=MMM-
C6=MtMM D6=M-M- E6=M-M- F6=M-M- G6=M-M- H6=MtM- I6=---M N6=---M P6=-M--
C7=-t-M H7=-t-- I7=---M M7=MMtM N7=tttM O7=tttt P7=tMtt
C8=MMMM D8=MMM- E8=MMMM F8=MMM- G8=MMMM H8=MMM- I8=---M M8=tMtM N8=tttM O8=tttt P8=tMtt
B9=M-tM C9=MttM D9=Mtt- E9=Mttt F9=Mtt- G9=Mttt H9=Mtt- I9=---M M9=tMMM N9=ttMM O9=ttMM P9=tMMt
B10=t-tM C10=tttM D10=ttt- E10=tttt F10=ttt- G10=-ttt H10=-tt- I10=---M
B11=t-MM C11=ttMM D11=ttM- E11=ttMt F11=ttM- G11=-tMt H11=-tM- I11=---M M11=tttt N11=tttt O11=tttt P11=tttt
M12=tttt N12=tttt O12=tttt P12=tttt
C14=MMMM D14=M--- E14=M--- F14=MM-- H14=MMMM I14=M--- J14=M--- K14=MM-- M14=MMMM N14=M--- O14=M--- P14=MM--
C15=--MM D15=--M- E15=--M- F15=-MM- H15=--MM I15=--M- J15=--M- K15=-MM- M15=--MM N15=--M- O15=--M- P15=-MM-
C16=MM-M D16=MM-- E16=MM-M F16=MM-- H16=MM-M I16=MM-- J16=MM-M K16=MM-- M16=MM-M N16=MM-- O16=MM-M P16=MM--
C17=---M D17=-M-- E17=---M F17=-M-- H17=---M I17=-M-- J17=---M K17=-M-- M17=---M N17=-M-- O17=---M P17=-M--
C18=---M D18=-M-- E18=---M F18=-M-- H18=---M I18=-M-- J18=---M K18=-M-- M18=---M N18=-M-- O18=---M P18=-M--
C19=--MM D19=-MM- E19=--MM F19=-MM- H19=--MM I19=-MM- J19=--MM K19=-MM- M19=--MM N19=-MM- O19=--MM P19=-MM-
C20=---M F20=-M-- H20=---M K20=-M-- M20=---M P20=-M--
C21=MM-M D21=MM-- E21=MM-M F21=MM-- H21=MM-M I21=MM-- J21=MM-M K21=MM-- M21=MM-M N21=MM-- O21=MM-M P21=MM--
C22=---M D22=-M-- E22=---M F22=-M-- H22=---M I22=-M-- J22=---M K22=-M-- M22=---M N22=-M-- O22=---M P22=-M--
C23=---M D23=-M-- E23=---M F23=-M-- H23=---M I23=-M-- J23=---M K23=-M-- M23=---M N23=-M-- O23=---M P23=-M--
C24=--MM D24=-MM- E24=--MM F24=-MM- H24=--MM I24=-MM- J24=--MM K24=-MM- M24=--MM N24=-MM- O24=--MM P24=-MM-
C25=---M F25=-M-- H25=---M K25=-M-- M25=---M P25=-M--
C26=MM-M D26=MM-- E26=MM-M F26=MM-- H26=MM-M I26=MM-- J26=MM-M K26=MM-- M26=MM-M N26=MM-- O26=MM-M P26=MM--
C27=---M D27=-M-- E27=---M F27=-M-- H27=---M I27=-M-- J27=---M K27=-M-- M27=---M O27=---M P27=-M--
C28=---M D28=-M-- E28=---M F28=-M-- H28=---M I28=-M-- J28=---M K28=-M-- M28=---M O28=---M P28=-M--
C29=--MM D29=-MM- E29=--MM F29=-MM- H29=--MM I29=-MM- J29=--MM K29=-MM- M29=--MM N29=--M- O29=--MM P29=-MM-
C30=---M F30=-M-- H30=---M K30=-M-- M30=---M P30=-M--
C31=MM-M D31=MM-- E31=MM-M F31=MM-- H31=MM-M I31=MM-- J31=MM-M K31=MM-- M31=MM-M N31=MM-- O31=MM-M P31=MM--
C32=---M D32=-M-- E32=---M F32=-M-- H32=---M I32=-M-- J32=---M K32=-M-- M32=---M N32=-M-- O32=---M P32=-M--
C33=---M D33=-M-- E33=---M F33=-M-- H33=---M I33=-M-- J33=---M K33=-M-- M33=---M N33=-M-- O33=---M P33=-M--
C34=--MM D34=-MM- E34=--MM F34=-MM- H34=--MM I34=-MM- J34=--MM K34=-MM- M34=--MM N34=-MM- O34=--MM P34=-MM-
C35=---M F35=-M-- H35=---M K35=-M-- M35=---M P35=-M--
C36=MM-M D36=MM-- E36=MM-M F36=MM-- H36=MM-M I36=MM-- J36=MM-M K36=MM-- M36=MM-M N36=MM-- O36=MM-M P36=MM--
C37=---M D37=-M-- E37=---M F37=-M-- H37=---M I37=-M-- J37=---M K37=-M-- M37=---M N37=-M-- O37=---M P37=-M--
C38=---M D38=-M-- E38=---M F38=-M-- H38=---M I38=-M-- J38=---M K38=-M-- M38=---M N38=-M-- O38=---M P38=-M--
C39=--MM D39=-MM- E39=--MM F39=-MM- H39=--MM I39=-MM- J39=--MM K39=-MM- M39=--MM N39=-MM- O39=--MM P39=-MM-
C40=---M F40=-M-- H40=---M K40=-M-- M40=---M P40=-M--
C41=MM-M D41=MM-- E41=MM-M F41=MM-- H41=MM-M I41=MM-- J41=MM-M K41=MM-- M41=MM-M N41=MM-- O41=MM-M P41=MM--
C42=---M D42=-M-- E42=---M F42=-M-- H42=---M I42=-M-- J42=---M K42=-M-- M42=---M N42=-M-- O42=---M P42=-M--
C43=---M D43=-M-- E43=---M F43=-M-- H43=---M I43=-M-- J43=---M K43=-M-- M43=---M N43=-M-- O43=---M P43=-M--
C44=--MM D44=-MM- E44=--MM F44=-MM- H44=--MM I44=-MM- J44=--MM K44=-MM- M44=--MM N44=-MM- O44=--MM P44=-MM-
  `;

  mapa
    .trim()
    .split(/\s+/)
    .forEach((item) => {
      const [addr, codigo] = item.split("=");
      if (addr && codigo) {
        aplicarBordaPorMapa(sheet.getCell(addr), codigo);
      }
    });
}

function ajustarBordaLado(cell, lado, style) {
  cell.border = {
    ...(cell.border || {}),
    [lado]: style ? { style } : undefined,
  };
}

function aplicarCorrecoesFinaisBordas(sheet) {
  const topoMedium = [
    "B2", "C2", "D2", "E2", "F2", "G2", "H2", "I2", "J2", "K2", "L2", "M2", "N2", "O2", "P2",
    "C14", "D14", "E14", "F14",
    "H14", "I14", "J14", "K14",
    "M14", "N14", "O14", "P14",
  ];

  const esquerdaMedium = [
    "B2", "B3", "N5",
    "C6", "C7", "C8", "E8", "G8",
    "C9", "C10", "C11",
    "C14", "H14", "M14",
    "C15", "H15", "M15",
    "C16", "E16", "H16", "J16", "M16", "O16",
    "C21", "E21", "H21", "J21", "M21", "O21",
    "C26", "E26", "H26", "J26", "M26", "O26",
    "C31", "E31", "H31", "J31", "M31", "O31",
    "C36", "E36", "H36", "J36", "M36", "O36",
    "C41", "E41", "H41", "J41", "M41", "O41",
  ];

  const esquerdaThin = [
    "E9", "G9",
    "E10", "G10",
    "E11", "G11",
  ];

  topoMedium.forEach((addr) => {
    ajustarBordaLado(sheet.getCell(addr), "top", "medium");
  });

  esquerdaMedium.forEach((addr) => {
    ajustarBordaLado(sheet.getCell(addr), "left", "medium");
  });

  esquerdaThin.forEach((addr) => {
    ajustarBordaLado(sheet.getCell(addr), "left", "thin");
  });

  sheet.getCell("O6").border = {};
}

function valorContabil(cell, value, size = 18, bold = false) {
  cell.value = Number(value || 0);
  cell.numFmt = FORMATO_CONTABIL;
  aplicarFonte(cell, size, bold);
  cell.alignment = { horizontal: "right", vertical: "middle" };
}

function formulaPercentual(cell, formula, size = 18, bold = false) {
  cell.value = { formula };
  cell.numFmt = "0.0%";
  aplicarFonte(cell, size, bold);
  cell.alignment = { horizontal: "right", vertical: "middle" };
}

function formulaContabil(cell, formula, size = 15, bold = false) {
  cell.value = { formula };
  cell.numFmt = FORMATO_CONTABIL;
  aplicarFonte(cell, size, bold);
  cell.alignment = { horizontal: "right", vertical: "middle" };
}

function montarBlocoMensal(sheet, config) {
  const {
    titulo,
    tituloRange,
    dados,
    colLabel,
    colMesEsq,
    colPercEsq,
    colMesDir,
    colPercDir,
    mostrarRotulos = false,
  } = config;

  sheet.mergeCells(tituloRange);
  const tituloCell = sheet.getCell(tituloRange.split(":")[0]);
  tituloCell.value = titulo;
  aplicarFonte(tituloCell, 26, true);
  tituloCell.alignment = { horizontal: "center", vertical: "middle" };
  aplicarPreenchimento(tituloCell, "808080");
  aplicarBorda(tituloCell);

  const linhasBase = [16, 21, 26, 31, 36, 41];

  linhasBase.forEach((linha, index) => {
    const mesEsq = dados[index];
    const mesDir = dados[index + 6];

    sheet.mergeCells(`${colMesEsq}${linha}:${colPercEsq}${linha}`);
    sheet.getCell(`${colMesEsq}${linha}`).value = mesEsq?.mes || null;
    sheet.getCell(`${colMesEsq}${linha}`).numFmt = "mmm-yy";

    sheet.mergeCells(`${colMesDir}${linha}:${colPercDir}${linha}`);
    sheet.getCell(`${colMesDir}${linha}`).value = mesDir?.mes || null;
    sheet.getCell(`${colMesDir}${linha}`).numFmt = "mmm-yy";

    [sheet.getCell(`${colMesEsq}${linha}`), sheet.getCell(`${colMesDir}${linha}`)].forEach((cell) => {
      aplicarFonte(cell, 18, true);
      cell.alignment = { horizontal: "center", vertical: "middle" };
      aplicarPreenchimento(cell, "BFBFBF");
      aplicarBorda(cell);
    });

    if (mostrarRotulos) {
      sheet.getCell(`${colLabel}${linha + 1}`).value = "FATURADO";
      sheet.getCell(`${colLabel}${linha + 2}`).value = "RECEBIDO MÊS";
      sheet.getCell(`${colLabel}${linha + 3}`).value = "RECEBIDO ATUAL";

      [`${colLabel}${linha + 1}`, `${colLabel}${linha + 2}`, `${colLabel}${linha + 3}`].forEach((addr) => {
        aplicarFonte(sheet.getCell(addr), 15, false);
        aplicarPreenchimento(sheet.getCell(addr), "BFBFBF");
      });
    }

   valorContabil(sheet.getCell(`${colMesEsq}${linha + 1}`), mesEsq?.faturado, 18, true);
    valorContabil(sheet.getCell(`${colMesEsq}${linha + 2}`), mesEsq?.recebidoMes);
    formulaPercentual(sheet.getCell(`${colPercEsq}${linha + 2}`), `${colMesEsq}${linha + 2}/${colMesEsq}${linha + 1}`);
    valorContabil(sheet.getCell(`${colMesEsq}${linha + 3}`), mesEsq?.recebidoAtual);
    formulaPercentual(sheet.getCell(`${colPercEsq}${linha + 3}`), `${colMesEsq}${linha + 3}/${colMesEsq}${linha + 1}`);

  valorContabil(sheet.getCell(`${colMesDir}${linha + 1}`), mesDir?.faturado, 18, true);
    valorContabil(sheet.getCell(`${colMesDir}${linha + 2}`), mesDir?.recebidoMes);
    formulaPercentual(sheet.getCell(`${colPercDir}${linha + 2}`), `${colMesDir}${linha + 2}/${colMesDir}${linha + 1}`);
    valorContabil(sheet.getCell(`${colMesDir}${linha + 3}`), mesDir?.recebidoAtual);
    formulaPercentual(sheet.getCell(`${colPercDir}${linha + 3}`), `${colMesDir}${linha + 3}/${colMesDir}${linha + 1}`);
  });
}


function montarAbaFaturadoRecebido(workbook, dados) {
  const anoCurto = String(dados.ano).slice(-2);
  const sheet = workbook.addWorksheet(nomeAbaExcel(`${dados.shopping} ${dados.ano}`));

sheet.views = [
  {
    showGridLines: false,
    zoomScale: 55,
    zoomScaleNormal: 55,
  },
];

  sheet.columns = [
    { width: 20.4 }, // A
    { width: 27 },   // B
    { width: 21.7 }, // C
    { width: 21.7 }, // D
    { width: 21.7 }, // E
    { width: 21.7 }, // F
    { width: 2.7 },  // G separadora
    { width: 21.7 }, // H
    { width: 21.7 }, // I
    { width: 21.7 }, // J
    { width: 21.7 }, // K
    { width: 2.7 },  // L separadora
    { width: 21.7 }, // M
    { width: 21.7 }, // N
    { width: 21.7 }, // O
    { width: 21.7 }, // P
    { width: 12.4 }, // Q
  ];


  sheet.mergeCells("B2:P3");
  sheet.getCell("B2").value = `${dados.shopping} - ${dados.ano}`;
  sheet.getCell("B2").font = { name: "Arial", bold: true, size: 28 };
  sheet.getCell("B2").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getCell("B2").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "B4C7E7" },
  };

  sheet.mergeCells("C6:H6");
  sheet.getCell("C6").value = "RECEBIMENTO - MÊS ATUAL";

  sheet.mergeCells("C7:H7");
  sheet.getCell("C7").value = dados.mesAtual || "";
  sheet.getCell("C7").numFmt = "mmm-yy";

  sheet.mergeCells("C8:D8");
  sheet.mergeCells("E8:F8");
  sheet.mergeCells("G8:H8");

  sheet.mergeCells("C9:D9");
sheet.mergeCells("E9:F9");
sheet.mergeCells("G9:H9");

sheet.mergeCells("C10:D10");
sheet.mergeCells("E10:F10");
sheet.mergeCells("G10:H10");

sheet.mergeCells("C11:D11");
sheet.mergeCells("E11:F11");
sheet.mergeCells("G11:H11");

  sheet.getCell("C8").value = "FATURADO EM R$";
  sheet.getCell("E8").value = "RECEBIDO EM R$";
  sheet.getCell("G8").value = "% RECEBIDO";

  sheet.getCell("B9").value = "ALUGUEL";
  sheet.getCell("B10").value = "CONDOMINIO";
  sheet.getCell("B11").value = "CDU";

  moedaCell(sheet.getCell("C9"), dados.recebimentoMesAtual.aluguel.faturado);
  moedaCell(sheet.getCell("E9"), dados.recebimentoMesAtual.aluguel.recebido);
  percentualFormula(sheet.getCell("G9"), "E9/C9");

  moedaCell(sheet.getCell("C10"), dados.recebimentoMesAtual.condominio.faturado);
  moedaCell(sheet.getCell("E10"), dados.recebimentoMesAtual.condominio.recebido);
  percentualFormula(sheet.getCell("G10"), "E10/C10");

  moedaCell(sheet.getCell("C11"), dados.recebimentoMesAtual.cdu.faturado);
  moedaCell(sheet.getCell("E11"), dados.recebimentoMesAtual.cdu.recebido);
  percentualFormula(sheet.getCell("G11"), "E11/C11");

  sheet.mergeCells("I6:K11");
  sheet.getCell("I6").value = `ATUALIZADO ATE\n${dados.atualizadoAte.toLocaleDateString("pt-BR")}`;
  sheet.getCell("I6").font = { name: "Arial", size: 30 };
  sheet.getCell("I6").alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };

  sheet.mergeCells("N5:P5");
  sheet.getCell("N5").value = `JANEIRO/${anoCurto} a DEZEMBRO/${anoCurto}`;

  sheet.getCell("N6").value = "FATURADO";
  sheet.getCell("O6").value = "RECEBIDO";
  sheet.getCell("P6").value = "%";

  sheet.getCell("M7").value = "ALUGUEL";
  sheet.getCell("M8").value = "CONDOMÍNIO";
  sheet.getCell("M9").value = "TOTAL A-C";
  sheet.getCell("M11").value = "CDU";
  sheet.getCell("M12").value = "TOTAL - GERAL";

formulaContabil(sheet.getCell("N7"), "IF(C22>0,C17,0)+IF(C27>0,C22,0)+IF(C32>0,C27,0)+IF(C37>0,C32,0)+IF(C42>0,C37,0)+IF(E17>0,C42,0)+IF(E22>0,E17,0)+IF(E27>0,E22,0)+IF(E32>0,E27,0)+IF(E37>0,E32,0)+IF(E42>0,E37,0)+IF(E44>0,E42,0)", 15);
formulaContabil(sheet.getCell("O7"), "C19+C24+C29+C34+C39+C44+E19+E24+E29+E34+E39+E44", 15);
percentualFormula(sheet.getCell("P7"), "O7/N7", 18);

formulaContabil(sheet.getCell("N8"), "IF(M22>0,M17,0)+IF(M27>0,M22,0)+IF(M32>0,M27,0)+IF(M37>0,M32,0)+IF(M42>0,M37,0)+IF(O17>0,M42,0)+IF(O22>0,O17,0)+IF(O27>0,O22,0)+IF(O32>0,O27,0)+IF(O37>0,O32,0)+IF(O42>0,O37,0)+IF(O44>0,O42,0)", 15);
formulaContabil(sheet.getCell("O8"), "M19+M24+M29+M34+M39+M44+O19+O24+O29+O34+O39+O44", 15);
percentualFormula(sheet.getCell("P8"), "O8/N8", 18);

formulaContabil(sheet.getCell("N9"), "SUM(N7:N8)", 15);
formulaContabil(sheet.getCell("O9"), "SUM(O7:O8)", 15);
percentualFormula(sheet.getCell("P9"), "O9/N9", 18);

formulaContabil(sheet.getCell("N11"), "IF(H22>0,H17,0)+IF(H27>0,H22,0)+IF(H32>0,H27,0)+IF(H37>0,H32,0)+IF(H42>0,H37,0)+IF(J17>0,H42,0)+IF(J22>0,J17,0)+IF(J27>0,J22,0)+IF(J32>0,J27,0)+IF(J37>0,J32,0)+IF(J42>0,J37,0)+IF(J44>0,J42,0)", 15);
formulaContabil(sheet.getCell("O11"), "H19+H24+H29+H34+H39+H44+J19+J24+J29+J34+J39+J44", 15);
percentualFormula(sheet.getCell("P11"), "O11/N11", 18);

formulaContabil(sheet.getCell("N12"), "N7+N8+N11", 15);
formulaContabil(sheet.getCell("O12"), "O7+O8+O11", 15);
percentualFormula(sheet.getCell("P12"), "O12/N12", 18);

["C6", "C8", "E8", "G8", "N5", "N6", "O6", "P6"].forEach((addr) => {
  aplicarEstiloBase(sheet.getCell(addr));
  sheet.getCell(addr).font = { name: "Arial", bold: false, size: 18 };
  sheet.getCell(addr).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "A6A6A6" },
  };
});

aplicarEstiloBase(sheet.getCell("C7"));
sheet.getCell("C7").font = { name: "Arial", bold: false, size: 18 };

["B9", "B10", "B11"].forEach((addr) => {
  aplicarEstiloBase(sheet.getCell(addr));
  sheet.getCell(addr).font = { name: "Arial", bold: false, size: 18 };
  sheet.getCell(addr).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "D9D9D9" },
  };
});

["M7", "M8", "M9", "M11", "M12"].forEach((addr) => {
  aplicarEstiloBase(sheet.getCell(addr));
  sheet.getCell(addr).font = { name: "Arial", bold: true, size: 18 };
  sheet.getCell(addr).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "D9D9D9" },
  };
});

  montarBlocoMensal(sheet, {
    titulo: "ALUGUEL",
    tituloRange: "C14:F15",
    dados: dados.mensal.aluguel,
    colLabel: "B",
    colMesEsq: "C",
    colPercEsq: "D",
    colMesDir: "E",
    colPercDir: "F",
    mostrarRotulos: true,
  });

  montarBlocoMensal(sheet, {
    titulo: "CDU",
    tituloRange: "H14:K15",
    dados: dados.mensal.cdu,
    colLabel: "G",
    colMesEsq: "H",
    colPercEsq: "I",
    colMesDir: "J",
    colPercDir: "K",
  });

  montarBlocoMensal(sheet, {
    titulo: "CONDOMINIO",
    tituloRange: "M14:P15",
    dados: dados.mensal.condominio,
    colLabel: "L",
    colMesEsq: "M",
    colPercEsq: "N",
    colMesDir: "O",
    colPercDir: "P",
  });
  aplicarMapaBordasReferencia(sheet);
  aplicarCorrecoesFinaisBordas(sheet);
}

router.get("/gerar-tabelas/faturado-recebido", authMiddleware, async (req, res) => {
  try {
    const anos = String(req.query.anos || "")
      .split(",")
      .map((ano) => ano.trim())
      .filter(Boolean);

    if (!anos.length) {
      return res.status(400).json({ message: "Selecione pelo menos um ano." });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Portal GMV";
    workbook.created = new Date();

const shoppings = await obterShoppingsSelecionadosExcel(
  req.query,
  req.shoppingScope.shoppingIds
);

for (const ano of anos) {
  for (const shopping of shoppings) {
    const dados = await buscarDadosFaturadoRecebidoExcel(ano, req.query, shopping);
    montarAbaFaturadoRecebido(workbook, dados);
  }
}

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="faturado-x-recebido.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Erro ao gerar Faturado x Recebido:", error);
   res.status(error.statusCode || 500).json({
      message: `Erro ao gerar Faturado x Recebido: ${error.message}`,
    });
  }
});

router.get(
  "/gerar-tabelas/faturado-recebido-detalhado",
  async (req, res) => {
    try {
      const workbook = await gerarWorkbookDetalhado(
        pool,
        req.query,
        req.shoppingScope.shoppingIds
      );

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="faturado-x-recebido-detalhado.xlsx"'
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error(
        "Erro ao gerar Faturado x Recebido - Detalhado:",
        error
      );
      res.status(error.statusCode || 500).json({
        message:
          error.message ||
          "Erro ao gerar Faturado x Recebido - Detalhado.",
      });
    }
  }
);

module.exports = router;
