const ExcelJS = require("exceljs");

const SHOPPINGS_DETALHADO = {
"3": {
  nome: "Só Marcas Contagem",
  nomeAba: "Só Marcas Contagem",
  tituloResumo: "SM CTG",
  modelo: "padrao",
  ordemResumo: 1,
},
"17": {
  nome: "Só Marcas Guarulhos",
  nomeAba: "Só Marcas Guarulhos",
  tituloResumo: "SM GRU",
  modelo: "padrao",
  ordemResumo: 2,
  usaGas: true,
},
"31": {
  nome: "BH Outlet",
  nomeAba: "BH Outlet",
  tituloResumo: "BH",
  modelo: "bh",
  ordemResumo: 3,
},
"8": {
  nome: "Shopping do Avião",
  nomeAba: "Shopping do Avião",
  tituloResumo: "Avião",
  modelo: "aviao",
  ordemResumo: 4,
},
};

const CLASSES_DETALHADO = {
  taxaAdministracao: ["14", "11503"],
  fundoReserva: ["111"],
  agua: ["143","1244","1100","459","411"],
  gas: [
  "11257",
  "1297",
  "1296",
  "1097",
  "176",
],
  energia: ["144","1245","1099","460","412","246"],
  marketing: ["11264","11527"],
  iptu: ["11233","1250","482","434"],
  fppAviao: ["11582"],

  outrasReceitas: [
    "156",
    "11236","11235"
  ],

  fundoPromocao: ["4",
    "9",
    "5"],

  condominio: [
    "2",
    "11459",
    "11415",
    "18",
    "3"
  ],

  aluguel: [
    "1",
    "6",
    "7",
    "11",
    "78",
    "278",
    "2111",
    "11238",
    "11240",
    "11506",
    "11509",
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

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const FORMATO_CONTABIL = '#,##0.00;[Red](#,##0.00);-';
const FORMATO_PERCENTUAL = '0.0%;[Red](0.0%);-';
const FORMATO_RESUMO = '#,##0;[Red](#,##0);-';
const COR_CINZA_CLARO = "D9D9D9";
const COR_CINZA_CAIXA = "BFBFBF";
const COR_SUBTOTAL = "E7E6E6";
const COR_TOTAL = "D9D9D9";
const COR_VALIDACAO = "E7E6E6";
const COR_BORDA = "A6A6A6";

function splitParam(value) {
  return [...new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function numero(value) {
  return Number(value || 0);
}

function colunaExcel(numeroColuna) {
  let resultado = "";
  let atual = numeroColuna;

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

function criarVetorMensal(tamanho = 12) {
  return Array.from({ length: tamanho }, () => 0);
}

function encontrarConta(classeId) {
  return Object.entries(CLASSES_DETALHADO).find(([, classes]) =>
    classes.includes(String(classeId))
  )?.[0];
}

function modeloLinhas(config) {
  return config.modelo === "bh" ? "bh" : "padrao";
}

function obterContasCaixa(config) {
  if (config.modelo === "bh") {
    return [
      {
        chaveLinha: "taxaAdministracao",
        rotulo: "Taxa de Administração",
        chaveDados: "taxaAdministracao",
      },
      {
        chaveLinha: "fundoReserva",
        rotulo: "Fundo de Reserva",
        chaveDados: "fundoReserva",
      },
      {
        chaveLinha: "agua",
        rotulo: "Água e Esgoto",
        chaveDados: "agua",
      },
      {
        chaveLinha: "energia",
        rotulo: "Energia Elétrica",
        chaveDados: "energia",
      },
      {
        chaveLinha: "iptu",
        rotulo: "IPTU",
        chaveDados: "iptu",
      },
      {
        chaveLinha: "arCondicionado",
        rotulo: "Ar Condicionado",
        chaveDados: "arCondicionado",
      },
      {
        chaveLinha: "marketing",
        rotulo: "Marketing Comemorativo",
        chaveDados: "marketing",
      },
      {
        chaveLinha: "outrasReceitas",
        rotulo: "Outras Receitas",
        chaveDados: "outrasReceitas",
      },
      {
        chaveLinha: "aluguel",
        rotulo: "Aluguel",
        chaveDados: "aluguel",
      },
      {
        chaveLinha: "condominio",
        rotulo: "Condomínio",
        chaveDados: "condominio",
      },
      {
        chaveLinha: "fundoPromocao",
        rotulo: "Fundo de Promoção",
        chaveDados: "fundoPromocao",
      },
    ];
  }

  const guarulhos = config.usaGas === true;
  const aviao = config.modelo === "aviao";

  return [
    {
      chaveLinha: "taxaAdministracao",
      rotulo: "Taxa de Administração",
      chaveDados: "taxaAdministracao",
    },
    {
      chaveLinha: "fundoReserva",
      rotulo: "Fundo de Reserva",
      chaveDados: "fundoReserva",
    },
    {
      chaveLinha: "aguaOuGas",
      rotulo: guarulhos
        ? "Gás"
        : "Água e Esgoto",
      chaveDados: guarulhos
        ? "gas"
        : "agua",
    },
    {
      chaveLinha: "energia",
      rotulo: "Energia Elétrica",
      chaveDados: "energia",
    },
    {
      chaveLinha: "marketingOuIptu",
      rotulo: aviao
        ? "IPTU"
        : "Marketing Comemorativo",
      chaveDados: aviao
        ? "iptu"
        : "marketing",
    },
    {
      chaveLinha: "iptuOuFpp",
      rotulo: aviao
        ? "FPP/Feirão"
        : "IPTU",
      chaveDados: aviao
        ? "fppAviao"
        : "iptu",
    },
    {
      chaveLinha: "outrasReceitas",
      rotulo: "Outras Receitas",
      chaveDados: "outrasReceitas",
    },
    {
      chaveLinha: "aluguel",
      rotulo: "Aluguel",
      chaveDados: "aluguel",
    },
    {
      chaveLinha: "condominio",
      rotulo: "Condomínio",
      chaveDados: "condominio",
    },
    {
      chaveLinha: "fundoPromocao",
      rotulo: "Fundo de Promoção",
      chaveDados: "fundoPromocao",
    },
  ];
}

function obterContasPrincipais() {
  return [
    { rotulo: "Aluguel", chaveDados: "aluguel" },
    { rotulo: "Condomínio", chaveDados: "condominio" },
    { rotulo: "Fundo de Promoção", chaveDados: "fundoPromocao" },
  ];
}

async function buscarLancamentosDetalhados(pool, shoppingId, ano) {
  const inicio = `${ano}-01-01`;
  const fimCaixa = `${Number(ano) + 1}-01-01`;
  const competencias = Array.from(
    { length: 12 },
    (_, index) => `${String(index + 1).padStart(2, "0")}/${ano}`
  );

  const result = await pool.query(
    `
    SELECT
      c.mes_mapa AS competencia,
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
      TO_CHAR(c.data_definicao, 'YYYY-MM') AS periodo_caixa
    FROM gshop_contas c
    WHERE c.idfilial = $1::bigint
      AND (
        c.mes_mapa = ANY($2::text[])
        OR (
          c.data_definicao >= $3::date
          AND c.data_definicao < $4::date
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM gshop_contas reemitida
        WHERE reemitida.idlancamento_origem_acordo IS NOT NULL
          AND reemitida.idlancamento_origem_acordo = c.idlancamento
      )
    `,
    [String(shoppingId), competencias, inicio, fimCaixa]
  );

  return result.rows;
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

    const [mesTexto, anoTexto] = String(item.competencia || "").split("/");
    const mesCompetencia = Number(mesTexto);
    const anoCompetencia = Number(anoTexto);

    if (
      anoCompetencia === Number(ano) &&
      mesCompetencia >= 1 &&
      mesCompetencia <= 12
    ) {
      dados[conta].faturado[mesCompetencia - 1] += numero(item.faturado);

      if (item.data_pagamento) {
        dados[conta].recebidoCompetencia[mesCompetencia - 1] +=
          numero(item.valor_liquidado);
      }
    }

    const [anoCaixaTexto, mesCaixaTexto] = String(item.periodo_caixa || "").split("-");
    const anoCaixa = Number(anoCaixaTexto);
    const mesCaixa = Number(mesCaixaTexto);

if (
  anoCaixa === Number(ano) &&
  mesCaixa >= 1 &&
  mesCaixa <= 12
) {
  dados[conta].caixa[mesCaixa - 1] +=
    numero(item.valor_liquidado);
}
  });

  return dados;
}

function aplicarFonte(
  cell,
  size = 11,
  bold = false,
  color = "000000"
) {
  cell.font = {
    name: "Aptos Narrow",
    size,
    bold,
    color: { argb: color },
  };
}

function aplicarPreenchimento(cell, argb) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb },
  };
}

