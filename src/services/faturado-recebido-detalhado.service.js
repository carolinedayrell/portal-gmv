const ExcelJS = require("exceljs");

const SHOPPINGS_DETALHADO = {
  "3": {
    nome: "Só Marcas Contagem",
    nomeAba: "SMO Contagem",
    tituloResumo: "SM CTG",
    modelo: "padrao",
  },
  "17": {
    nome: "Só Marcas Guarulhos",
    nomeAba: "SMO Guarulhos",
    tituloResumo: "SM GRU",
    modelo: "padrao",
  },
  "31": {
    nome: "BH Outlet",
    nomeAba: "BH Outlet",
    tituloResumo: "BH",
    modelo: "bh",
  },
  "8": {
    nome: "Shopping do Avião",
    nomeAba: "Shopping do Avião",
    tituloResumo: "Avião",
    modelo: "aviao",
  },
};

const CLASSES_DETALHADO = {
  taxaAdministracao: ["14"],
  fundoReserva: ["111"],
  agua: ["143"],
  gas: ["176"],
  energia: ["144"],
  marketing: ["11264"],
  iptu: ["11233"],
  fppAviao: ["11582"],
  outrasReceitas: ["156"],
  fundoPromocao: ["4"],
  condominio: ["2", "11459"],

  // Mantém as classes atualmente tratadas pelo portal como aluguel.
  aluguel: [
    "1",
    "6",
    "7",
    "11",
    "78",
    "278",
    "2111",
    "11236",
    "11238",
    "11240",
    "11506",
  ],

  arCondicionado: ["11505"],
};

const LINHAS_CAIXA = {
  padrao: {
    taxaAdministracao: 54,
    fundoReserva: 56,
    aguaOuGas: 58,
    energia: 60,
    marketingOuIptu: 62,
    iptuOuFpp: 64,
    outrasReceitas: 66,
    aluguel: 68,
    condominio: 70,
    fundoPromocao: 72,
    total: 74,
  },

  bh: {
    taxaAdministracao: 57,
    fundoReserva: 59,
    agua: 61,
    energia: 63,
    iptu: 65,
    arCondicionado: 67,
    marketing: 69,
    outrasReceitas: 71,
    aluguel: 73,
    condominio: 75,
    fundoPromocao: 77,
    total: 79,
  },
};

const LINHAS_RESUMO = {
  padrao: {
    aluguel: [68],
    condominio: [70],
    fpp: [72],
    outrasReceitas: [54, 56, 62, 66],
    especificos: [58, 60, 64],
    total: 74,
  },

  bh: {
    aluguel: [73],
    condominio: [75],
    fpp: [77],
    outrasReceitas: [57, 59, 69, 71],
    especificos: [61, 63, 65, 67],
    total: 79,
  },
};

