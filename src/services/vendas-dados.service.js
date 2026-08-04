const pool = require("../db");
const {
  nomePadraoShopping,
} = require("../utils/vendas-shoppings");
const {
  normalizarShoppingInformado,
} = require("./vendas-importacao.service");

const PERFIS_ACESSO_TOTAL = new Set([
  "MESTRE",
  "GERENTE_CSC",
]);

function erroHttp(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function dividirEmBlocos(itens, tamanho = 500) {
  const blocos = [];
  for (let indice = 0; indice < itens.length; indice += tamanho) {
    blocos.push(itens.slice(indice, indice + tamanho));
  }
  return blocos;
}

async function obterContratosOficiais(
  contratos,
  executor = pool
) {
  const unicos = [...new Set(
    contratos.map(String).map((item) => item.trim()).filter(Boolean)
  )];

  if (!unicos.length) return new Map();

  const resultado = await executor.query(
    `
    WITH lucs AS (
      SELECT
        id_filial::text AS shopping_id,
        num_locacao::text AS contrato,
        num_loja::text AS luc,
        MAX(area_total)::numeric AS abl,
        MAX(loja_ou_quiosque)::text AS tipo_unidade
      FROM gshop_lojas_contratadas
      WHERE num_locacao IS NOT NULL
        AND num_locacao::text = ANY($1::text[])
        AND num_loja IS NOT NULL
        AND BTRIM(num_loja::text) <> ''
      GROUP BY
        id_filial::text,
        num_locacao::text,
        num_loja::text
    ),
    loja_recente AS (
      SELECT DISTINCT ON (
        c.idfilial::text,
        c.num_locacao::text
      )
        c.idfilial::text AS shopping_id,
        c.num_locacao::text AS contrato,
        COALESCE(
          NULLIF(BTRIM(l.nome_fantasia), ''),
          NULLIF(BTRIM(l.razao_social), ''),
          c.num_locatario::text
        ) AS loja_sistema
      FROM gshop_contas c
      LEFT JOIN LATERAL (
        SELECT
          loc.nome_fantasia,
          loc.razao_social
        FROM gshop_locatarios loc
        WHERE loc.num_locatario::text = c.num_locatario::text
        ORDER BY
          (loc.idfilial::text = c.idfilial::text) DESC,
          loc._etl_data_carga DESC NULLS LAST
        LIMIT 1
      ) l ON TRUE
      WHERE c.num_locacao IS NOT NULL
        AND c.num_locacao::text = ANY($1::text[])
      ORDER BY
        c.idfilial::text,
        c.num_locacao::text,
        c.data_ultima_alteracao DESC NULLS LAST,
        c._etl_data_carga DESC NULLS LAST,
        c.idlancamento DESC NULLS LAST
    )
    SELECT
      lucs.contrato,
      lucs.shopping_id,
      COALESCE(
        NULLIF(BTRIM(s.nome_reduzido_coligada), ''),
        NULLIF(BTRIM(s.nome_shopping), ''),
        lucs.shopping_id
      ) AS shopping_nome,
      lr.loja_sistema,
      lucs.luc,
      lucs.abl,
      lucs.tipo_unidade
    FROM lucs
    LEFT JOIN gbi_shopping s
      ON s.num_shopping::text = lucs.shopping_id
    LEFT JOIN loja_recente lr
      ON lr.shopping_id = lucs.shopping_id
     AND lr.contrato = lucs.contrato
    ORDER BY
      lucs.contrato,
      lucs.shopping_id,
      lucs.luc
    `,
    [unicos]
  );

  const agrupados = new Map();

  for (const row of resultado.rows) {
    if (!agrupados.has(row.contrato)) {
      agrupados.set(row.contrato, {
        contrato: row.contrato,
        shoppings: new Map(),
      });
    }

    const contrato = agrupados.get(row.contrato);

    if (!contrato.shoppings.has(row.shopping_id)) {
      contrato.shoppings.set(row.shopping_id, {
        shoppingId: row.shopping_id,
        shoppingNome: nomePadraoShopping(
          row.shopping_id,
          row.shopping_nome
        ),
        lojaSistema: row.loja_sistema || null,
        lucs: [],
      });
    }

    contrato.shoppings.get(row.shopping_id).lucs.push({
      luc: row.luc,
      abl: row.abl === null ? null : Number(row.abl),
      tipoUnidade: row.tipo_unidade || null,
    });
  }

  const mapa = new Map();

  for (const [contratoId, agrupado] of agrupados) {
    const shoppings = [...agrupado.shoppings.values()];

    if (shoppings.length !== 1) {
      mapa.set(contratoId, {
        contrato: contratoId,
        multiplosShoppings: shoppings.length > 1,
        shoppingId: null,
        shoppingNome: null,
        lojaSistema: null,
        lucs: [],
        ablTotal: null,
      });
      continue;
    }

    const oficial = shoppings[0];
    oficial.multiplosShoppings = false;
    oficial.contrato = contratoId;
    oficial.ablTotal = oficial.lucs.reduce(
      (total, item) => total + (item.abl ?? 0),
      0
    );

    mapa.set(contratoId, oficial);
  }

  return mapa;
}

async function criarImportacao({
  usuario,
  arquivoNome,
  arquivoHash,
  arquivoTamanho,
}, executor = pool) {
  const resultado = await executor.query(
    `
    INSERT INTO portal_vendas_importacoes (
      usuario_id,
      usuario_nome,
      usuario_perfil,
      arquivo_nome,
      arquivo_hash_sha256,
      arquivo_tamanho_bytes,
      regras_aceitas_em,
      status
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'VALIDANDO')
    RETURNING id
    `,
    [
      usuario.id,
      usuario.nome,
      usuario.perfil,
      arquivoNome,
      arquivoHash,
      arquivoTamanho,
    ]
  );

  return Number(resultado.rows[0].id);
}

async function marcarImportacaoComErro(
  importacaoId,
  { codigo, mensagem }
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO portal_vendas_importacao_ocorrencias (
        importacao_id,
        severidade,
        codigo,
        mensagem,
        orientacao
      )
      VALUES ($1, 'ERRO', $2, $3, 'Corrija o arquivo e envie uma nova importação.')
      `,
      [importacaoId, codigo, mensagem]
    );

    await client.query(
      `
      UPDATE portal_vendas_importacoes
      SET status = 'COM_ERROS',
          total_erros = 1,
          erro_geral = $2,
          validada_em = NOW()
      WHERE id = $1
      `,
      [importacaoId, mensagem]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function salvarResultadoValidacao(
  importacaoId,
  validacao,
  executorExterno = null
) {
  const client = executorExterno || await pool.connect();
  const gerenciarTransacao = !executorExterno;

  try {
    if (gerenciarTransacao) await client.query("BEGIN");
    const idsPorNumeroLinha = new Map();

    for (const bloco of dividirEmBlocos(validacao.linhas)) {
      const dados = bloco.map((linha) => ({
        numero_linha: linha.numeroLinha,
        periodo_informado: linha.periodoInformado || null,
        data_informada: linha.dataInformada || null,
        shopping_informado: linha.shoppingInformado || null,
        contrato_informado: linha.contratoInformado || null,
        luc_informada: linha.lucInformada || null,
        loja_informada: linha.lojaInformada || null,
        abl_informada_texto: linha.ablInformadaTexto || null,
        canal_informado: linha.canalInformado || null,
        vendas_informadas_texto: linha.vendasInformadasTexto || null,
        periodo: linha.periodo,
        data_venda: linha.dataVenda,
        granularidade: linha.granularidade,
        contrato: linha.contrato || null,
        canal: linha.canal,
        vendas: linha.vendas,
        abl_informada: linha.ablInformada,
        shopping_sistema_id: linha.shoppingSistemaId,
        shopping_sistema_nome: linha.shoppingSistemaNome,
        loja_sistema: linha.lojaSistema,
        lucs_sistema: linha.lucsSistema,
        abl_total_sistema: linha.ablTotalSistema,
        autorizada: linha.autorizada,
        resultado: linha.resultado,
      }));

      const inseridas = await client.query(
        `
        INSERT INTO portal_vendas_importacao_linhas (
          importacao_id,
          numero_linha,
          periodo_informado,
          data_informada,
          shopping_informado,
          contrato_informado,
          luc_informada,
          loja_informada,
          abl_informada_texto,
          canal_informado,
          vendas_informadas_texto,
          periodo,
          data_venda,
          granularidade,
          contrato,
          canal,
          vendas,
          abl_informada,
          shopping_sistema_id,
          shopping_sistema_nome,
          loja_sistema,
          lucs_sistema,
          abl_total_sistema,
          autorizada,
          resultado
        )
        SELECT
          $1,
          x.numero_linha,
          x.periodo_informado,
          x.data_informada,
          x.shopping_informado,
          x.contrato_informado,
          x.luc_informada,
          x.loja_informada,
          x.abl_informada_texto,
          x.canal_informado,
          x.vendas_informadas_texto,
          x.periodo,
          x.data_venda,
          x.granularidade,
          x.contrato,
          x.canal,
          x.vendas,
          x.abl_informada,
          x.shopping_sistema_id,
          x.shopping_sistema_nome,
          x.loja_sistema,
          x.lucs_sistema,
          x.abl_total_sistema,
          x.autorizada,
          x.resultado
        FROM jsonb_to_recordset($2::jsonb) AS x(
          numero_linha integer,
          periodo_informado text,
          data_informada text,
          shopping_informado text,
          contrato_informado text,
          luc_informada text,
          loja_informada text,
          abl_informada_texto text,
          canal_informado text,
          vendas_informadas_texto text,
          periodo date,
          data_venda date,
          granularidade varchar(10),
          contrato text,
          canal varchar(20),
          vendas numeric,
          abl_informada numeric,
          shopping_sistema_id text,
          shopping_sistema_nome text,
          loja_sistema text,
          lucs_sistema jsonb,
          abl_total_sistema numeric,
          autorizada boolean,
          resultado varchar(20)
        )
        RETURNING id, numero_linha
        `,
        [importacaoId, JSON.stringify(dados)]
      );

      for (const row of inseridas.rows) {
        idsPorNumeroLinha.set(
          Number(row.numero_linha),
          Number(row.id)
        );
      }
    }

    for (const bloco of dividirEmBlocos(validacao.ocorrencias)) {
      const dados = bloco.map((ocorrencia) => ({
        linha_id: ocorrencia.numeroLinha
          ? idsPorNumeroLinha.get(ocorrencia.numeroLinha) || null
          : null,
        numero_linha: ocorrencia.numeroLinha,
        contrato: ocorrencia.contrato,
        periodo: ocorrencia.periodo,
        severidade: ocorrencia.severidade,
        codigo: ocorrencia.codigo,
        campo: ocorrencia.campo,
        mensagem: ocorrencia.mensagem,
        valor_informado: ocorrencia.valorInformado,
        valor_esperado: ocorrencia.valorEsperado,
        orientacao: ocorrencia.orientacao,
      }));

      await client.query(
        `
        INSERT INTO portal_vendas_importacao_ocorrencias (
          importacao_id,
          linha_id,
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
        )
        SELECT
          $1,
          x.linha_id,
          x.numero_linha,
          x.contrato,
          x.periodo,
          x.severidade,
          x.codigo,
          x.campo,
          x.mensagem,
          x.valor_informado,
          x.valor_esperado,
          x.orientacao
        FROM jsonb_to_recordset($2::jsonb) AS x(
          linha_id bigint,
          numero_linha integer,
          contrato text,
          periodo date,
          severidade varchar(20),
          codigo varchar(80),
          campo varchar(80),
          mensagem text,
          valor_informado text,
          valor_esperado text,
          orientacao text
        )
        `,
        [importacaoId, JSON.stringify(dados)]
      );
    }

    await client.query(
      `
      UPDATE portal_vendas_importacoes
      SET status = $2,
          total_linhas = $3,
          total_vendas = $4,
          total_erros = $5,
          total_divergencias = $6,
          total_avisos = $7,
          erro_geral = NULL,
          validada_em = NOW()
      WHERE id = $1
      `,
      [
        importacaoId,
        validacao.status,
        validacao.totalLinhas,
        validacao.totalVendas,
        validacao.totalErros,
        validacao.totalDivergencias,
        validacao.totalAvisos,
      ]
    );

    if (gerenciarTransacao) await client.query("COMMIT");
  } catch (error) {
    if (gerenciarTransacao) await client.query("ROLLBACK");
    throw error;
  } finally {
    if (gerenciarTransacao) client.release();
  }
}

function podeConsultarImportacao(usuario, importacao) {
  return (
    PERFIS_ACESSO_TOTAL.has(usuario.perfil) ||
    Number(importacao.usuario_id) === Number(usuario.id)
  );
}

async function obterImportacaoDetalhada(
  importacaoId,
  usuario,
  { pagina = 1, limite = 200 } = {},
  shoppingScope = null
) {
  const importacaoResult = await pool.query(
    `
    SELECT *
    FROM portal_vendas_importacoes
    WHERE id = $1
    LIMIT 1
    `,
    [importacaoId]
  );

  const importacao = importacaoResult.rows[0];

  if (!importacao) {
    throw erroHttp(404, "Importação não encontrada.", "IMPORTACAO_NAO_ENCONTRADA");
  }

  if (!podeConsultarImportacao(usuario, importacao)) {
    throw erroHttp(403, "Você não pode consultar esta importação.", "IMPORTACAO_NAO_AUTORIZADA");
  }

  if (
    shoppingScope &&
    !shoppingScope.acessoTotal
  ) {
    const idsResult = await pool.query(
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
    const foraDoEscopo = idsResult.rows.some(
      (row) => !permitidos.has(String(row.shopping_sistema_id))
    );

    if (foraDoEscopo) {
      throw erroHttp(
        403,
        "A importação contém dados fora do acesso atual do usuário.",
        "IMPORTACAO_FORA_DO_ESCOPO"
      );
    }
  }

  if (
    importacao.status === "REJEITADA" &&
    !PERFIS_ACESSO_TOTAL.has(usuario.perfil)
  ) {
    return {
      importacao,
      linhas: [],
      ocorrencias: [
        {
          numero_linha: null,
          contrato: null,
          periodo: null,
          severidade: "ERRO",
          codigo: "CARGA_COM_SHOPPING_NAO_AUTORIZADO",
          campo: "SHOPPING",
          mensagem:
            "A carga inteira foi rejeitada porque contém shopping não autorizado.",
          valor_informado: null,
          valor_esperado: null,
          orientacao:
            "Remova os dados fora do seu acesso e envie uma nova carga.",
        },
      ],
      paginacao: {
        pagina: 1,
        limite: 0,
        total: 0,
      },
    };
  }

  const paginaSegura = Math.max(Number(pagina) || 1, 1);
  const limiteSeguro = Math.min(Math.max(Number(limite) || 200, 1), 500);
  const offset = (paginaSegura - 1) * limiteSeguro;

  const [linhasResult, ocorrenciasResult] = await Promise.all([
    pool.query(
      `
      SELECT
        id,
        numero_linha,
        periodo_informado,
        data_informada,
        shopping_informado,
        contrato_informado,
        luc_informada,
        loja_informada,
        abl_informada_texto,
        canal_informado,
        vendas_informadas_texto,
        periodo,
        data_venda,
        granularidade,
        contrato,
        canal,
        vendas,
        abl_informada,
        shopping_sistema_id,
        shopping_sistema_nome,
        loja_sistema,
        lucs_sistema,
        abl_total_sistema,
        autorizada,
        resultado
      FROM portal_vendas_importacao_linhas
      WHERE importacao_id = $1
      ORDER BY numero_linha
      LIMIT $2 OFFSET $3
      `,
      [importacaoId, limiteSeguro, offset]
    ),
    pool.query(
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
      ORDER BY
        CASE severidade
          WHEN 'ERRO' THEN 1
          WHEN 'DIVERGENCIA' THEN 2
          ELSE 3
        END,
        numero_linha NULLS FIRST,
        id
      LIMIT 1000
      `,
      [importacaoId]
    ),
  ]);

  return {
    importacao,
    linhas: linhasResult.rows,
    ocorrencias: ocorrenciasResult.rows,
    paginacao: {
      pagina: paginaSegura,
      limite: limiteSeguro,
      total: Number(importacao.total_linhas || 0),
    },
  };
}

