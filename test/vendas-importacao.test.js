const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");
const {
  interpretarData,
  interpretarNumero,
  lerArquivoVendas,
  normalizarXlsxParaExcelJS,
  validarLinhasVendas,
} = require("../src/services/vendas-importacao.service");
const {
  construirConsultaBase,
  dataBrasileira,
  resolverShoppingsConsulta,
} = require("../src/services/vendas-relatorio.service");
const {
  SHOPPINGS_VENDAS,
  resolverShoppingVendas,
} = require("../src/utils/vendas-shoppings");

const oficial = new Map([
  [
    "12345",
    {
      contrato: "12345",
      multiplosShoppings: false,
      shoppingId: "31",
      shoppingNome: "BH Outlet",
      lojaSistema: "Loja Oficial",
      lucs: [
        { luc: "LUC-01", abl: 50, tipoUnidade: "L" },
        { luc: "LUC-02", abl: 25, tipoUnidade: "L" },
      ],
      ablTotal: 75,
    },
  ],
]);

function linha({
  numeroLinha = 2,
  periodo = "01/01/2026",
  data = "",
  shopping = "31",
  contrato = "12345",
  loja = "Loja Oficial",
  abl = 50,
  canal = "LOJA_FISICA",
  vendas = 100,
} = {}) {
  const valoresOriginais = [
    periodo,
    data,
    shopping,
    contrato,
    loja,
    abl,
    canal,
    vendas,
  ];

  return {
    numeroLinha,
    periodoInformado: String(periodo ?? ""),
    dataInformada: String(data ?? ""),
    shoppingInformado: String(shopping ?? ""),
    contratoInformado: String(contrato ?? ""),
    lucInformada: "",
    lojaInformada: String(loja ?? ""),
    ablInformadaTexto: String(abl ?? ""),
    canalInformado: String(canal ?? ""),
    vendasInformadasTexto: String(vendas ?? ""),
    valoresOriginais,
    camposComFormula: [],
  };
}

test("interpreta datas brasileiras, ISO e serial Excel", () => {
  assert.equal(interpretarData("18/01/2026"), "2026-01-18");
  assert.equal(interpretarData("2026-01-18"), "2026-01-18");
  assert.equal(interpretarData(46023), "2026-01-01");
  assert.equal(interpretarData("31/02/2026"), null);
  assert.equal(
    interpretarData(new Date(Date.UTC(2026, 5, 1))),
    "2026-06-01"
  );
});

test("interpreta valores monetarios brasileiros e zero", () => {
  assert.equal(interpretarNumero("R$ 1.234,56"), 1234.56);
  assert.equal(interpretarNumero(0), 0);
  assert.equal(interpretarNumero("invalido"), null);
});

test("le o cabecalho oficial e preserva os valores do Excel", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Importação");
  sheet.addRow([
    "PERIODO",
    "DATA",
    "SHOPPING",
    "CONTRATO",
    "LOJA",
    "ABL",
    "CANAL",
    "VENDAS",
  ]);
  sheet.addRow([
    new Date(Date.UTC(2026, 5, 1)),
    null,
    "BH OUTLET",
    "12345",
    "Loja Oficial",
    50,
    "LOJA_FISICA",
    100,
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  const linhas = await lerArquivoVendas(Buffer.from(buffer));

  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].numeroLinha, 2);
  assert.equal(linhas[0].contratoInformado, "12345");
  assert.equal(linhas[0].periodoInformado, "01/06/2026");
  assert.equal(linhas[0].camposComFormula.length, 0);
});

test("recusa cabecalho alterado", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Importação");
  sheet.addRow([
    "PERIODO",
    "DATA",
    "SHOPPING",
    "CONTRATO ALTERADO",
    "LOJA",
    "ABL",
    "CANAL",
    "VENDAS",
  ]);
  sheet.addRow(["01/01/2026", null, "BH OUTLET", "12345", "Loja", 50, "ONLINE", 10]);

  const buffer = await workbook.xlsx.writeBuffer();

  await assert.rejects(
    () => lerArquivoVendas(Buffer.from(buffer)),
    (error) => error.code === "CABECALHO_INVALIDO"
  );
});