function removerPreenchimento(cell) {
  cell.fill = {
    type: "pattern",
    pattern: "none",
  };
}

function criarLadoBorda() {
  return {
    style: "thin",
    color: { argb: COR_BORDA },
  };
}

function aplicarBordasHorizontais(cell) {
  cell.border = {
    top: criarLadoBorda(),
    bottom: criarLadoBorda(),
  };
}

function aplicarContornoBloco(
  sheet,
  linhaInicial,
  linhaFinal,
  colunaInicial = 2,
  colunaFinal = 15
) {
  for (
    let linha = linhaInicial;
    linha <= linhaFinal;
    linha += 1
  ) {
    for (
      let coluna = colunaInicial;
      coluna <= colunaFinal;
      coluna += 1
    ) {
      const cell = sheet.getCell(linha, coluna);
      const border = {};

      if (linha === linhaInicial) {
        border.top = criarLadoBorda();
      }

      if (linha === linhaFinal) {
        border.bottom = criarLadoBorda();
      }

      if (coluna === colunaInicial) {
        border.left = criarLadoBorda();
      }

      if (coluna === colunaFinal) {
        border.right = criarLadoBorda();
      }

      cell.border = border;
    }
  }
}

function estilizarTitulo(cell, size = 20) {
  aplicarFonte(cell, size, false, "000000");
  removerPreenchimento(cell);
  cell.border = {};
  cell.alignment = {
    horizontal: "center",
    vertical: "middle",
  };
}

