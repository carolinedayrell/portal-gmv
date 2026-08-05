const ExcelJS = require("exceljs");
const pool = require("../db");
const {
  nomePadraoShopping,
} = require("../utils/vendas-shoppings");

const CANAIS = new Set([
  "LOJA_FISICA",
  "ONLINE",
  "CONSOLIDADO",
]);

const GRANULARIDADES = new Set([
  "MENSAL",
  "DIARIA",
]);

function erroHttp(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function listaParametro(valor) {
  const valores = Array.isArray(valor) ? valor : [valor];

  return [...new Set(
    valores
      .flatMap((item) => String(item || "").split(","))
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function lojaSistemaRelatorioSql() {
  return `
    CASE
      WHEN c.loja_sistema ~ '^\\s*[0-9]+\\s*$'
        THEN COALESCE(
          NULLIF(BTRIM(loja_fallback.nome_fantasia), ''),
          NULLIF(BTRIM(loja_fallback.razao_social), ''),
          c.loja_sistema
        )
      ELSE c.loja_sistema
    END
  `;
}

function dataValida(valor) {
  if (!valor) return null;
  const texto = String(valor);
  const partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!partes) return null;

  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  return data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
    ? texto
    : null;
}

function resolverShoppingsConsulta(
  shoppingSolicitado,
  shoppingScope
) {
  const solicitados = listaParametro(shoppingSolicitado);

  if (shoppingScope.acessoTotal) {
    return solicitados.length ? solicitados : null;
  }

  const permitidos = new Set(
    (shoppingScope.shoppingIds || []).map(String)
  );

  if (!solicitados.length) {
    return [...permitidos];
  }

  const naoAutorizados = solicitados.filter(
    (id) => !permitidos.has(id)
  );

  if (naoAutorizados.length) {
    throw erroHttp(
      403,
      "Um ou mais shoppings solicitados não estão autorizados.",
      "SHOPPING_NAO_AUTORIZADO"
    );
  }

  return solicitados;
}

function construirConsultaBase(query, shoppingScope) {
  const parametros = [];
  const where = ["c.ativa = TRUE"];
  const shoppings = resolverShoppingsConsulta(
    query.shopping,
    shoppingScope
  );

  if (Array.isArray(shoppings)) {
    parametros.push(shoppings);
    where.push(`c.shopping_id = ANY($${parametros.length}::text[])`);
  }

  const dataInicial = dataValida(query.dataInicial);
  const dataFinal = dataValida(query.dataFinal);

  if (query.dataInicial && !dataInicial) {
    throw erroHttp(400, "Data inicial inválida.", "DATA_INICIAL_INVALIDA");
  }

  if (query.dataFinal && !dataFinal) {
    throw erroHttp(400, "Data final inválida.", "DATA_FINAL_INVALIDA");
  }

  if (dataInicial && dataFinal && dataInicial > dataFinal) {
    throw erroHttp(
      400,
      "A data inicial não pode ser maior que a data final.",
      "INTERVALO_DATA_INVALIDO"
    );
  }

  if (dataInicial) {
    parametros.push(dataInicial);
    where.push(`COALESCE(v.data_venda, c.periodo) >= $${parametros.length}::date`);
  }

  if (dataFinal) {
    parametros.push(dataFinal);
    where.push(`COALESCE(v.data_venda, c.periodo) <= $${parametros.length}::date`);
  }

  const contratos = listaParametro(query.contrato);
  if (contratos.length) {
    parametros.push(contratos);
    where.push(`c.contrato = ANY($${parametros.length}::text[])`);
  }

  if (query.loja) {
    parametros.push(`%${String(query.loja).trim()}%`);
    where.push(`${lojaSistemaRelatorioSql()} ILIKE $${parametros.length}`);
  }

  if (query.luc) {
    parametros.push(`%${String(query.luc).trim()}%`);
    where.push(`
      EXISTS (
        SELECT 1
        FROM portal_vendas_cobertura_lucs filtro_luc
        WHERE filtro_luc.cobertura_id = c.id
          AND filtro_luc.luc ILIKE $${parametros.length}
      )
    `);
  }

  const canal = String(query.canal || "").trim().toUpperCase();
  if (canal) {
    if (!CANAIS.has(canal)) {
      throw erroHttp(400, "Canal inválido.", "CANAL_INVALIDO");
    }
    parametros.push(canal);
    where.push(`c.canal = $${parametros.length}`);
  }

  const granularidade = String(query.granularidade || "")
    .trim()
    .toUpperCase();
  if (granularidade) {
    if (!GRANULARIDADES.has(granularidade)) {
      throw erroHttp(400, "Granularidade inválida.", "GRANULARIDADE_INVALIDA");
    }
    parametros.push(granularidade);
    where.push(`c.granularidade = $${parametros.length}`);
  }

  const sql = `
    SELECT
      c.id AS cobertura_id,
      c.periodo,
      v.data_venda,
      c.shopping_id,
      c.shopping_nome,
      c.contrato,
      COALESCE(lucs.lucs, '') AS lucs,
      COALESCE(lucs.detalhes, '[]'::jsonb) AS lucs_detalhes,
      ${lojaSistemaRelatorioSql()} AS loja_sistema,
      c.abl_total_sistema,
      c.canal,
      c.granularidade,
      v.vendas,
      c.criada_por_nome,
      c.criada_em
    FROM portal_vendas_coberturas c
    JOIN portal_vendas v
      ON v.cobertura_id = c.id
    LEFT JOIN LATERAL (
      SELECT
        loc.nome_fantasia,
        loc.razao_social
      FROM gshop_locatarios loc
      WHERE c.loja_sistema ~ '^\\s*[0-9]+\\s*$'
        AND loc.num_locatario::text = BTRIM(c.loja_sistema)
      ORDER BY
        (loc.idfilial::text = c.shopping_id) DESC,
        loc._etl_data_carga DESC NULLS LAST
      LIMIT 1
    ) loja_fallback ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        STRING_AGG(luc.luc, ', ' ORDER BY luc.ordem, luc.luc) AS lucs,
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'luc', luc.luc,
            'abl', luc.abl,
            'tipoUnidade', luc.tipo_unidade
          )
          ORDER BY luc.ordem, luc.luc
        ) AS detalhes
      FROM portal_vendas_cobertura_lucs luc
      WHERE luc.cobertura_id = c.id
    ) lucs ON TRUE
    WHERE ${where.join(" AND ")}
  `;

  return { sql, parametros };
}

async function consultarRelatorioVendas(
  query,
  shoppingScope,
  { exportar = false } = {}
) {
  const { sql, parametros } = construirConsultaBase(
    query,
    shoppingScope
  );
  const pagina = Math.max(Number(query.pagina) || 1, 1);
  const limite = exportar
    ? 100000
    : Math.min(Math.max(Number(query.limite) || 50, 1), 200);
  const offset = exportar ? 0 : (pagina - 1) * limite;

  const parametrosDados = [...parametros, limite, offset];
  const limitePosicao = parametros.length + 1;
  const offsetPosicao = parametros.length + 2;

  const [dados, resumo] = await Promise.all([
    pool.query(
      `
      ${sql}
      ORDER BY
        c.periodo DESC,
        v.data_venda DESC NULLS LAST,
        c.shopping_nome,
        c.loja_sistema,
        c.contrato,
        c.canal
      LIMIT $${limitePosicao}
      OFFSET $${offsetPosicao}
      `,
      parametrosDados
    ),
    pool.query(
      `
      WITH base AS (${sql})
      SELECT
        COUNT(*)::bigint AS total_linhas,
        COUNT(DISTINCT contrato)::bigint AS total_contratos,
        COUNT(DISTINCT loja_sistema)::bigint AS total_lojas,
        COALESCE(SUM(vendas), 0)::numeric AS vendas_total,
        COALESCE(SUM(vendas) FILTER (WHERE canal = 'LOJA_FISICA'), 0)::numeric AS vendas_fisicas,
        COALESCE(SUM(vendas) FILTER (WHERE canal = 'ONLINE'), 0)::numeric AS vendas_online,
        COALESCE(SUM(vendas) FILTER (WHERE canal = 'CONSOLIDADO'), 0)::numeric AS vendas_consolidadas
      FROM base
      `,
      parametros
    ),
  ]);

  const totais = resumo.rows[0];
  const linhasPadronizadas = dados.rows.map((row) => ({
    ...row,
    shopping_nome: nomePadraoShopping(
      row.shopping_id,
      row.shopping_nome
    ),
  }));

  return {
    dados: linhasPadronizadas,
    resumo: {
      totalLinhas: Number(totais.total_linhas || 0),
      totalContratos: Number(totais.total_contratos || 0),
      totalLojas: Number(totais.total_lojas || 0),
      vendasTotal: Number(totais.vendas_total || 0),
      vendasFisicas: Number(totais.vendas_fisicas || 0),
      vendasOnline: Number(totais.vendas_online || 0),
      vendasConsolidadas: Number(totais.vendas_consolidadas || 0),
    },
    paginacao: {
      pagina,
      limite,
      total: Number(totais.total_linhas || 0),
      totalPaginas: Math.max(
        Math.ceil(Number(totais.total_linhas || 0) / limite),
        1
      ),
    },
  };
}

function dataBrasileira(valor) {
  if (!valor) return "";

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const ano = valor.getUTCFullYear();
    const mes = String(valor.getUTCMonth() + 1).padStart(2, "0");
    const dia = String(valor.getUTCDate()).padStart(2, "0");
    return `${dia}/${mes}/${ano}`;
  }

  const texto = String(valor).trim();
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) return "";

  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  return `${dia}/${mes}/${ano}`;
}

async function gerarExcelRelatorioVendas(query, shoppingScope) {
  const resultado = await consultarRelatorioVendas(
    query,
    shoppingScope,
    { exportar: true }
  );

  if (resultado.resumo.totalLinhas > 100000) {
    throw erroHttp(
      413,
      "A exportação ultrapassa 100.000 linhas. Reduza o período ou aplique mais filtros.",
      "EXPORTACAO_MUITO_GRANDE"
    );
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Portal GMV";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Vendas", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "PERIODO", key: "periodo", width: 14 },
    { header: "DATA", key: "data", width: 14 },
    { header: "SHOPPING", key: "shopping", width: 34 },
    { header: "CONTRATO", key: "contrato", width: 16 },
    { header: "LUC", key: "luc", width: 24 },
    { header: "LOJA", key: "loja", width: 34 },
    { header: "ABL", key: "abl", width: 14 },
    { header: "CANAL", key: "canal", width: 18 },
    { header: "GRANULARIDADE", key: "granularidade", width: 18 },
    { header: "VENDAS", key: "vendas", width: 18 },
  ];

  for (const row of resultado.dados) {
    sheet.addRow({
      periodo: dataBrasileira(row.periodo),
      data: dataBrasileira(row.data_venda),
      shopping: row.shopping_nome,
      contrato: row.contrato,
      luc: row.lucs,
      loja: row.loja_sistema || "",
      abl: Number(row.abl_total_sistema || 0),
      canal: row.canal,
      granularidade: row.granularidade,
      vendas: Number(row.vendas || 0),
    });
  }

  const cabecalho = sheet.getRow(1);
  cabecalho.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cabecalho.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F6696" },
  };
  cabecalho.alignment = { vertical: "middle" };
  sheet.getColumn("abl").numFmt = "#,##0.00";
  sheet.getColumn("vendas").numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00';
  sheet.autoFilter = {
    from: "A1",
    to: "J1",
  };

  return workbook.xlsx.writeBuffer();
}