async function listarImportacoes(
  usuario,
  shoppingScope,
  { pagina = 1, limite = 20 } = {}
) {
  const paginaSegura = Math.max(Number(pagina) || 1, 1);
  const limiteSeguro = Math.min(Math.max(Number(limite) || 20, 1), 100);
  const offset = (paginaSegura - 1) * limiteSeguro;
  const parametros = [];
  const where = [];

  if (!PERFIS_ACESSO_TOTAL.has(usuario.perfil)) {
    parametros.push(usuario.id);
    where.push(`i.usuario_id = $${parametros.length}`);

    parametros.push((shoppingScope.shoppingIds || []).map(String));
    where.push(`
      (
        i.status = 'REJEITADA'
        OR NOT EXISTS (
          SELECT 1
          FROM portal_vendas_importacao_linhas linha_escopo
          WHERE linha_escopo.importacao_id = i.id
            AND linha_escopo.shopping_sistema_id IS NOT NULL
            AND NOT (
              linha_escopo.shopping_sistema_id =
              ANY($${parametros.length}::text[])
            )
        )
      )
    `);
  }

  parametros.push(limiteSeguro);
  const limitePosicao = parametros.length;
  parametros.push(offset);
  const offsetPosicao = parametros.length;

  const resultado = await pool.query(
    `
    SELECT
      i.id,
      i.usuario_nome,
      i.usuario_perfil,
      i.confirmado_por_nome,
      i.arquivo_nome,
      i.status,
      i.total_linhas,
      i.total_vendas,
      i.total_erros,
      i.total_divergencias,
      i.total_coberturas_substituidas,
      i.criada_em,
      i.validada_em,
      i.confirmada_em,
      i.concluida_em,
      COUNT(*) OVER()::bigint AS total_registros
    FROM portal_vendas_importacoes i
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY i.criada_em DESC, i.id DESC
    LIMIT $${limitePosicao}
    OFFSET $${offsetPosicao}
    `,
    parametros
  );

  const total = resultado.rows.length
    ? Number(resultado.rows[0].total_registros)
    : 0;

  return {
    dados: resultado.rows.map(({ total_registros, ...row }) => row),
    paginacao: {
      pagina: paginaSegura,
      limite: limiteSeguro,
      total,
      totalPaginas: Math.max(Math.ceil(total / limiteSeguro), 1),
    },
  };
}