function estilizarCabecalho(
  cell,
  size = 12,
  preenchimento = null
) {
  aplicarFonte(cell, size, false, "000000");

  if (preenchimento) {
    aplicarPreenchimento(cell, preenchimento);
  } else {
    removerPreenchimento(cell);
  }

  aplicarBordasHorizontais(cell);

  cell.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };
}

function estilizarRotulo(cell, bold = false) {
  aplicarFonte(cell, 11, bold, "000000");
  cell.border = {};
  cell.alignment = {
    horizontal: "left",
    vertical: "middle",
  };
}

function estilizarNumero(cell, bold = false) {
  aplicarFonte(cell, 11, bold, "000000");
  cell.border = {};
  cell.numFmt = FORMATO_CONTABIL;
  cell.alignment = {
    horizontal: "right",
    vertical: "middle",
  };
}

function estilizarCelulaResumo(
  cell,
  bold = false,
  preenchimento = null
) {
  aplicarFonte(cell, 11, bold, "000000");

  if (preenchimento) {
    aplicarPreenchimento(cell, preenchimento);
  } else {
    removerPreenchimento(cell);
  }

  aplicarBordasHorizontais(cell);
}

function estilizarValorResumo(
  cell,
  bold = false,
  preenchimento = null
) {
  estilizarCelulaResumo(
    cell,
    bold,
    preenchimento
  );

  cell.numFmt = FORMATO_RESUMO;

  cell.alignment = {
    horizontal: "right",
    vertical: "middle",
  };
}

function aplicarValor(cell, valor, bold = false) {
  cell.value = numero(valor);
  estilizarNumero(cell, bold);
}

function aplicarFormula(cell, formula, result, bold = false) {
  cell.value = { formula, result: numero(result) };
  estilizarNumero(cell, bold);
}

function aplicarPercentual(
  cell,
  coluna,
  linhaFaturado,
  linhaRecebido,
  faturado,
  recebido,
  corPreenchimento
) {
  const resultado = faturado === 0 ? 0 : recebido / faturado;

  cell.value = {
    formula:
      `IFERROR(${coluna}${linhaRecebido}/${coluna}${linhaFaturado},0)`,
    result: resultado,
  };

  estilizarNumero(cell, true);
  cell.numFmt = FORMATO_PERCENTUAL;
  aplicarPreenchimento(cell, corPreenchimento);
}

function somaValoresConta(dados, conta, campo, mes) {
  return numero(dados[conta.chaveDados]?.[campo]?.[mes]);
}

