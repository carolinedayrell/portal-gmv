const filtros = {
  shopping: { filtroId: "shoppingFiltro", buscaId: "shoppingBusca", param: "shopping" },
  tipo: { filtroId: "tipoFiltro", buscaId: "tipoBusca", param: "tipo" },
  tipoLoja: { filtroId: "tipoLojaFiltro", buscaId: "tipoLojaBusca", param: "tipoLoja" },
  ano: { filtroId: "anoFiltro", buscaId: "anoBusca", param: "ano" },
};

function debounce(fn, delay = 400) {
  let timer;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function nomeAbaExcel(value, fallback = "Relatorio") {
  const nome = String(value || fallback)
    .replace(/[\\/?*[\]:]/g, "-")
    .trim()
    .slice(0, 31);

  return nome || fallback;
}

function cellTexto(value, styleId = null, extra = "") {
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  return `<Cell${style}${extra}><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function cellNumero(value, styleId = "numero", extra = "") {
  const style = styleId ? ` ss:StyleID="${styleId}"` : "";
  const numero = Number(value || 0).toFixed(2);
  return `<Cell${style}${extra}><Data ss:Type="Number">${numero}</Data></Cell>`;
}

function cellPercentual(value, styleId = "percentual") {
  const numero = Number(value || 0);
  return `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${numero}</Data></Cell>`;
}

function percentual(recebido, faturado) {
  return Number(faturado || 0) ? Number(recebido || 0) / Number(faturado) : 0;
}

function linhaComMargem(cells = "") {
  return `<Row><Cell/>${cells}</Row>`;
}

function formatarDataBr(date = new Date()) {
  return date.toLocaleDateString("pt-BR");
}

function getSelectedValues(filtroId) {
  return Array.from(
    document.querySelectorAll(`#${filtroId} input[type="checkbox"]:checked`)
  ).map((input) => input.value);
}

function preencherFiltro(filtroId, itens, selecionadosExtras = []) {
  const container = document.getElementById(filtroId);
  const selecionadosAtuais = getSelectedValues(filtroId);
  const selecionados = [...new Set([...selecionadosAtuais, ...selecionadosExtras])];

  container.innerHTML = "";

  if (!itens.length) {
    container.innerHTML = `<p class="filter-empty">Nenhuma opção encontrada.</p>`;
    return;
  }

  itens.forEach((item) => {
    const value = String(item.id);
    const label = String(item.nome);
    const checked = selecionados.includes(value) ? "checked" : "";

    container.insertAdjacentHTML(
      "beforeend",
      `
        <label class="filter-option">
          <input type="checkbox" value="${escapeXml(value)}" ${checked} />
          <span>${escapeXml(label)}</span>
        </label>
      `
    );
  });

  const campo = Object.keys(filtros).find((key) => filtros[key].filtroId === filtroId);
  if (campo) atualizarTextoBotaoFiltro(campo);
}

function atualizarTextoBotaoFiltro(campo) {
  const config = filtros[campo];
  const container = document.getElementById(config.filtroId);
  const button = container.closest(".filter-dropdown").querySelector(".filter-button");
  const opcoes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
  const selecionadas = opcoes.filter((input) => input.checked);

  const labelsPadrao = {
    shopping: "Shopping",
    tipo: "Tipo",
    tipoLoja: "Tipo Loja",
    ano: "Ano",
  };

  if (!selecionadas.length) {
    button.textContent = labelsPadrao[campo];
    return;
  }

  if (selecionadas.length === opcoes.length) {
    button.textContent = "Todos";
    return;
  }

  const primeiroNome = selecionadas[0].closest("label").querySelector("span").textContent;
  button.textContent = selecionadas.length === 1 ? primeiroNome : `${primeiroNome} e outros`;
}