function mapasOficiaisIguais(linha, oficial) {
  if (!oficial || oficial.multiplosShoppings) return false;
  if (linha.shopping_sistema_id !== oficial.shoppingId) return false;
  if ((linha.loja_sistema || null) !== (oficial.lojaSistema || null)) {
    return false;
  }

  const lucsLinha = [...(linha.lucs_sistema || [])]
    .map((item) => ({
      luc: String(item.luc),
      abl: item.abl === null ? null : Number(item.abl),
    }))
    .sort((a, b) => a.luc.localeCompare(b.luc));
  const lucsOficiais = [...oficial.lucs]
    .map((item) => ({ luc: String(item.luc), abl: item.abl }))
    .sort((a, b) => a.luc.localeCompare(b.luc));

  return JSON.stringify(lucsLinha) === JSON.stringify(lucsOficiais);
}

async function confirmarImportacao(
  importacaoId,
  usuario,
  shoppingScope,
  executorExterno = null
) {
  const client = executorExterno || await pool.connect();
  const gerenciarTransacao = !executorExterno;

  try {
    if (gerenciarTransacao) await client.query("BEGIN");

    const importacaoResult = await client.query(
      `
      SELECT *
      FROM portal_vendas_importacoes
      WHERE id = $1
      FOR UPDATE
      `,
      [importacaoId]
    );

    const importacao = importacaoResult.rows[0];

    if (!importacao) {
      throw erroHttp(404, "Importação não encontrada.", "IMPORTACAO_NAO_ENCONTRADA");
    }

    if (!podeConsultarImportacao(usuario, importacao)) {
      throw erroHttp(403, "Você não pode confirmar esta importação.", "IMPORTACAO_NAO_AUTORIZADA");
    }

    if (importacao.status !== "AGUARDANDO_CONFIRMACAO") {
      throw erroHttp(
        409,
        "A importação não está aguardando confirmação.",
        "STATUS_IMPORTACAO_INVALIDO"
      );
    }

    if (Number(importacao.total_erros || 0) > 0) {
      throw erroHttp(409, "A importação possui erros bloqueantes.", "IMPORTACAO_COM_ERROS");
    }

    const linhasResult = await client.query(
      `
      SELECT *
      FROM portal_vendas_importacao_linhas
      WHERE importacao_id = $1
      ORDER BY numero_linha
      `,
      [importacaoId]
    );

    const linhas = linhasResult.rows;
    const permitidos = Array.isArray(shoppingScope.shoppingIds)
      ? new Set(shoppingScope.shoppingIds.map(String))
      : null;

    if (permitidos) {
      const naoAutorizada = linhas.some((linha) => {
        const informado = normalizarShoppingInformado(
          linha.shopping_informado
        );
        return (
          !permitidos.has(informado) ||
          !permitidos.has(String(linha.shopping_sistema_id))
        );
      });

      if (naoAutorizada) {
        throw erroHttp(
          403,
          "A importação contém shopping fora do acesso atual do usuário.",
          "SHOPPING_NAO_AUTORIZADO"
        );
      }
    }

    const contratos = [...new Set(linhas.map((linha) => linha.contrato))];
    const oficiais = await obterContratosOficiais(contratos, client);

    if (
      linhas.some(
        (linha) => !mapasOficiaisIguais(linha, oficiais.get(linha.contrato))
      )
    ) {
      throw erroHttp(
        409,
        "O cadastro oficial de um ou mais contratos mudou após a validação. Envie o arquivo novamente.",
        "CADASTRO_OFICIAL_ALTERADO"
      );
    }

    const grupos = new Map();

    for (const linha of linhas) {
      const chave = [linha.contrato, linha.periodo, linha.canal].join("|");
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(linha);
    }

    const chavesOrdenadas = [...grupos.keys()].sort();

    for (const chave of chavesOrdenadas) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
        ["PORTAL_VENDAS", chave]
      );
    }

    await client.query(
      `
      UPDATE portal_vendas_importacoes
      SET status = 'PROCESSANDO',
          confirmado_por_usuario_id = $2,
          confirmado_por_nome = $3,
          confirmada_em = NOW()
      WHERE id = $1
      `,
      [importacaoId, usuario.id, usuario.nome]
    );

    let substituidas = 0;

    for (const chave of chavesOrdenadas) {
      const grupo = grupos.get(chave);
      const primeira = grupo[0];

      const anteriores = await client.query(
        `
        UPDATE portal_vendas_coberturas
        SET ativa = FALSE,
            inativada_por_usuario_id = $4,
            inativada_por_nome = $5,
            inativada_em = NOW(),
            substituida_por_importacao_id = $6
        WHERE contrato = $1
          AND periodo = $2
          AND canal = $3
          AND ativa = TRUE
        RETURNING id
        `,
        [
          primeira.contrato,
          primeira.periodo,
          primeira.canal,
          usuario.id,
          usuario.nome,
          importacaoId,
        ]
      );

      substituidas += anteriores.rowCount;

      const coberturaResult = await client.query(
        `
        INSERT INTO portal_vendas_coberturas (
          importacao_id,
          contrato,
          periodo,
          canal,
          granularidade,
          shopping_id,
          shopping_nome,
          loja_sistema,
          abl_total_sistema,
          criada_por_usuario_id,
          criada_por_nome
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
        `,
        [
          importacaoId,
          primeira.contrato,
          primeira.periodo,
          primeira.canal,
          primeira.granularidade,
          primeira.shopping_sistema_id,
          primeira.shopping_sistema_nome,
          primeira.loja_sistema,
          primeira.abl_total_sistema || 0,
          usuario.id,
          usuario.nome,
        ]
      );

      const coberturaId = Number(coberturaResult.rows[0].id);

      if (anteriores.rowCount) {
        await client.query(
          `
          UPDATE portal_vendas_coberturas
          SET substituida_por_cobertura_id = $2
          WHERE id = ANY($1::bigint[])
          `,
          [anteriores.rows.map((row) => row.id), coberturaId]
        );
      }

      const lucs = primeira.lucs_sistema || [];

      for (let indice = 0; indice < lucs.length; indice += 1) {
        const luc = lucs[indice];
        await client.query(
          `
          INSERT INTO portal_vendas_cobertura_lucs (
            cobertura_id,
            luc,
            abl,
            tipo_unidade,
            ordem
          )
          VALUES ($1, $2, $3, $4, $5)
          `,
          [
            coberturaId,
            luc.luc,
            luc.abl,
            luc.tipoUnidade || luc.tipo_unidade || null,
            indice + 1,
          ]
        );
      }

      for (const linha of grupo) {
        await client.query(
          `
          INSERT INTO portal_vendas (
            cobertura_id,
            linha_importacao_id,
            data_venda,
            vendas
          )
          VALUES ($1, $2, $3, $4)
          `,
          [
            coberturaId,
            linha.id,
            linha.data_venda,
            linha.vendas,
          ]
        );
      }
    }

    await client.query(
      `
      UPDATE portal_vendas_importacoes
      SET status = 'CONCLUIDA',
          total_coberturas_substituidas = $2,
          concluida_em = NOW()
      WHERE id = $1
      `,
      [importacaoId, substituidas]
    );

    if (gerenciarTransacao) await client.query("COMMIT");

    return {
      importacaoId: Number(importacaoId),
      status: "CONCLUIDA",
      coberturasCriadas: grupos.size,
      coberturasSubstituidas: substituidas,
    };
  } catch (error) {
    if (gerenciarTransacao) await client.query("ROLLBACK");
    throw error;
  } finally {
    if (gerenciarTransacao) client.release();
  }
}

module.exports = {
  confirmarImportacao,
  criarImportacao,
  listarImportacoes,
  marcarImportacaoComErro,
  obterContratosOficiais,
  obterImportacaoDetalhada,
  salvarResultadoValidacao,
};