function montarBlocoCompetencia(sheet, config, ano, dados) {
  const contasCaixa = obterContasCaixa(config);
  const contasEncargos = contasCaixa.filter(
    (conta) =>
      !["aluguel", "condominio", "fundoPromocao"].includes(
        conta.chaveDados
      )
  );
  const contasPrincipais = obterContasPrincipais();

  const layouts = {
    padrao: {
      linhaCabecalho: 5,
      linhaInicialEncargos: 7,
      linhaSubtotalEncargosFaturado: 28,
      linhaSubtotalEncargosRecebido: 29,
      linhaPercentualEncargos: 30,
      linhasPrincipais: [32, 35, 38],
      linhaSubtotalPrincipalFaturado: 41,
      linhaSubtotalPrincipalRecebido: 42,
      linhaPercentualPrincipal: 43,
      linhaTotalGeralFaturado: 45,
      linhaTotalGeralRecebido: 46,
      linhaPercentualGeral: 47,
    },
    bh: {
      linhaCabecalho: 5,
      linhaInicialEncargos: 7,
      linhaSubtotalEncargosFaturado: 31,
      linhaSubtotalEncargosRecebido: 32,
      linhaPercentualEncargos: 33,
      linhasPrincipais: [35, 38, 41],
      linhaSubtotalPrincipalFaturado: 44,
      linhaSubtotalPrincipalRecebido: 45,
      linhaPercentualPrincipal: 46,
      linhaTotalGeralFaturado: 48,
      linhaTotalGeralRecebido: 49,
      linhaPercentualGeral: 50,
    },
  };

  const layout = layouts[modeloLinhas(config)];

function prepararLinhaTotal(linha, rotulo, cor) {
  sheet.getCell(`B${linha}`).value = rotulo;
  sheet.mergeCells(`B${linha}:C${linha}`);
  estilizarRotulo(sheet.getCell(`B${linha}`), true);

  for (let coluna = 2; coluna <= 15; coluna += 1) {
    const cell = sheet.getCell(linha, coluna);

    aplicarFonte(cell, 11, true, "000000");
    aplicarPreenchimento(cell, cor);
    aplicarBordasHorizontais(cell);
  }
}

  function preencherConta(conta, linhaFaturado) {
    const linhaRecebido = linhaFaturado + 1;

    sheet.getCell(`B${linhaFaturado}`).value = conta.rotulo;
    sheet.getCell(`B${linhaRecebido}`).value = null;
    sheet.getCell(`C${linhaFaturado}`).value = "Faturado";
    sheet.getCell(`C${linhaRecebido}`).value = "Recebido";

    estilizarRotulo(sheet.getCell(`B${linhaFaturado}`));
    estilizarRotulo(sheet.getCell(`B${linhaRecebido}`));
    estilizarRotulo(sheet.getCell(`C${linhaFaturado}`));
    estilizarRotulo(sheet.getCell(`C${linhaRecebido}`));

    for (let mes = 0; mes < 12; mes += 1) {
      aplicarValor(
        sheet.getCell(linhaFaturado, 4 + mes),
        somaValoresConta(dados, conta, "faturado", mes)
      );

      aplicarValor(
        sheet.getCell(linhaRecebido, 4 + mes),
        somaValoresConta(
          dados,
          conta,
          "recebidoCompetencia",
          mes
        )
      );
    }
aplicarContornoBloco(
  sheet,
  linhaFaturado,
  linhaRecebido,
  2,
  15
);
    return {
      linhaFaturado,
      linhaRecebido,
    };
  }

  // Título do bloco COMPETÊNCIA.
  sheet.mergeCells("B2:O2");
  sheet.getCell("B2").value =
    `${config.nomeAba.toUpperCase()} - ${ano} - COMPETÊNCIA`;
  estilizarTitulo(sheet.getCell("B2"));
  sheet.getRow(2).height = 24;

  // Cabeçalho na linha 5, conforme a referência.
  sheet.getCell(`B${layout.linhaCabecalho}`).value = "Conta";
  sheet.getCell(`C${layout.linhaCabecalho}`).value =
    "Tipo de valor";

estilizarCabecalho(
  sheet.getCell(`B${layout.linhaCabecalho}`),
  12
);
estilizarCabecalho(
  sheet.getCell(`C${layout.linhaCabecalho}`),
  12
);

  MESES.forEach((mes, index) => {
    const cell = sheet.getCell(
      layout.linhaCabecalho,
      4 + index
    );

    cell.value = `${mes}/${ano}`;
  estilizarCabecalho(cell, 12, COR_CINZA_CLARO);
  });

  // Contas de encargos, com uma linha vazia entre as contas.
  const linhasFaturadoEncargos = [];
  const linhasRecebidoEncargos = [];

  contasEncargos.forEach((conta, index) => {
    const linhaFaturado =
      layout.linhaInicialEncargos + index * 3;

    const linhasConta = preencherConta(conta, linhaFaturado);

    linhasFaturadoEncargos.push(
      linhasConta.linhaFaturado
    );
    linhasRecebidoEncargos.push(
      linhasConta.linhaRecebido
    );
  });

  prepararLinhaTotal(
    layout.linhaSubtotalEncargosFaturado,
    "Total Faturado",
    COR_SUBTOTAL
  );
  prepararLinhaTotal(
    layout.linhaSubtotalEncargosRecebido,
    "Total Recebido",
    COR_SUBTOTAL
  );
  prepararLinhaTotal(
    layout.linhaPercentualEncargos,
    "% Recebido/Faturado - Encargos",
    COR_SUBTOTAL
  );

  for (let mes = 0; mes < 12; mes += 1) {
    const coluna = colunaExcel(4 + mes);

    const faturadoEncargos = contasEncargos.reduce(
      (total, conta) =>
        total +
        somaValoresConta(dados, conta, "faturado", mes),
      0
    );

    const recebidoEncargos = contasEncargos.reduce(
      (total, conta) =>
        total +
        somaValoresConta(
          dados,
          conta,
          "recebidoCompetencia",
          mes
        ),
      0
    );

    const cellFaturado = sheet.getCell(
      layout.linhaSubtotalEncargosFaturado,
      4 + mes
    );

    aplicarFormula(
      cellFaturado,
      `SUM(${linhasFaturadoEncargos
        .map((linha) => `${coluna}${linha}`)
        .join(",")})`,
      faturadoEncargos,
      true
    );
    aplicarPreenchimento(cellFaturado, COR_SUBTOTAL);

    const cellRecebido = sheet.getCell(
      layout.linhaSubtotalEncargosRecebido,
      4 + mes
    );

    aplicarFormula(
      cellRecebido,
      `SUM(${linhasRecebidoEncargos
        .map((linha) => `${coluna}${linha}`)
        .join(",")})`,
      recebidoEncargos,
      true
    );
    aplicarPreenchimento(cellRecebido, COR_SUBTOTAL);

    aplicarPercentual(
      sheet.getCell(
        layout.linhaPercentualEncargos,
        4 + mes
      ),
      coluna,
      layout.linhaSubtotalEncargosFaturado,
      layout.linhaSubtotalEncargosRecebido,
      faturadoEncargos,
      recebidoEncargos,
      COR_SUBTOTAL
    );
  }

  // Aluguel, Condomínio e Fundo de Promoção.
  const linhasFaturadoPrincipais = [];
  const linhasRecebidoPrincipais = [];

  contasPrincipais.forEach((conta, index) => {
    const linhasConta = preencherConta(
      conta,
      layout.linhasPrincipais[index]
    );

    linhasFaturadoPrincipais.push(
      linhasConta.linhaFaturado
    );
    linhasRecebidoPrincipais.push(
      linhasConta.linhaRecebido
    );
  });

  // Subtotal intermediário do grupo de locação.
  prepararLinhaTotal(
    layout.linhaSubtotalPrincipalFaturado,
    "Total Faturado",
    COR_SUBTOTAL
  );
  prepararLinhaTotal(
    layout.linhaSubtotalPrincipalRecebido,
    "Total Recebido",
    COR_SUBTOTAL
  );
  prepararLinhaTotal(
    layout.linhaPercentualPrincipal,
    "% Recebido/Faturado - Aluguel, Condomínio e FPP",
    COR_SUBTOTAL
  );

  // Total geral.
  prepararLinhaTotal(
    layout.linhaTotalGeralFaturado,
    "Total Faturado Geral",
    COR_TOTAL
  );
  prepararLinhaTotal(
    layout.linhaTotalGeralRecebido,
    "Total Recebido Geral",
    COR_TOTAL
  );
  prepararLinhaTotal(
    layout.linhaPercentualGeral,
    "% Recebido/Faturado Geral",
    COR_TOTAL
  );

  for (let mes = 0; mes < 12; mes += 1) {
    const coluna = colunaExcel(4 + mes);

    const faturadoEncargos = contasEncargos.reduce(
      (total, conta) =>
        total +
        somaValoresConta(dados, conta, "faturado", mes),
      0
    );

    const recebidoEncargos = contasEncargos.reduce(
      (total, conta) =>
        total +
        somaValoresConta(
          dados,
          conta,
          "recebidoCompetencia",
          mes
        ),
      0
    );

    const faturadoPrincipal = contasPrincipais.reduce(
      (total, conta) =>
        total +
        somaValoresConta(dados, conta, "faturado", mes),
      0
    );

    const recebidoPrincipal = contasPrincipais.reduce(
      (total, conta) =>
        total +
        somaValoresConta(
          dados,
          conta,
          "recebidoCompetencia",
          mes
        ),
      0
    );

    const cellSubtotalFaturado = sheet.getCell(
      layout.linhaSubtotalPrincipalFaturado,
      4 + mes
    );

    aplicarFormula(
      cellSubtotalFaturado,
      `SUM(${linhasFaturadoPrincipais
        .map((linha) => `${coluna}${linha}`)
        .join(",")})`,
      faturadoPrincipal,
      true
    );
    aplicarPreenchimento(
      cellSubtotalFaturado,
      COR_SUBTOTAL
    );

    const cellSubtotalRecebido = sheet.getCell(
      layout.linhaSubtotalPrincipalRecebido,
      4 + mes
    );

    aplicarFormula(
      cellSubtotalRecebido,
      `SUM(${linhasRecebidoPrincipais
        .map((linha) => `${coluna}${linha}`)
        .join(",")})`,
      recebidoPrincipal,
      true
    );
    aplicarPreenchimento(
      cellSubtotalRecebido,
      COR_SUBTOTAL
    );

    aplicarPercentual(
      sheet.getCell(
        layout.linhaPercentualPrincipal,
        4 + mes
      ),
      coluna,
      layout.linhaSubtotalPrincipalFaturado,
      layout.linhaSubtotalPrincipalRecebido,
      faturadoPrincipal,
      recebidoPrincipal,
      COR_SUBTOTAL
    );

    const totalFaturado =
      faturadoEncargos + faturadoPrincipal;
    const totalRecebido =
      recebidoEncargos + recebidoPrincipal;

    const cellTotalFaturado = sheet.getCell(
      layout.linhaTotalGeralFaturado,
      4 + mes
    );

    aplicarFormula(
      cellTotalFaturado,
      `SUM(${coluna}${layout.linhaSubtotalEncargosFaturado},` +
        `${coluna}${layout.linhaSubtotalPrincipalFaturado})`,
      totalFaturado,
      true
    );
    aplicarPreenchimento(
      cellTotalFaturado,
      COR_TOTAL
    );

    const cellTotalRecebido = sheet.getCell(
      layout.linhaTotalGeralRecebido,
      4 + mes
    );

    aplicarFormula(
      cellTotalRecebido,
      `SUM(${coluna}${layout.linhaSubtotalEncargosRecebido},` +
        `${coluna}${layout.linhaSubtotalPrincipalRecebido})`,
      totalRecebido,
      true
    );
    aplicarPreenchimento(
      cellTotalRecebido,
      COR_TOTAL
    );

    aplicarPercentual(
      sheet.getCell(
        layout.linhaPercentualGeral,
        4 + mes
      ),
      coluna,
      layout.linhaTotalGeralFaturado,
      layout.linhaTotalGeralRecebido,
      totalFaturado,
      totalRecebido,
      COR_TOTAL
    );
  }
}