function splitParam(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function colunaExcel(numero) {
  let resultado = "";
  let atual = numero;

  while (atual > 0) {
    const resto = (atual - 1) % 26;
    resultado = String.fromCharCode(65 + resto) + resultado;
    atual = Math.floor((atual - 1) / 26);
  }

  return resultado;
}

function escaparNomeAba(nome) {
  return String(nome).replaceAll("'", "''");
}

function referenciaFonte(nomeAba, coluna, linha) {
  return `'${escaparNomeAba(nomeAba)}'!${coluna}${linha}`;
}

function formulaSomaFonte(nomeAba, coluna, linhas) {
  return linhas
    .map((linha) => referenciaFonte(nomeAba, coluna, linha))
    .join("+");
}

function numero(value) {
  return Number(value || 0);
}

function criarVetorMensal() {
  return Array.from({ length: 12 }, () => 0);
}

async function buscarLancamentosDetalhados(pool, shoppingId, ano) {
  const inicio = `${ano}-01-01`;
  const fim = `${Number(ano) + 1}-01-01`;

  const result = await pool.query(
    `
    SELECT
      c.mes_mapa::text AS competencia,
      c.num_classe_da_conta::text AS classe_id,

      (
        COALESCE(c.valor_lcto, 0)
        - COALESCE(c.descontos, 0)
        + COALESCE(c.juros, 0)
        + COALESCE(c.correcoes, 0)
        + COALESCE(c.multa, 0)
      ) AS faturado,

      COALESCE(c.valor_liquidado, 0) AS valor_liquidado,
      c.data_pagamento,
      c.data_definicao

    FROM gshop_contas c

    LEFT JOIN gshop_locatarios l
      ON l.num_locatario::text = c.num_locatario::text

    WHERE c.idfilial::text = $1

      AND (
        (
          c.mes_mapa::text ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
          AND TO_DATE(c.mes_mapa::text, 'MM/YYYY') >= $2::date
          AND TO_DATE(c.mes_mapa::text, 'MM/YYYY') < $3::date
        )
        OR (
          c.data_definicao >= $2::date
          AND c.data_definicao < $3::date
        )
      )

      AND COALESCE(UPPER(TRIM(l.nome_fantasia)), '')
        <> 'EDER BARBOSA DOS REIS'

      AND NOT EXISTS (
        SELECT 1
        FROM gshop_contas reemitida
        WHERE reemitida.idlancamento_origem_acordo IS NOT NULL
          AND reemitida.idlancamento_origem_acordo::text =
              c.idlancamento::text
      )
    `,
    [String(shoppingId), inicio, fim]
  );

  return result.rows;
}

function encontrarConta(classeId) {
  return Object.entries(CLASSES_DETALHADO).find(([, classes]) =>
    classes.includes(String(classeId))
  )?.[0];
}

function agruparLancamentos(lancamentos, ano) {
  const dados = {};

  Object.keys(CLASSES_DETALHADO).forEach((conta) => {
    dados[conta] = {
      faturado: criarVetorMensal(),
      recebidoCompetencia: criarVetorMensal(),
      caixa: criarVetorMensal(),
    };
  });

  lancamentos.forEach((item) => {
    const conta = encontrarConta(item.classe_id);
    if (!conta) return;

    const [, anoCompetencia] = String(item.competencia || "").split("/");
    const mesCompetencia = Number(
      String(item.competencia || "").split("/")[0]
    );

    if (
      Number(anoCompetencia) === Number(ano) &&
      mesCompetencia >= 1 &&
      mesCompetencia <= 12
    ) {
      dados[conta].faturado[mesCompetencia - 1] += numero(item.faturado);

      if (item.data_pagamento) {
        dados[conta].recebidoCompetencia[mesCompetencia - 1] +=
          numero(item.valor_liquidado);
      }
    }

    if (item.data_definicao) {
      const dataCaixa = new Date(item.data_definicao);

      if (dataCaixa.getFullYear() === Number(ano)) {
        dados[conta].caixa[dataCaixa.getMonth()] +=
          numero(item.valor_liquidado);
      }
    }
  });

  return dados;
}

function aplicarValor(cell, valor) {
  cell.value = numero(valor);
  cell.numFmt = '#,##0.00';
}

function aplicarFormula(cell, formula, result = 0) {
  cell.value = {
    formula,
    result: numero(result),
  };
  cell.numFmt = '#,##0.00';
}

function montarAbaFonte(workbook, config, ano, dados) {
  const nomeAba = `${config.nomeAba} ${ano}`;
  const sheet = workbook.addWorksheet(nomeAba);

  sheet.views = [{ showGridLines: false, state: "frozen", ySplit: 3 }];
  sheet.getColumn("B").width = 32;
  sheet.getColumn("C").width = 24;

  for (let coluna = 4; coluna <= 16; coluna += 1) {
    sheet.getColumn(coluna).width = 15;
  }

  montarBlocoCompetencia(sheet, config, ano, dados);
  montarBlocoCaixa(sheet, config, ano, dados);

  return {
    nomeAba,
    config,
    ano,
    dados,
  };
}

function montarBlocoCaixa(sheet, config, ano, dados) {
  const modelo = config.modelo === "bh" ? "bh" : "padrao";
  const linhas = LINHAS_CAIXA[modelo];

  const linhaPrimeiraConta =
    modelo === "bh"
      ? linhas.taxaAdministracao
      : linhas.taxaAdministracao;

  const linhaTitulo = linhaPrimeiraConta - 2;
  const linhaCabecalho = linhaPrimeiraConta - 1;

  sheet.getCell(`B${linhaTitulo}`).value =
    `${config.nomeAba.toUpperCase()} - ${ano} - CAIXA`;

  sheet.getCell(`B${linhaCabecalho}`).value = "Conta";
  sheet.getCell(`C${linhaCabecalho}`).value = "Tipo de valor";

  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril",
    "Maio", "Junho", "Julho", "Agosto",
    "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  meses.forEach((mes, index) => {
    sheet.getCell(linhaCabecalho, 4 + index).value = mes;
  });

  sheet.getCell(linhaCabecalho, 16).value =
    `Janeiro/${Number(ano) + 1}`;

  const contas =
    modelo === "bh"
      ? [
          ["taxaAdministracao", "Taxa de Administração"],
          ["fundoReserva", "Fundo de Reserva"],
          ["agua", "Água e Esgoto"],
          ["energia", "Energia Elétrica"],
          ["iptu", "IPTU"],
          ["arCondicionado", "Ar Condicionado"],
          ["marketing", "Marketing Comemorativo"],
          ["outrasReceitas", "Outras Receitas"],
          ["aluguel", "Aluguel"],
          ["condominio", "Condomínio"],
          ["fundoPromocao", "Fundo de Promoção"],
        ]
      : [
          ["taxaAdministracao", "Taxa de Administração"],
          ["fundoReserva", "Fundo de Reserva"],
          [
            "aguaOuGas",
            config.modelo === "aviao"
              ? "Água e Esgoto"
              : config.nomeAba.includes("Guarulhos")
                ? "Gás"
                : "Água e Esgoto",
          ],
          ["energia", "Energia Elétrica"],
          [
            "marketingOuIptu",
            config.modelo === "aviao"
              ? "IPTU"
              : "Marketing Comemorativo",
          ],
          [
            "iptuOuFpp",
            config.modelo === "aviao"
              ? "FPP/Feirão"
              : "IPTU",
          ],
          ["outrasReceitas", "Outras Receitas"],
          ["aluguel", "Aluguel"],
          ["condominio", "Condomínio"],
          ["fundoPromocao", "Fundo de Promoção"],
        ];

  contas.forEach(([chaveLinha, rotulo]) => {
    const linha = linhas[chaveLinha];

    sheet.getCell(`B${linha}`).value = rotulo;
    sheet.getCell(`C${linha}`).value = "Recebimento do Mês";

    const chaveDados = converterChaveDados(config, chaveLinha);

    for (let mes = 0; mes < 12; mes += 1) {
      aplicarValor(
        sheet.getCell(linha, 4 + mes),
        dados[chaveDados]?.caixa[mes]
      );
    }

    aplicarValor(sheet.getCell(linha, 16), 0);
  });

  sheet.getCell(`B${linhas.total}`).value = "TOTAL";
  sheet.getCell(`C${linhas.total}`).value = "Recebimento do Mês";

  for (let coluna = 4; coluna <= 16; coluna += 1) {
    const letra = colunaExcel(coluna);
    const referencias = contas
      .map(([chaveLinha]) => `${letra}${linhas[chaveLinha]}`)
      .join(",");

    sheet.getCell(linhas.total, coluna).value = {
      formula: `SUM(${referencias})`,
      result: contas.reduce((total, [chaveLinha]) => {
        const chaveDados = converterChaveDados(config, chaveLinha);
        const mes = coluna - 4;

        return total + numero(dados[chaveDados]?.caixa[mes]);
      }, 0),
    };

    sheet.getCell(linhas.total, coluna).numFmt = '#,##0.00';
  }
}