async function gerarExcelOcorrencias(
  importacaoId,
  usuario,
  shoppingScope = null
) {
  const importacao = await pool.query(
    `
    SELECT id, usuario_id, status
    FROM portal_vendas_importacoes
    WHERE id = $1
    `,
    [importacaoId]
  );

  const registro = importacao.rows[0];
  if (!registro) {
    throw erroHttp(404, "Importação não encontrada.", "IMPORTACAO_NAO_ENCONTRADA");
  }

  if (
    !["MESTRE", "GERENTE_CSC"].includes(usuario.perfil) &&
    Number(registro.usuario_id) !== Number(usuario.id)
  ) {
    throw erroHttp(403, "Você não pode consultar esta importação.", "IMPORTACAO_NAO_AUTORIZADA");
  }

  if (shoppingScope && !shoppingScope.acessoTotal) {
    const ids = await pool.query(
      `
      SELECT DISTINCT shopping_sistema_id
      FROM portal_vendas_importacao_linhas
      WHERE importacao_id = $1
        AND shopping_sistema_id IS NOT NULL
      `,
      [importacaoId]
    );
    const permitidos = new Set(
      (shoppingScope.shoppingIds || []).map(String)
    );

    if (
      ids.rows.some(
        (row) => !permitidos.has(String(row.shopping_sistema_id))
      )
    ) {
      throw erroHttp(
        403,
        "A importação contém dados fora do acesso atual do usuário.",
        "IMPORTACAO_FORA_DO_ESCOPO"
      );
    }
  }

  if (
    registro.status === "REJEITADA" &&
    !["MESTRE", "GERENTE_CSC"].includes(usuario.perfil)
  ) {
    throw erroHttp(
      403,
      "As ocorrências detalhadas desta carga não estão disponíveis porque ela contém shopping não autorizado.",
      "OCORRENCIAS_RESTRITAS"
    );
  }

  const ocorrencias = await pool.query(
    `
    SELECT
      numero_linha,
      contrato,
      periodo,
      severidade,
      codigo,
      campo,
      mensagem,
      valor_informado,
      valor_esperado,
      orientacao
    FROM portal_vendas_importacao_ocorrencias
    WHERE importacao_id = $1
    ORDER BY numero_linha NULLS FIRST, id
    `,
    [importacaoId]
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Ocorrências", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "LINHA", key: "linha", width: 12 },
    { header: "CONTRATO", key: "contrato", width: 16 },
    { header: "PERIODO", key: "periodo", width: 14 },
    { header: "SEVERIDADE", key: "severidade", width: 16 },
    { header: "CAMPO", key: "campo", width: 16 },
    { header: "CODIGO", key: "codigo", width: 32 },
    { header: "MOTIVO", key: "mensagem", width: 52 },
    { header: "INFORMADO", key: "informado", width: 28 },
    { header: "ESPERADO", key: "esperado", width: 32 },
    { header: "ORIENTACAO", key: "orientacao", width: 52 },
  ];

  ocorrencias.rows.forEach((row) => {
    sheet.addRow({
      linha: row.numero_linha,
      contrato: row.contrato,
      periodo: dataBrasileira(row.periodo),
      severidade: row.severidade,
      campo: row.campo,
      codigo: row.codigo,
      mensagem: row.mensagem,
      informado: row.valor_informado,
      esperado: row.valor_esperado,
      orientacao: row.orientacao,
    });
  });

  const cabecalho = sheet.getRow(1);
  cabecalho.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cabecalho.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F6696" },
  };
  sheet.autoFilter = { from: "A1", to: "J1" };

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  construirConsultaBase,
  consultarRelatorioVendas,
  dataBrasileira,
  gerarExcelOcorrencias,
  gerarExcelRelatorioVendas,
  resolverShoppingsConsulta,
};
