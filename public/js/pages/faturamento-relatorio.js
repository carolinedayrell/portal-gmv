let paginaAtual = 1;
const limitePorPagina = 50;
const totalColunas = 16;
let linhasSelecionadas = [];
let ordenacaoAtual = null;
let dadosOrdenadosCache = null;
let totalDadosOrdenados = 0;

const colunas = [
  { id: "competencia", label: "Competência", visivel: true },
  { id: "shopping", label: "Shopping", visivel: true },
  { id: "contrato", label: "Contrato", visivel: true },
  { id: "tipo_loja", label: "Tipo Loja", visivel: true },
  { id: "loja", label: "Loja", visivel: true },
  { id: "tipo", label: "Tipo", visivel: true },
  { id: "nome_da_classe", label: "Classe", visivel: true },
  { id: "area", label: "Área", visivel: true },
  { id: "valor_lancado", label: "Valor Lançado", visivel: true },
  { id: "descontos", label: "Descontos", visivel: true },
  { id: "juros", label: "Juros", visivel: true },
  { id: "correcoes", label: "Correções", visivel: true },
  { id: "multa", label: "Multa", visivel: true },
  { id: "valor_faturado_total", label: "Faturado Total", visivel: true },
  { id: "valor_liquidado", label: "Valor Liquidado", visivel: true },
  { id: "valor_m2", label: "R$/m²", visivel: true },
];

const filtros = {
  shopping: { filtroId: "shoppingFiltro", buscaId: "shoppingBusca", param: "shopping" },
  loja: { filtroId: "lojaFiltro", buscaId: "lojaBusca", param: "loja" },
  tipo: { filtroId: "tipoFiltro", buscaId: "tipoBusca", param: "tipo" },
  tipoLoja: { filtroId: "tipoLojaFiltro", buscaId: "tipoLojaBusca", param: "tipoLoja" },
  competencia: { filtroId: "competenciaFiltro", buscaId: "competenciaBusca", param: "competencia" },
  idlancamento: { filtroId: "idlancamentoFiltro", buscaId: "idlancamentoBusca", param: "idlancamento" },
};