function converterChaveDados(config, chaveLinha) {
  const mapa = {
    taxaAdministracao: "taxaAdministracao",
    fundoReserva: "fundoReserva",
    energia: "energia",
    outrasReceitas: "outrasReceitas",
    aluguel: "aluguel",
    condominio: "condominio",
    fundoPromocao: "fundoPromocao",
    arCondicionado: "arCondicionado",
    marketing: "marketing",
    iptu: "iptu",
    agua: "agua",
  };

  if (chaveLinha === "aguaOuGas") {
    return config.nomeAba.includes("Guarulhos") ? "gas" : "agua";
  }

  if (chaveLinha === "marketingOuIptu") {
    return config.modelo === "aviao" ? "iptu" : "marketing";
  }

  if (chaveLinha === "iptuOuFpp") {
    return config.modelo === "aviao" ? "fppAviao" : "iptu";
  }

  return mapa[chaveLinha] || chaveLinha;
}

function montarResumo(workbook, fontes, anos) {
  const sheet = workbook.addWorksheet("Resumo", {
    properties: { tabColor: { argb: "4472C4" } },
  });

  sheet.views = [{ showGridLines: false, state: "frozen", xSplit: 2 }];
  sheet.getColumn("B").width = 24;

  const empreendimentos = [
    ...new Map(
      fontes.map((fonte) => [fonte.config.nomeAba, fonte.config])
    ).values(),
  ];

  let linhaBloco = 2;

  empreendimentos.forEach((config) => {
    sheet.getCell(linhaBloco, 2).value = config.tituloResumo;

    anos.forEach((ano, indiceAno) => {
      for (let mes = 0; mes < 12; mes += 1) {
        const colunaResumo = 3 + indiceAno * 12 + mes;
        const fonte = fontes.find(
          (item) =>
            item.config.nomeAba === config.nomeAba &&
            String(item.ano) === String(ano)
        );

        sheet.getCell(linhaBloco, colunaResumo).value =
          new Date(Number(ano), mes, 1);
        sheet.getCell(linhaBloco, colunaResumo).numFmt = "mmm/yyyy";

        if (fonte) {
          preencherColunaResumo(
            sheet,
            fonte,
            linhaBloco,
            colunaResumo,
            mes
          );
        }
      }
    });

    linhaBloco += 9;
  });

  return sheet;
}
function preencherColunaResumo(
  sheet,
  fonte,
  linhaBloco,
  colunaResumo,
  mes
) {
  const modelo =
    fonte.config.modelo === "bh" ? "bh" : "padrao";

  const mapa = LINHAS_RESUMO[modelo];
  const colunaFonte = colunaExcel(4 + mes);
  const nomeAba = fonte.nomeAba;

  const categorias = [
    ["Aluguel", mapa.aluguel],
    ["Condomínio", mapa.condominio],
    ["FPP", mapa.fpp],
    ["Outras receitas", mapa.outrasReceitas],
    ["Específicos", mapa.especificos],
  ];

  categorias.forEach(([rotulo, linhas], index) => {
    const linha = linhaBloco + 1 + index;
    sheet.getCell(linha, 2).value = rotulo;

    sheet.getCell(linha, colunaResumo).value = {
      formula: formulaSomaFonte(nomeAba, colunaFonte, linhas),
      result: somarResultadosFonte(fonte, linhas, mes),
    };

    sheet.getCell(linha, colunaResumo).numFmt = '#,##0.00';
  });

  const linhaTotal = linhaBloco + 6;
  const linhaValidacao = linhaBloco + 7;
  const letraResumo = colunaExcel(colunaResumo);

  sheet.getCell(linhaTotal, 2).value = "Total";
  sheet.getCell(linhaTotal, colunaResumo).value = {
    formula: `SUM(${letraResumo}${linhaBloco + 1}:${letraResumo}${linhaBloco + 5})`,
    result: categorias.reduce(
      (total, [, linhas]) =>
        total + somarResultadosFonte(fonte, linhas, mes),
      0
    ),
  };

  sheet.getCell(linhaValidacao, 2).value = "Validação";
  sheet.getCell(linhaValidacao, colunaResumo).value = {
    formula:
      `${letraResumo}${linhaTotal}=` +
      referenciaFonte(nomeAba, colunaFonte, mapa.total),
    result: true,
  };
}