function criarMapaValoresCaixa(config, dados) {
  const linhas = LINHAS_CAIXA[modeloLinhas(config)];
  const contas = obterContasCaixa(config);
  const valoresPorLinha = new Map();

  contas.forEach((conta) => {
    valoresPorLinha.set(
      linhas[conta.chaveLinha],
      criarVetorMensal().map((_, mes) => numero(dados[conta.chaveDados]?.caixa?.[mes]))
    );
  });

  valoresPorLinha.set(
    linhas.total,
    criarVetorMensal().map((_, mes) =>
      contas.reduce(
        (total, conta) => total + numero(dados[conta.chaveDados]?.caixa?.[mes]),
        0
      )
    )
  );

  return valoresPorLinha;
}

function montarBlocoCaixa(
  sheet,
  config,
  ano,
  dados,
  valoresPorLinha
) {
  const modelo = modeloLinhas(config);
  const linhas = LINHAS_CAIXA[modelo];
  const contas = obterContasCaixa(config);

  const linhaTitulo =
    linhas.taxaAdministracao - 2;

  const linhaCabecalho =
    linhas.taxaAdministracao - 1;

  /*
   * Título do bloco CAIXA.
   * O bloco termina na coluna O: Janeiro a Dezembro.
   */
  sheet.mergeCells(
    `B${linhaTitulo}:O${linhaTitulo}`
  );

  sheet.getCell(`B${linhaTitulo}`).value =
    `${config.nomeAba.toUpperCase()} - ` +
    `${ano} - CAIXA`;

  estilizarTitulo(
    sheet.getCell(`B${linhaTitulo}`)
  );

  sheet.getRow(linhaTitulo).height = 24;

  /*
   * Cabeçalho.
   */
  sheet.getCell(`B${linhaCabecalho}`).value =
    "Conta";

  sheet.getCell(`C${linhaCabecalho}`).value =
    "Tipo de valor";

  estilizarCabecalho(
    sheet.getCell(`B${linhaCabecalho}`),
    12
  );

  estilizarCabecalho(
    sheet.getCell(`C${linhaCabecalho}`),
    12
  );

  /*
   * Meses do CAIXA: somente Janeiro a Dezembro.
   */
  MESES.forEach((mes, index) => {
    const cell = sheet.getCell(
      linhaCabecalho,
      4 + index
    );

    cell.value = mes;

    estilizarCabecalho(
      cell,
      10,
      COR_CINZA_CAIXA
    );
  });

  /*
   * Contas do CAIXA.
   */
  contas.forEach((conta) => {
    const linha = linhas[conta.chaveLinha];

    sheet.getCell(`B${linha}`).value =
      conta.rotulo;

    sheet.getCell(`C${linha}`).value =
      "Recebimento do Mês";

    estilizarRotulo(
      sheet.getCell(`B${linha}`)
    );

    estilizarRotulo(
      sheet.getCell(`C${linha}`)
    );

    const valores =
      valoresPorLinha.get(linha) ||
      criarVetorMensal();

    for (let mes = 0; mes < 12; mes += 1) {
      aplicarValor(
        sheet.getCell(linha, 4 + mes),
        valores[mes]
      );
    }

    /*
     * Somente o contorno externo da linha.
     */
    aplicarContornoBloco(
      sheet,
      linha,
      linha,
      2,
      15
    );
  });

  /*
   * Linha TOTAL.
   */
  sheet.getCell(`B${linhas.total}`).value =
    "TOTAL";

  sheet.getCell(`C${linhas.total}`).value =
    "Recebimento do Mês";

  estilizarRotulo(
    sheet.getCell(`B${linhas.total}`),
    true
  );

  estilizarRotulo(
    sheet.getCell(`C${linhas.total}`),
    true
  );

  /*
   * Fórmulas do TOTAL: Janeiro a Dezembro.
   */
  for (let mes = 0; mes < 12; mes += 1) {
    const coluna = colunaExcel(4 + mes);

    const referencias = contas
      .map(
        (conta) =>
          `${coluna}${linhas[conta.chaveLinha]}`
      )
      .join(",");

    const total = numero(
      valoresPorLinha.get(linhas.total)?.[mes]
    );

    const cell = sheet.getCell(
      linhas.total,
      4 + mes
    );

    aplicarFormula(
      cell,
      `SUM(${referencias})`,
      total,
      true
    );
  }

  /*
   * Formatação cinza do TOTAL,
   * somente com bordas superior e inferior.
   */
  for (let coluna = 2; coluna <= 15; coluna += 1) {
    const cell = sheet.getCell(
      linhas.total,
      coluna
    );

    aplicarFonte(
      cell,
      11,
      true,
      "000000"
    );

    aplicarPreenchimento(
      cell,
      COR_TOTAL
    );

    aplicarBordasHorizontais(cell);
  }
}