function montarParams() {
  const params = new URLSearchParams();

  const shopping = getSelectedValues("shoppingFiltro");
  const tipo = getSelectedValues("tipoFiltro");
  const tipoLoja = getSelectedValues("tipoLojaFiltro");
  const anos = getSelectedValues("anoFiltro");

  if (shopping.length) params.set("shopping", shopping.join(","));
  if (tipo.length) params.set("tipo", tipo.join(","));
  if (tipoLoja.length) params.set("tipoLoja", tipoLoja.join(","));

  return { params, anos };
}

function baixarArquivoExcelXml(nomeArquivo, xml) {
const blob = new Blob(["\ufeff", xml], {
  type: "application/vnd.ms-excel;charset=utf-8",
});

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = nomeArquivo;
  link.click();

  URL.revokeObjectURL(url);
}

async function carregarFiltrosIniciais() {
  const response = await apiRequest("/faturamento/filtros");

  preencherFiltro("shoppingFiltro", response.shoppings);
  preencherFiltro("tipoFiltro", response.tipos);
  preencherFiltro("tipoLojaFiltro", response.tiposLoja);

  const anos = [...new Set(
    response.competencias
      .map((item) => String(item.id).split("/")[1])
      .filter(Boolean)
  )]
    .sort((a, b) => Number(b) - Number(a))
    .map((ano) => ({ id: ano, nome: ano }));

  preencherFiltro("anoFiltro", anos);
}

async function carregarOpcoes(campo) {
  if (campo === "ano") return;

  const config = filtros[campo];
  const busca = document.getElementById(config.buscaId).value.trim();
  const params = new URLSearchParams();

  if (busca) params.set("busca", busca);

  const opcoes = await apiRequest(`/faturamento/opcoes/${campo}?${params.toString()}`);
  preencherFiltro(config.filtroId, opcoes);
}