function debounce(fn, delay = 400) {
  let timer;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function getSelectedValues(filtroId) {
  return Array.from(
    document.querySelectorAll(`#${filtroId} input[type="checkbox"]:checked`)
  ).map((input) => input.value);
}

function moeda(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function numero(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatarDataHora(value) {
  if (!value) return "-";

  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function atualizarInfoCache(cache) {
  const elemento = document.getElementById("faturamentoCacheInfo");
  if (!elemento || !cache) return;

  elemento.textContent = `Última atualização: ${formatarDataHora(cache.ultimaAtualizacao)}`;
}

function valorParaOrdenacao(item, colunaId) {
  const value = item[colunaId];

  if (colunaId === "competencia" && /^\d{2}\/\d{4}$/.test(String(value || ""))) {
    const [mes, ano] = String(value).split("/");
    return Number(`${ano}${mes}`);
  }

  const colunasNumericas = [
    "area",
    "valor_lancado",
    "descontos",
    "juros",
    "correcoes",
    "multa",
    "valor_faturado_total",
    "valor_liquidado",
    "valor_m2",
  ];

  if (colunasNumericas.includes(colunaId)) {
    return Number(value || 0);
  }

  return String(value || "").toLowerCase();
}

function ordenarDados(dados) {
  if (!ordenacaoAtual) return dados;

  const { colunaId, direction } = ordenacaoAtual;

  return [...dados].sort((a, b) => {
    const valorA = valorParaOrdenacao(a, colunaId);
    const valorB = valorParaOrdenacao(b, colunaId);

    if (valorA < valorB) return direction === "asc" ? -1 : 1;
    if (valorA > valorB) return direction === "asc" ? 1 : -1;
    return 0;
  });
}

function obterPaginaDadosOrdenados() {
  const inicio = (paginaAtual - 1) * limitePorPagina;
  const fim = inicio + limitePorPagina;

  return dadosOrdenadosCache.slice(inicio, fim);
}

function atualizarPaginacaoOrdenada() {
  const totalPages = Math.ceil(totalDadosOrdenados / limitePorPagina) || 1;

  document.getElementById("paginaInfo").textContent =
    `Página ${paginaAtual} de ${totalPages}`;

  document.getElementById("paginaAnteriorButton").disabled = paginaAtual <= 1;
  document.getElementById("proximaPaginaButton").disabled = paginaAtual >= totalPages;
}

function montarParams(campoIgnorado = null) {
  const params = new URLSearchParams();

  Object.entries(filtros).forEach(([campo, config]) => {
    if (campo === campoIgnorado) return;

    const valores = getSelectedValues(config.filtroId);

    if (valores.length) {
      params.set(config.param, valores.join(","));
    }
  });

  return params;
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
          <input type="checkbox" value="${value}" ${checked} />
          <span>${label}</span>
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
    loja: "Loja",
    tipo: "Tipo",
    tipoLoja: "Tipo Loja",
    competencia: "Competência",
    idlancamento: "ID Lançamento",
  };

  if (!selecionadas.length) {
    button.textContent = labelsPadrao[campo];
    return;
  }

  if (selecionadas.length === opcoes.length) {
    button.textContent = campo === "competencia" ? "Todas" : "Todos";
    return;
  }

  const primeiroNome = selecionadas[0].closest("label").querySelector("span").textContent;

  button.textContent =
    selecionadas.length === 1 ? primeiroNome : `${primeiroNome} e outros`;
}

async function carregarOpcoes(campo) {
  const config = filtros[campo];
  const params = montarParams(campo);
  const busca = document.getElementById(config.buscaId).value.trim();

  if (busca) {
    params.set("busca", busca);
  }

  const opcoes = await apiRequest(`/faturamento/opcoes/${campo}?${params.toString()}`);
  preencherFiltro(config.filtroId, opcoes);
}

async function atualizarFiltros(campoAlterado = null) {
  const promessas = Object.keys(filtros)
    .filter((campo) => campo !== campoAlterado)
    .map((campo) => carregarOpcoes(campo));

  await Promise.all(promessas);
}

function montarPainelColunas() {
  const panel = document.getElementById("colunasPanel");

  panel.innerHTML = colunas
    .map(
      (coluna) => `
        <label class="filter-option">
          <input type="checkbox" value="${coluna.id}" ${coluna.visivel ? "checked" : ""} />
          <span>${coluna.label}</span>
        </label>
      `
    )
    .join("");

  panel.addEventListener("change", () => {
    const visiveis = getSelectedValues("colunasPanel");

    colunas.forEach((coluna) => {
      coluna.visivel = visiveis.includes(coluna.id);
    });

    aplicarVisibilidadeColunas();
  });
}

function aplicarVisibilidadeColunas() {
  colunas.forEach((coluna) => {
    document.querySelectorAll(`[data-col="${coluna.id}"]`).forEach((element) => {
      element.hidden = !coluna.visivel;
    });
  });
}

function limparSelecaoLinhas() {
  linhasSelecionadas = [];
  document.querySelectorAll("#faturamentoTable tbody tr").forEach((row) => {
    row.classList.remove("selected-row");
  });
  atualizarRodapeSelecionados();
}

function somarSelecionados(campo) {
  return linhasSelecionadas.reduce((total, item) => {
    return total + Number(item[campo] || 0);
  }, 0);
}

function atualizarRodapeSelecionados() {
  const tabela = document.getElementById("faturamentoTable");
  let tfoot = tabela.querySelector("tfoot");

  if (!tfoot) {
    tfoot = document.createElement("tfoot");
    tabela.appendChild(tfoot);
  }

  if (!linhasSelecionadas.length) {
    tfoot.innerHTML = "";
    return;
  }

  tfoot.innerHTML = `
    <tr>
      <td data-col="competencia" colspan="8">
        ${linhasSelecionadas.length} linha(s) selecionada(s)
      </td>
      <td data-col="valor_lancado">${moeda(somarSelecionados("valor_lancado"))}</td>
      <td data-col="descontos">${moeda(somarSelecionados("descontos"))}</td>
      <td data-col="juros">${moeda(somarSelecionados("juros"))}</td>
      <td data-col="correcoes">${moeda(somarSelecionados("correcoes"))}</td>
      <td data-col="multa">${moeda(somarSelecionados("multa"))}</td>
      <td data-col="valor_faturado_total">${moeda(somarSelecionados("valor_faturado_total"))}</td>
      <td data-col="valor_liquidado">${moeda(somarSelecionados("valor_liquidado"))}</td>
      <td data-col="valor_m2">-</td>
    </tr>
  `;

  aplicarVisibilidadeColunas();
}

function ativarSelecaoLinhas(dados) {
  document.querySelectorAll("#faturamentoTable tbody tr").forEach((row, index) => {
    row.addEventListener("click", (event) => {
      if (!event.ctrlKey) {
        limparSelecaoLinhas();
      }

      const item = dados[index];
      const jaSelecionada = row.classList.contains("selected-row");

      if (jaSelecionada) {
        row.classList.remove("selected-row");
        linhasSelecionadas = linhasSelecionadas.filter((selecionado) => selecionado !== item);
      } else {
        row.classList.add("selected-row");
        linhasSelecionadas.push(item);
      }

      atualizarRodapeSelecionados();
    });
  });
}

async function carregarFiltrosIniciais() {
  try {
    const response = await apiRequest("/faturamento/filtros");

    preencherFiltro("shoppingFiltro", response.shoppings);
    preencherFiltro("lojaFiltro", response.lojas);
    preencherFiltro("tipoFiltro", response.tipos);
    preencherFiltro("tipoLojaFiltro", response.tiposLoja);
    preencherFiltro("competenciaFiltro", response.competencias, [response.competenciaAtual]);
    preencherFiltro("idlancamentoFiltro", response.idsLancamento || []);
    atualizarInfoCache(response.cache);

    paginaAtual = 1;
    await carregarRelatorio();
  } catch (error) {
    document.getElementById("faturamentoTableBody").innerHTML = `
      <tr>
        <td colspan="${totalColunas}">Erro ao carregar relatório: ${error.message}</td>
      </tr>
    `;
  }
}

function renderizarDadosRelatorio(dados) {
  const tbody = document.getElementById("faturamentoTableBody");

  if (!dados.length) {
    limparSelecaoLinhas();
    tbody.innerHTML = `<tr><td colspan="${totalColunas}">Nenhum dado encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = dados
    .map(
      (item) => `
        <tr>
          <td data-col="competencia">${item.competencia || "-"}</td>
          <td data-col="shopping">${item.shopping || "-"}</td>
          <td data-col="contrato">${item.contrato || "-"}</td>
          <td data-col="tipo_loja">${item.tipo_loja || "-"}</td>
          <td data-col="loja">${item.loja || "-"}</td>
          <td data-col="tipo">${item.tipo || "-"}</td>
          <td data-col="nome_da_classe">${item.nome_da_classe || "-"}</td>
          <td data-col="area">${numero(item.area)}</td>
          <td data-col="valor_lancado">${moeda(item.valor_lancado)}</td>
          <td data-col="descontos">${moeda(item.descontos)}</td>
          <td data-col="juros">${moeda(item.juros)}</td>
          <td data-col="correcoes">${moeda(item.correcoes)}</td>
          <td data-col="multa">${moeda(item.multa)}</td>
          <td data-col="valor_faturado_total">${moeda(item.valor_faturado_total)}</td>
          <td data-col="valor_liquidado">${moeda(item.valor_liquidado)}</td>
          <td data-col="valor_m2">${numero(item.valor_m2)}</td>
        </tr>
      `
    )
    .join("");

  limparSelecaoLinhas();
  ativarSelecaoLinhas(dados);
  aplicarVisibilidadeColunas();
}

async function carregarRelatorio() {
  const params = montarParams();
  params.set("page", paginaAtual);
  params.set("limit", limitePorPagina);

  const tbody = document.getElementById("faturamentoTableBody");

  if (ordenacaoAtual && dadosOrdenadosCache) {
    renderizarDadosRelatorio(obterPaginaDadosOrdenados());
    atualizarPaginacaoOrdenada();
    return;
  }

  try {
    const response = await apiRequest(`/faturamento/relatorio?${params.toString()}`);

    document.getElementById("valorFaturado").textContent =
      moeda(response.resumo.valor_lancado);

    document.getElementById("valorRecebido").textContent =
      moeda(response.resumo.valor_liquidado);

    document.getElementById("percentualRecebimento").textContent =
      `${numero(response.resumo.percentual_recebimento)}%`;

    atualizarInfoCache(response.cache);

    document.getElementById("paginaInfo").textContent =
      `Página ${response.pagination.page} de ${response.pagination.totalPages || 1}`;

    document.getElementById("paginaAnteriorButton").disabled =
      response.pagination.page <= 1;

    document.getElementById("proximaPaginaButton").disabled =
      response.pagination.page >= response.pagination.totalPages;

if (!response.dados.length) {
  limparSelecaoLinhas();
  tbody.innerHTML = `<tr><td colspan="${totalColunas}">Nenhum dado encontrado.</td></tr>`;
  return;
}

    renderizarDadosRelatorio(response.dados);

  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="${totalColunas}">${error.message}</td></tr>`;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function valorFormatadoParaExportacao(item, colunaId) {
  const monetarios = [
    "valor_lancado",
    "descontos",
    "juros",
    "correcoes",
    "multa",
    "valor_faturado_total",
    "valor_liquidado",
  ];

  if (monetarios.includes(colunaId)) {
    return moeda(item[colunaId]);
  }

  if (["area", "valor_m2"].includes(colunaId)) {
    return numero(item[colunaId]);
  }

  return item[colunaId] || "-";
}

async function buscarTodosDadosRelatorio() {
  const params = montarParams();
  params.set("limit", 100);

  let page = 1;
  let totalPages = 1;
  const dados = [];

  do {
    params.set("page", page);

    const response = await apiRequest(`/faturamento/relatorio?${params.toString()}`);

    dados.push(...response.dados);

    totalPages = response.pagination.totalPages || 1;
    page += 1;
  } while (page <= totalPages);

  return dados;
}

async function exportarTabelaParaExcel() {
  const button = document.getElementById("exportarExcelButton");
  const textoOriginal = button.textContent;

  try {
    button.disabled = true;
    button.textContent = "Exportando...";

    const params = montarParams();
    const colunasVisiveis = colunas
      .filter((coluna) => coluna.visivel)
      .map((coluna) => coluna.id);

    params.set("colunas", colunasVisiveis.join(","));

    const token = localStorage.getItem("@portalGMV:token");
    const response = await fetch(`/api/faturamento/relatorio/exportar?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      const erro = await response.json().catch(() => null);
      throw new Error(erro?.message || "Erro ao exportar Excel.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "relatorio-faturamento.xlsx";
    link.click();

    URL.revokeObjectURL(url);
  } catch (error) {
    alert(`Erro ao exportar Excel: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = textoOriginal;
  }
}

function usuarioEhMestre() {
  const usuario = JSON.parse(localStorage.getItem("@portalGMV:usuario") || "null");
  return usuario?.perfil === "MESTRE";
}

function configurarBotaoAtualizarCache() {
  const button = document.getElementById("atualizarCacheButton");
  if (!button) return;

  button.hidden = !usuarioEhMestre();

  button.addEventListener("click", async () => {
    const textoOriginal = button.textContent;

    try {
      button.disabled = true;
      button.textContent = "Atualizando...";

      const response = await apiRequest("/faturamento/relatorio/cache/refresh", {
        method: "POST",
      });

      atualizarInfoCache(response.cache);
      paginaAtual = 1;
      ordenacaoAtual = null;
      dadosOrdenadosCache = null;
      await carregarFiltrosIniciais();
    } catch (error) {
      alert(`Erro ao atualizar base: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = textoOriginal;
    }
  });
}

function iniciarRedimensionamentoColunas() {
  const tabela = document.getElementById("faturamentoTable");
  const headers = tabela.querySelectorAll("th");

  headers.forEach((th) => {
    if (th.querySelector(".column-resizer")) return;

    const resizer = document.createElement("span");
    resizer.className = "column-resizer";
    th.appendChild(resizer);

    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener("mousedown", (event) => {
      event.preventDefault();

      startX = event.pageX;
      startWidth = th.offsetWidth;

      function onMouseMove(moveEvent) {
        const newWidth = Math.max(70, startWidth + moveEvent.pageX - startX);
        th.style.width = `${newWidth}px`;
        th.style.minWidth = `${newWidth}px`;
      }

      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  });
}

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    const dropdown = button.closest(".filter-dropdown");

    document.querySelectorAll(".filter-dropdown.open").forEach((item) => {
      if (item !== dropdown) {
        item.classList.remove("open");
      }
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

document.getElementById(config.filtroId).addEventListener("change", async () => {
  paginaAtual = 1;
  ordenacaoAtual = null;
  dadosOrdenadosCache = null;

  atualizarTextoBotaoFiltro(campo);
  await atualizarFiltros(campo);
});
});

document.getElementById("filtrarButton").addEventListener("click", () => {
  paginaAtual = 1;
  ordenacaoAtual = null;
  dadosOrdenadosCache = null;

  document.querySelectorAll("#faturamentoTable thead th").forEach((header) => {
    header.classList.remove("sort-asc", "sort-desc");
  });

  carregarRelatorio();
});

document.getElementById("paginaAnteriorButton").addEventListener("click", () => {
  if (paginaAtual > 1) {
    paginaAtual -= 1;
    carregarRelatorio();
  }
});

document.getElementById("proximaPaginaButton").addEventListener("click", () => {
  paginaAtual += 1;
  carregarRelatorio();
});

document.getElementById("colunasButton").addEventListener("click", () => {
  const panel = document.getElementById("colunasPanel");
  panel.hidden = !panel.hidden;
});

document.getElementById("exportarExcelButton").addEventListener("click", exportarTabelaParaExcel);

function ativarOrdenacaoGlobalFaturamento() {
  document.querySelectorAll("#faturamentoTable thead th[data-col]").forEach((th) => {
    th.classList.add("sortable-column");

    th.addEventListener("click", async (event) => {
      if (event.target.closest(".column-resizer")) return;

      const colunaId = th.dataset.col;
      const direction =
        ordenacaoAtual?.colunaId === colunaId && ordenacaoAtual.direction === "asc"
          ? "desc"
          : "asc";

      ordenacaoAtual = { colunaId, direction };
      paginaAtual = 1;

      document.querySelectorAll("#faturamentoTable thead th").forEach((header) => {
        header.classList.remove("sort-asc", "sort-desc");
      });

      th.classList.add(direction === "asc" ? "sort-asc" : "sort-desc");

      const dados = await buscarTodosDadosRelatorio();

      dadosOrdenadosCache = ordenarDados(dados);
      totalDadosOrdenados = dadosOrdenadosCache.length;

      renderizarDadosRelatorio(obterPaginaDadosOrdenados());
      atualizarPaginacaoOrdenada();
    });
  });
}

montarPainelColunas();
iniciarRedimensionamentoColunas();
ativarOrdenacaoGlobalFaturamento();
configurarBotaoAtualizarCache();
carregarFiltrosIniciais();