function montarAbaFonte(workbook, config, ano, dados) {
  const nomeAba = `${config.nomeAba} ${ano}`;
  const sheet = workbook.addWorksheet(nomeAba, {
    properties: { tabColor: { argb: COR_CINZA_CLARO } },
  });
  const valoresPorLinha = criarMapaValoresCaixa(config, dados);

  sheet.views = [{ showGridLines: false, state: "frozen", ySplit: 5 }];
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  sheet.getColumn("A").width = 3;
  sheet.getColumn("B").width = 29;
  sheet.getColumn("C").width = 21;

  for (let coluna = 4; coluna <= 15; coluna += 1) {
    sheet.getColumn(coluna).width = 15.89;
  }

  montarBlocoCompetencia(sheet, config, ano, dados);
  montarBlocoCaixa(sheet, config, ano, dados, valoresPorLinha);

  return {
    nomeAba,
    config,
    ano,
    dados,
    valoresPorLinha,
  };
}

function somarResultadosFonte(fonte, linhas, mes) {
  return linhas.reduce(
    (total, linha) => total + numero(fonte.valoresPorLinha.get(linha)?.[mes]),
    0
  );
}

function preencherColunaResumo(
  sheet,
  fonte,
  linhaBloco,
  colunaResumo,
  mes
) {
  const modelo = modeloLinhas(fonte.config);
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
    const resultado = somarResultadosFonte(
      fonte,
      linhas,
      mes
    );

    const cellRotulo = sheet.getCell(linha, 2);
    const cellValor = sheet.getCell(
      linha,
      colunaResumo
    );

    cellRotulo.value = rotulo;
    estilizarRotulo(cellRotulo);
    estilizarCelulaResumo(cellRotulo);

    aplicarFormula(
      cellValor,
      formulaSomaFonte(
        nomeAba,
        colunaFonte,
        linhas
      ),
      resultado
    );

    estilizarValorResumo(cellValor);
  });

  const linhaTotal = linhaBloco + 6;
  const linhaValidacao = linhaBloco + 7;
  const letraResumo = colunaExcel(colunaResumo);

  const resultadoTotal = categorias.reduce(
    (total, [, linhas]) =>
      total +
      somarResultadosFonte(fonte, linhas, mes),
    0
  );

  const resultadoFonte = somarResultadosFonte(
    fonte,
    [mapa.total],
    mes
  );

  const validacao =
    Math.abs(resultadoTotal - resultadoFonte) <= 0.01;

  /*
   * Linha de total.
   */
  const cellRotuloTotal = sheet.getCell(
    linhaTotal,
    2
  );

  const cellValorTotal = sheet.getCell(
    linhaTotal,
    colunaResumo
  );

  cellRotuloTotal.value = "Total";
  estilizarRotulo(cellRotuloTotal, true);

  estilizarCelulaResumo(
    cellRotuloTotal,
    true,
    COR_TOTAL
  );

  aplicarFormula(
    cellValorTotal,
    `SUM(${letraResumo}${linhaBloco + 1}:` +
      `${letraResumo}${linhaBloco + 5})`,
    resultadoTotal,
    true
  );