test("modelo oficial possui oito colunas e lista padronizada", async () => {
  const caminho = path.join(
    __dirname,
    "..",
    "src",
    "assets",
    "modelos",
    "modelo-importacao-vendas-v1.xlsx"
  );
  const workbook = new ExcelJS.Workbook();
  const arquivoModelo = fs.readFileSync(caminho);
  await workbook.xlsx.load(
    await normalizarXlsxParaExcelJS(arquivoModelo)
  );
  const sheet = workbook.getWorksheet("Importação");
  const listas = workbook.getWorksheet("Listas");

  assert.deepEqual(
    Array.from({ length: 8 }, (_, indice) =>
      sheet.getCell(1, indice + 1).value
    ),
    [
      "PERIODO",
      "DATA",
      "SHOPPING",
      "CONTRATO",
      "LOJA",
      "ABL",
      "CANAL",
      "VENDAS",
    ]
  );
  assert.equal(sheet.getCell("I1").value, null);
  assert.deepEqual(
    Array.from({ length: 6 }, (_, indice) =>
      listas.getCell(indice + 2, 4).value
    ),
    SHOPPINGS_VENDAS.map(({ nome }) => nome)
  );

  sheet.getRow(2).values = [
    new Date(Date.UTC(2026, 5, 1)),
    null,
    "BH OUTLET",
    "12345",
    null,
    75,
    "ONLINE",
    100,
  ];
  const buffer = await workbook.xlsx.writeBuffer();
  const linhas = await lerArquivoVendas(Buffer.from(buffer));
  const resultado = validarLinhasVendas(linhas, oficial, ["31"]);

  assert.equal(linhas[0].periodoInformado, "01/06/2026");
  assert.equal(resultado.totalErros, 0);
  assert.equal(resultado.totalDivergencias, 0);
});

test("aceita importacao mensal valida", () => {
  const resultado = validarLinhasVendas(
    [linha()],
    oficial,
    ["31"]
  );

  assert.equal(resultado.totalErros, 0);
  assert.equal(resultado.status, "AGUARDANDO_CONFIRMACAO");
  assert.equal(resultado.linhas[0].granularidade, "MENSAL");
});

test("loja ausente nao gera divergencia", () => {
  const resultado = validarLinhasVendas(
    [linha({ loja: "", abl: 75 })],
    oficial,
    ["31"]
  );

  assert.equal(resultado.totalErros, 0);
  assert.equal(
    resultado.ocorrencias.some(
      (item) => item.codigo === "LOJA_NAO_INFORMADA"
    ),
    false
  );
});

test("aceita nomes padronizados e aliases de shopping", () => {
  assert.equal(resolverShoppingVendas("OIAPOQUE BH").id, "1");
  assert.equal(
    resolverShoppingVendas("SHOPPING OIAPOQUE CENTRO").id,
    "1"
  );
  assert.deepEqual(
    SHOPPINGS_VENDAS.map(({ id, nome }) => ({ id, nome })),
    [
      { id: "31", nome: "BH OUTLET" },
      { id: "1", nome: "OIAPOQUE BH" },
      { id: "13", nome: "OIAPOQUE CONTAGEM" },
      { id: "3", nome: "SÓ MARCAS CONTAGEM" },
      { id: "17", nome: "SÓ MARCAS GUARULHOS" },
      { id: "8", nome: "SHOPPING DO AVIÃO" },
    ]
  );
});

test("aceita todos os dias e venda zero", () => {
  const linhas = Array.from({ length: 31 }, (_, indice) =>
    linha({
      numeroLinha: indice + 2,
      data: `${String(indice + 1).padStart(2, "0")}/01/2026`,
      vendas: indice === 5 ? 0 : 10,
    })
  );

  const resultado = validarLinhasVendas(linhas, oficial, ["31"]);

  assert.equal(resultado.totalErros, 0);
  assert.equal(resultado.linhas[5].vendas, 0);
});