async function gerarWorkbookDetalhado(pool, query) {
  const shoppingIds = splitParam(query.shopping);
  const anos = splitParam(query.anos)
    .sort((a, b) => Number(a) - Number(b));

  if (!shoppingIds.length) {
    const error = new Error("Selecione pelo menos um shopping.");
    error.statusCode = 400;
    throw error;
  }

  if (!anos.length) {
    const error = new Error("Selecione pelo menos um ano.");
    error.statusCode = 400;
    throw error;
  }

  const invalidos = shoppingIds.filter(
    (id) => !SHOPPINGS_DETALHADO[id]
  );

  if (invalidos.length) {
    const error = new Error(
      "O relatório detalhado está disponível somente para os Outlets e o Shopping do Avião."
    );
    error.statusCode = 400;
    throw error;
  }

  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Portal GMV";
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;

  const fontes = [];

  for (const shoppingId of shoppingIds) {
    const config = SHOPPINGS_DETALHADO[shoppingId];

    for (const ano of anos) {
      const lancamentos = await buscarLancamentosDetalhados(
        pool,
        shoppingId,
        ano
      );

      const dados = agruparLancamentos(lancamentos, ano);

      fontes.push(
        montarAbaFonte(workbook, config, ano, dados)
      );
    }
  }

  montarResumo(workbook, fontes, anos);
  workbook.getWorksheet("Resumo").orderNo = 1;

  return workbook;
}

module.exports = {
  gerarWorkbookDetalhado,
  SHOPPINGS_DETALHADO,
};

// TESTE