estilizarValorResumo(
  cellValorTotal,
  true,
  COR_TOTAL
);

  /*
   * Linha de validação.
   */
  const cellRotuloValidacao = sheet.getCell(
    linhaValidacao,
    2
  );

  const cellValorValidacao = sheet.getCell(
    linhaValidacao,
    colunaResumo
  );

  cellRotuloValidacao.value = "Validação";
  estilizarRotulo(cellRotuloValidacao, true);

  cellValorValidacao.value = {
    formula:
      `${letraResumo}${linhaTotal}=` +
      referenciaFonte(
        nomeAba,
        colunaFonte,
        mapa.total
      ),
    result: validacao,
  };

  estilizarCelulaResumo(
    cellRotuloValidacao,
    true,
    COR_VALIDACAO
  );

  estilizarCelulaResumo(
    cellValorValidacao,
    false,
    COR_VALIDACAO
  );

  cellValorValidacao.alignment = {
    horizontal: "center",
    vertical: "middle",
  };
}

function montarResumo(sheet, fontes, anos) {
  sheet.views = [
    {
      showGridLines: false,
      state: "frozen",
      xSplit: 2,
      ySplit: 1,
    },
  ];

  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  sheet.getColumn("A").width = 3;
  sheet.getColumn("B").width = 22;

  const empreendimentos = [
    ...new Map(
      fontes.map((fonte) => [
        fonte.config.nomeAba,
        fonte.config,
      ])
    ).values(),
  ].sort(
    (a, b) =>
      Number(a.ordemResumo || 999) -
      Number(b.ordemResumo || 999)
  );

  let linhaBloco = 2;

  empreendimentos.forEach((config) => {
    const cellTitulo = sheet.getCell(
      linhaBloco,
      2
    );

    cellTitulo.value = config.tituloResumo;

    estilizarTitulo(
      cellTitulo,
      11
    );

    aplicarBordasHorizontais(cellTitulo);

    anos.forEach((ano, indiceAno) => {
      for (let mes = 0; mes < 12; mes += 1) {
        const colunaResumo =
          3 + indiceAno * 12 + mes;

        const fonte = fontes.find(
          (item) =>
            item.config.nomeAba ===
              config.nomeAba &&
            String(item.ano) === String(ano)
        );

        const cabecalho = sheet.getCell(
          linhaBloco,
          colunaResumo
        );

        cabecalho.value = new Date(
          Number(ano),
          mes,
          1
        );

        cabecalho.numFmt = "mmm/yy";

        estilizarCabecalho(
          cabecalho,
          11,
          COR_CINZA_CLARO
        );

        sheet.getColumn(
          colunaResumo
        ).width = 15.89;

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
}

function validarEscopoShopping(shoppingIds, shoppingIdsPermitidos) {
  if (!Array.isArray(shoppingIdsPermitidos)) return;

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

function validarParametros(query, shoppingIdsPermitidos) {
  const shoppingIds = splitParam(query.shopping);
  const anos = splitParam(query.anos).sort(
    (a, b) => Number(a) - Number(b)
  );

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

  const anosInvalidos = anos.filter(
    (ano) => !/^\d{4}$/.test(ano) || Number(ano) < 2000 || Number(ano) > 2100
  );

  if (anosInvalidos.length) {
    const error = new Error("Um ou mais anos selecionados são inválidos.");
    error.statusCode = 400;
    throw error;
  }

  validarEscopoShopping(shoppingIds, shoppingIdsPermitidos);

  const invalidos = shoppingIds.filter(
    (id) => !SHOPPINGS_DETALHADO[id]
  );

  if (invalidos.length) {
    const error = new Error(
      "O relatório detalhado está disponível somente para Só Marcas Contagem, Só Marcas Guarulhos, BH Outlet e Shopping do Avião."
    );
    error.statusCode = 400;
    throw error;
  }

  return { shoppingIds, anos };
}

function emitirProgresso(onProgress, etapa, detalhes = {}) {
  if (typeof onProgress !== "function") return;

  try {
    onProgress(etapa, detalhes);
  } catch (error) {
    console.error(
      "Erro ao registrar progresso do relatório detalhado:",
      error
    );
  }
}

async function gerarWorkbookDetalhado(
  pool,
  query,
  shoppingIdsPermitidos = null,
  onProgress = null
) {
  const { shoppingIds, anos } = validarParametros(
    query,
    shoppingIdsPermitidos
  );
  emitirProgresso(onProgress, "PARAMETROS_VALIDADOS", {
    shoppingIds,
    anos,
  });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Portal GMV";
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;

  const resumo = workbook.addWorksheet("Resumo", {
    properties: { tabColor: { argb: COR_CINZA_CLARO } },
  });
  const fontes = [];

  for (const shoppingId of shoppingIds) {
    const config = SHOPPINGS_DETALHADO[shoppingId];

    for (const ano of anos) {
      emitirProgresso(onProgress, "BUSCANDO_LANCAMENTOS", {
        shoppingId,
        shopping: config.nomeAba,
        ano,
      });
      const lancamentos = await buscarLancamentosDetalhados(
        pool,
        shoppingId,
        ano
      );
      emitirProgresso(onProgress, "LANCAMENTOS_CARREGADOS", {
        shoppingId,
        shopping: config.nomeAba,
        ano,
        quantidade: lancamentos.length,
      });
      const dados = agruparLancamentos(lancamentos, ano);
      fontes.push(montarAbaFonte(workbook, config, ano, dados));
      emitirProgresso(onProgress, "ABA_MONTADA", {
        shoppingId,
        shopping: config.nomeAba,
        ano,
        abas: workbook.worksheets.length,
      });
    }
  }

  emitirProgresso(onProgress, "MONTANDO_RESUMO", {
    fontes: fontes.length,
    anos,
  });
  montarResumo(resumo, fontes, anos);
  workbook.views = [{ activeTab: 0 }];
  emitirProgresso(onProgress, "WORKBOOK_CONCLUIDO", {
    abas: workbook.worksheets.length,
  });

  return workbook;
}

module.exports = {
  gerarWorkbookDetalhado,
  SHOPPINGS_DETALHADO,
};