test("bloqueia carga diaria com dias ausentes", () => {
  const resultado = validarLinhasVendas(
    [linha({ data: "01/01/2026" })],
    oficial,
    ["31"]
  );

  assert.ok(
    resultado.ocorrencias.some(
      (item) => item.codigo === "DIAS_AUSENTES"
    )
  );
  assert.equal(resultado.status, "COM_ERROS");
});

test("permite online mensal com loja fisica diaria", () => {
  const fisicas = Array.from({ length: 31 }, (_, indice) =>
    linha({
      numeroLinha: indice + 2,
      data: `${String(indice + 1).padStart(2, "0")}/01/2026`,
      vendas: 10,
    })
  );
  const online = linha({
    numeroLinha: 40,
    canal: "ONLINE",
    vendas: 200,
  });

  const resultado = validarLinhasVendas(
    [...fisicas, online],
    oficial,
    ["31"]
  );

  assert.equal(resultado.totalErros, 0);
});

test("bloqueia consolidado junto com canal componente", () => {
  const resultado = validarLinhasVendas(
    [
      linha({ canal: "CONSOLIDADO" }),
      linha({ numeroLinha: 3, canal: "ONLINE" }),
    ],
    oficial,
    ["31"]
  );

  assert.ok(
    resultado.ocorrencias.some(
      (item) => item.codigo === "CONSOLIDADO_COM_COMPONENTES"
    )
  );
});

test("rejeita carga inteira por shopping informado nao autorizado", () => {
  const resultado = validarLinhasVendas(
    [linha({ shopping: "99" })],
    oficial,
    ["31"]
  );

  assert.equal(resultado.encontrouShoppingNaoAutorizado, true);
  assert.equal(resultado.status, "REJEITADA");
});

test("shopping divergente autorizado e uma divergencia nao bloqueante", () => {
  const resultado = validarLinhasVendas(
    [linha({ shopping: "OIAPOQUE CONTAGEM" })],
    oficial,
    ["31", "13"]
  );

  assert.equal(resultado.totalErros, 0);
  assert.ok(
    resultado.ocorrencias.some(
      (item) => item.codigo === "SHOPPING_DIVERGENTE"
    )
  );
});

test("relatorio rejeita shopping solicitado fora do escopo", () => {
  assert.throws(
    () =>
      resolverShoppingsConsulta("31,99", {
        acessoTotal: false,
        shoppingIds: ["31", "32"],
      }),
    (error) => error.status === 403
  );
});

test("relatorio restrito sem vinculos permanece sem shoppings", () => {
  assert.deepEqual(
    resolverShoppingsConsulta(undefined, {
      acessoTotal: false,
      shoppingIds: [],
    }),
    []
  );
});

test("relatorio bloqueia data inicial maior que a final", () => {
  assert.throws(
    () => construirConsultaBase(
      {
        dataInicial: "2026-06-02",
        dataFinal: "2026-06-01",
      },
      { acessoTotal: true, shoppingIds: [] }
    ),
    (error) => error.code === "INTERVALO_DATA_INVALIDO"
  );
});

test("exportacao formata periodo recebido como Date ou texto", () => {
  assert.equal(
    dataBrasileira(new Date(Date.UTC(2026, 5, 1))),
    "01/06/2026"
  );
  assert.equal(dataBrasileira("2026-06-01"), "01/06/2026");
  assert.equal(
    dataBrasileira("Mon Jun 01 2026 00:00:00 GMT+0000"),
    "01/06/2026"
  );
});

test("filtro de loja usa nome cadastrado quando snapshot possui numero", () => {
  const consulta = construirConsultaBase(
    { loja: "BOSS" },
    { acessoTotal: true, shoppingIds: [] }
  );

  assert.match(consulta.sql, /loja_fallback\.nome_fantasia/);
  assert.deepEqual(consulta.parametros, ["%BOSS%"]);
});