async function buscarDadosFaturadoRecebido(ano) {
  return {
    titulo: `OIAPOQUE BH - ${ano}`,
    atualizadoAte: formatarDataBr(new Date()),
    mesAnalise: "jun/26",

    recebimentoMesAtual: [
      {
        categoria: "ALUGUEL",
        mesMapa: "06/2026",
        faturado: 3132706.54,
        recebido: 2273169.69,
      },
      {
        categoria: "CONDOMÍNIO",
        mesMapa: "05/2026",
        faturado: 1641705.27,
        recebido: 1352359.43,
      },
      {
        categoria: "CDU",
        mesMapa: "06/2026",
        faturado: 933338.59,
        recebido: 172719.06,
      },
    ],

    acumuladoAno: [
      {
        categoria: "ALUGUEL",
        faturado: 18091694.01,
        recebido: 16023107.50,
      },
      {
        categoria: "CONDOMÍNIO",
        faturado: 8367242.91,
        recebido: 7662815.29,
      },
      {
        categoria: "TOTAL A-C",
        faturado: 26458936.92,
        recebido: 23685922.79,
      },
      {
        categoria: "CDU",
        faturado: 4689006.05,
        recebido: 3263426.54,
      },
      {
        categoria: "TOTAL - GERAL",
        faturado: 31147942.97,
        recebido: 26949349.33,
      },
    ],
  };
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

function estilizarFaixa(sheet, range, options = {}) {
  sheet.getCell(range).style = {
    ...sheet.getCell(range).style,
  };

  const cell = sheet.getCell(range);

  aplicarFonte(cell, options.size || 10, options.bold || false);

  cell.alignment = {
    horizontal: options.horizontal || "center",
    vertical: "middle",
    wrapText: options.wrapText || false,
  };

  if (options.fill) aplicarPreenchimento(cell, options.fill);
  if (options.border !== false) aplicarBorda(cell);
}

function valorContabil(cell, value) {
  cell.value = Number(value || 0);
  cell.numFmt = FORMATO_CONTABIL;
  aplicarFonte(cell, 11, false);
  cell.alignment = { horizontal: "right", vertical: "middle" };
}

function valorResumo(cell, value) {
  cell.value = Number(value || 0);
  cell.numFmt = "#,##0.00";
  aplicarFonte(cell, 11, false);
  cell.alignment = { horizontal: "right", vertical: "middle" };
}

function formulaPercentual(cell, formula) {
  cell.value = { formula };
  cell.numFmt = "0.0%";
  aplicarFonte(cell, 11, false);
  cell.alignment = { horizontal: "right", vertical: "middle" };
}

function formulaContabil(cell, formula) {
  cell.value = { formula };
  cell.numFmt = FORMATO_CONTABIL;
  aplicarFonte(cell, 11, false);
  cell.alignment = { horizontal: "right", vertical: "middle" };
}

function montarAbaFaturadoRecebido(dados) {
  const aluguel = dados.acumuladoAno.find((item) => item.categoria === "ALUGUEL");
  const condominio = dados.acumuladoAno.find((item) => item.categoria === "CONDOMÍNIO");
  const totalAC = dados.acumuladoAno.find((item) => item.categoria === "TOTAL A-C");
  const cdu = dados.acumuladoAno.find((item) => item.categoria === "CDU");
  const totalGeral = dados.acumuladoAno.find((item) => item.categoria === "TOTAL - GERAL");

  const mesAtualAluguel = dados.recebimentoMesAtual[0] || {};
  const mesAtualCondominio = dados.recebimentoMesAtual[1] || {};
  const mesAtualCdu = dados.recebimentoMesAtual[2] || {};

  const anoCurto = String(dados.ano || "").slice(-2);

  return `
    <Worksheet ss:Name="${escapeXml(nomeAbaExcel(dados.ano))}">
      <Table>
        <Column ss:Width="24"/>
        <Column ss:Width="120"/>
        <Column ss:Width="120"/>
        <Column ss:Width="120"/>
        <Column ss:Width="80"/>
        <Column ss:Width="40"/>
        <Column ss:Width="120"/>
        <Column ss:Width="120"/>
        <Column ss:Width="40"/>
        <Column ss:Width="120"/>
        <Column ss:Width="120"/>
        <Column ss:Width="120"/>
        <Column ss:Width="80"/>

        <Row></Row>

        <Row>
          ${cellTexto(dados.titulo, "titulo", ' ss:Index="2" ss:MergeAcross="10"')}
        </Row>

        <Row></Row>

        <Row>
          ${cellTexto("RECEBIMENTO - MÊS ATUAL", "cabecalho", ' ss:Index="2" ss:MergeAcross="3"')}
          ${cellTexto(`JANEIRO/${anoCurto} A DEZEMBRO/${anoCurto}`, "cabecalho", ' ss:Index="10" ss:MergeAcross="3"')}
        </Row>

        <Row>
          ${cellTexto(dados.mesAnalise, "centroComBorda", ' ss:Index="2" ss:MergeAcross="3"')}
          ${cellTexto("FATURADO", "cabecalho", ' ss:Index="11"')}
          ${cellTexto("RECEBIDO", "cabecalho")}
          ${cellTexto("%", "cabecalho")}
        </Row>

        <Row>
          ${cellTexto("FATURADO EM R$", "cabecalho", ' ss:Index="3"')}
          ${cellTexto("RECEBIDO EM R$", "cabecalho")}
          ${cellTexto("% RECEBIDO", "cabecalho")}
          ${cellTexto("ATUALIZADO ATÉ", "atualizadoTitulo", ' ss:Index="7" ss:MergeAcross="1"')}
          ${cellTexto("ALUGUEL", "rotulo", ' ss:Index="10"')}
          ${cellNumero(aluguel?.faturado)}
          ${cellNumero(aluguel?.recebido)}
          ${cellPercentual(percentual(aluguel?.recebido, aluguel?.faturado))}
        </Row>

        <Row>
          ${cellTexto("ALUGUEL", "rotulo", ' ss:Index="2"')}
          ${cellNumero(mesAtualAluguel.faturado)}
          ${cellNumero(mesAtualAluguel.recebido)}
          ${cellPercentual(percentual(mesAtualAluguel.recebido, mesAtualAluguel.faturado))}
          ${cellTexto(dados.atualizadoAte, "atualizadoData", ' ss:Index="7" ss:MergeAcross="1"')}
          ${cellTexto("CONDOMÍNIO", "rotulo", ' ss:Index="10"')}
          ${cellNumero(condominio?.faturado)}
          ${cellNumero(condominio?.recebido)}
          ${cellPercentual(percentual(condominio?.recebido, condominio?.faturado))}
        </Row>

        <Row>
          ${cellTexto("CONDOMÍNIO", "rotulo", ' ss:Index="2"')}
          ${cellNumero(mesAtualCondominio.faturado)}
          ${cellNumero(mesAtualCondominio.recebido)}
          ${cellPercentual(percentual(mesAtualCondominio.recebido, mesAtualCondominio.faturado))}
          ${cellTexto("TOTAL A-C", "rotuloEscuro", ' ss:Index="10"')}
          ${cellNumero(totalAC?.faturado, "numeroEscuro")}
          ${cellNumero(totalAC?.recebido, "numeroEscuro")}
          ${cellPercentual(percentual(totalAC?.recebido, totalAC?.faturado), "percentualEscuro")}
        </Row>

        <Row>
          ${cellTexto("CDU", "rotulo", ' ss:Index="2"')}
          ${cellNumero(mesAtualCdu.faturado)}
          ${cellNumero(mesAtualCdu.recebido)}
          ${cellPercentual(percentual(mesAtualCdu.recebido, mesAtualCdu.faturado))}
        </Row>

        <Row></Row>

        <Row>
          ${cellTexto("CDU", "rotulo", ' ss:Index="10"')}
          ${cellNumero(cdu?.faturado)}
          ${cellNumero(cdu?.recebido)}
          ${cellPercentual(percentual(cdu?.recebido, cdu?.faturado))}
        </Row>

        <Row>
          ${cellTexto("TOTAL - GERAL", "rotuloEscuro", ' ss:Index="10"')}
          ${cellNumero(totalGeral?.faturado, "numeroEscuro")}
          ${cellNumero(totalGeral?.recebido, "numeroEscuro")}
          ${cellPercentual(percentual(totalGeral?.recebido, totalGeral?.faturado), "percentualEscuro")}
        </Row>
      </Table>
    </Worksheet>
  `;
}

function montarWorkbookExcel(abas) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">

  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Author>Portal GMV</Author>
  </DocumentProperties>

  <ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel">
    <ProtectStructure>False</ProtectStructure>
    <ProtectWindows>False</ProtectWindows>
  </ExcelWorkbook>

  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Arial" ss:Size="10"/>
    </Style>

    <Style ss:ID="numero">
      <NumberFormat ss:Format="#,##0.00"/>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    </Style>

    <Style ss:ID="percentual">
      <NumberFormat ss:Format="0.0%"/>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    </Style>

    <Style ss:ID="titulo">
      <Font ss:FontName="Arial" ss:Bold="1" ss:Size="14"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Interior ss:Color="#8FAADC" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>

    <Style ss:ID="cabecalho">
      <Font ss:FontName="Arial" ss:Bold="1" ss:Size="10"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Interior ss:Color="#A6A6A6" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>

    <Style ss:ID="tituloSecao">
      <Font ss:FontName="Arial" ss:Bold="1" ss:Size="13"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Interior ss:Color="#808080" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>

    <Style ss:ID="rotulo">
      <Font ss:FontName="Arial" ss:Bold="1" ss:Size="10"/>
      <Interior ss:Color="#D9D9D9" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
      </Borders>
    </Style>

    <Style ss:ID="centro">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    </Style>

    <Style ss:ID="centroGrande">
      <Font ss:FontName="Arial" ss:Size="14"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
    </Style>
<Style ss:ID="centroComBorda">
  <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
  </Borders>
</Style>

<Style ss:ID="atualizadoTitulo">
  <Font ss:FontName="Arial" ss:Size="14" ss:Underline="Single"/>
  <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
</Style>

<Style ss:ID="atualizadoData">
  <Font ss:FontName="Arial" ss:Size="14" ss:Underline="Single"/>
  <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
</Style>

<Style ss:ID="observacaoVermelha">
  <Font ss:FontName="Arial" ss:Color="#FF0000" ss:Size="10"/>
  <Alignment ss:Horizontal="Center"/>
</Style>

<Style ss:ID="rotuloEscuro">
  <Font ss:FontName="Arial" ss:Bold="1" ss:Size="10"/>
  <Interior ss:Color="#A6A6A6" ss:Pattern="Solid"/>
  <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
  </Borders>
</Style>

<Style ss:ID="numeroEscuro">
  <NumberFormat ss:Format="#,##0.00"/>
  <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  <Interior ss:Color="#A6A6A6" ss:Pattern="Solid"/>
  <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
  </Borders>
</Style>

<Style ss:ID="percentualEscuro">
  <NumberFormat ss:Format="0.0%"/>
  <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  <Interior ss:Color="#A6A6A6" ss:Pattern="Solid"/>
  <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
  </Borders>
</Style>


    </Styles>

  ${abas.join("")}
</Workbook>`;
}

async function gerarFaturadoRecebido() {
  const mensagem = document.getElementById("geracaoMensagem");
  const { params, anos } = montarParams();

const anosSelecionados = anos
  .map((ano) => String(ano).trim())
  .filter(Boolean);

mensagem.textContent = "";

const shoppingsSelecionados = getSelectedValues("shoppingFiltro");
const shoppingsPermitidos = ["1", "13"];
const shoppingsInvalidos = shoppingsSelecionados.filter(
  (shoppingId) => !shoppingsPermitidos.includes(String(shoppingId))
);

if (shoppingsInvalidos.length) {
  alert("A parametrização deste relatório foi configurada para os Oiapoques.");
}

if (!anosSelecionados.length) {
  mensagem.textContent = "Selecione pelo menos um ano.";
  return;
}

  params.set("anos", anosSelecionados.join(","));

  try {
    const token = localStorage.getItem("@portalGMV:token");

    const response = await fetch(
      `/api/faturamento/gerar-tabelas/faturado-recebido?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const erro = await response.json().catch(() => null);
      throw new Error(erro?.message || "Erro ao gerar arquivo.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "faturado-x-recebido.xlsx";
    link.click();

    URL.revokeObjectURL(url);
  } catch (error) {
    mensagem.textContent = error.message;
  }
}

async function gerarFaturadoRecebidoDetalhado() {
  const mensagem = document.getElementById("geracaoMensagem");
  mensagem.textContent = "Modelo detalhado ainda será configurado.";
}

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    const dropdown = button.closest(".filter-dropdown");

    document.querySelectorAll(".filter-dropdown.open").forEach((item) => {
      if (item !== dropdown) item.classList.remove("open");
    });

    dropdown.classList.toggle("open");
  });
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".filter-dropdown")) {
    document.querySelectorAll(".filter-dropdown.open").forEach((item) => {
      item.classList.remove("open");
    });
  }
});

Object.entries(filtros).forEach(([campo, config]) => {
  document.getElementById(config.buscaId).addEventListener(
    "input",
    debounce(() => carregarOpcoes(campo), 400)
  );

  document.getElementById(config.filtroId).addEventListener("change", () => {
    atualizarTextoBotaoFiltro(campo);
  });
});

document
  .getElementById("gerarFaturadoRecebidoButton")
  .addEventListener("click", gerarFaturadoRecebido);

document
  .getElementById("gerarFaturadoRecebidoDetalhadoButton")
  .addEventListener("click", gerarFaturadoRecebidoDetalhado);

carregarFiltrosIniciais();