const baixarModeloVendasButton =
  document.getElementById(
    "baixarModeloVendasButton"
  );

const importarVendasButton =
  document.getElementById(
    "importarVendasButton"
  );

const vendasShoppingDropdown =
  document.getElementById(
    "vendasShoppingDropdown"
  );

const vendasShoppingButton =
  document.getElementById(
    "vendasShoppingButton"
  );

const vendasShoppingBusca =
  document.getElementById(
    "vendasShoppingBusca"
  );

const vendasShoppingOpcoes =
  document.getElementById(
    "vendasShoppingOpcoes"
  );

const vendasDataInicial =
  document.getElementById("vendasDataInicial");
const vendasDataFinal =
  document.getElementById("vendasDataFinal");
const vendasCanal =
  document.getElementById("vendasCanal");
const vendasLoja =
  document.getElementById("vendasLoja");
const vendasContrato =
  document.getElementById("vendasContrato");
const vendasGranularidade =
  document.getElementById("vendasGranularidade");
const filtrarVendasButton =
  document.getElementById("filtrarVendasButton");
const exportarVendasButton =
  document.getElementById("exportarVendasButton");
const vendasTableBody =
  document.getElementById("vendasTableBody");
const vendasValorTotal =
  document.getElementById("vendasValorTotal");
const vendasTotalContratos =
  document.getElementById("vendasTotalContratos");
const vendasTotalLojas =
  document.getElementById("vendasTotalLojas");
const vendasPaginaAnteriorButton =
  document.getElementById("vendasPaginaAnteriorButton");
const vendasProximaPaginaButton =
  document.getElementById("vendasProximaPaginaButton");
const vendasPaginaInfo =
  document.getElementById("vendasPaginaInfo");

let shoppingsDisponiveis = [];
const shoppingsSelecionados = new Set();
let paginaAtualVendas = 1;
let totalPaginasVendas = 1;

function atualizarLimitesDatas() {
  vendasDataFinal.min = vendasDataInicial.value || "";
  vendasDataInicial.max = vendasDataFinal.value || "";

  const intervaloInvalido = Boolean(
    vendasDataInicial.value &&
      vendasDataFinal.value &&
      vendasDataInicial.value > vendasDataFinal.value
  );
  const mensagem = intervaloInvalido
    ? "A data inicial não pode ser maior que a data final."
    : "";

  vendasDataInicial.setCustomValidity(mensagem);
  vendasDataFinal.setCustomValidity(mensagem);

  return !intervaloInvalido;
}

function validarIntervaloDatas() {
  if (atualizarLimitesDatas()) return true;

  vendasDataFinal.reportValidity();
  vendasDataFinal.focus();
  return false;
}

async function baixarModeloVendas() {
  const token = localStorage.getItem(
    "@portalGMV:token"
  );

  if (!token) {
    window.location.href = "/login";
    return;
  }

  baixarModeloVendasButton.disabled = true;
  baixarModeloVendasButton.textContent =
    "Baixando...";

  try {
    const response = await fetch(
      "/api/vendas/modelo",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.status === 401) {
      localStorage.removeItem(
        "@portalGMV:token"
      );

      localStorage.removeItem(
        "@portalGMV:usuario"
      );

      localStorage.removeItem(
        "@portalGMV:permissoes"
      );

      window.location.href = "/login";
      return;
    }

    if (!response.ok) {
      const erro = await response
        .json()
        .catch(() => null);

      throw new Error(
        erro?.message ||
          "Não foi possível baixar o modelo."
      );
    }

    const arquivo = await response.blob();
    const enderecoTemporario =
      URL.createObjectURL(arquivo);

    const link = document.createElement("a");

    link.href = enderecoTemporario;
    link.download =
      "modelo-importacao-vendas-v1.xlsx";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(
      enderecoTemporario
    );
  } catch (error) {
    window.alert(error.message);
  } finally {
    baixarModeloVendasButton.disabled =
      false;

    baixarModeloVendasButton.textContent =
      "Baixar modelo";
  }
}

function atualizarResumoShoppings() {
  const quantidade = shoppingsSelecionados.size;

  if (!quantidade) {
    vendasShoppingButton.textContent =
      "Todos os shoppings autorizados";
    vendasShoppingButton.title =
      "Todos os shoppings autorizados";
    return;
  }

  if (quantidade === 1) {
    const [shoppingId] = shoppingsSelecionados;
    const shopping = shoppingsDisponiveis.find(
      (item) => item.id === shoppingId
    );

    const nome = shopping
      ? shopping.nome
      : shoppingId;

    vendasShoppingButton.textContent = nome;
    vendasShoppingButton.title = nome;
    return;
  }

  vendasShoppingButton.textContent =
    `${quantidade} shoppings selecionados`;

  vendasShoppingButton.title =
    shoppingsDisponiveis
      .filter((shopping) =>
        shoppingsSelecionados.has(shopping.id)
      )
      .map((shopping) => shopping.nome)
      .join(", ");
}

function renderizarOpcoesShoppings() {
  const busca = vendasShoppingBusca.value
    .trim()
    .toLocaleLowerCase("pt-BR");

  const shoppingsFiltrados =
    shoppingsDisponiveis.filter((shopping) => {
      const texto =
        `${shopping.id} ${shopping.nome}`
          .toLocaleLowerCase("pt-BR");

      return texto.includes(busca);
    });

  vendasShoppingOpcoes.innerHTML = "";

  if (!shoppingsFiltrados.length) {
    const vazio = document.createElement("p");
    vazio.className = "filter-empty";
    vazio.textContent =
      "Nenhum shopping encontrado.";

    vendasShoppingOpcoes.appendChild(vazio);
    return;
  }

  shoppingsFiltrados.forEach((shopping) => {
    const opcao = document.createElement("label");
    opcao.className = "filter-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = shopping.id;
    checkbox.checked =
      shoppingsSelecionados.has(shopping.id);

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        shoppingsSelecionados.add(shopping.id);
      } else {
        shoppingsSelecionados.delete(shopping.id);
      }

      atualizarResumoShoppings();
    });

    const nome = document.createElement("span");
    nome.textContent = shopping.nome;

    opcao.append(checkbox, nome);
    vendasShoppingOpcoes.appendChild(opcao);
  });
}

async function carregarShoppingsAutorizados() {
  vendasShoppingButton.disabled = true;
  vendasShoppingButton.textContent =
    "Carregando shoppings...";

  try {
    const resultado = await apiRequest(
      "/vendas/filtros"
    );

    shoppingsDisponiveis =
      resultado?.shoppings || [];

    shoppingsSelecionados.clear();
    vendasShoppingBusca.value = "";

    if (!shoppingsDisponiveis.length) {
      vendasShoppingButton.textContent =
        "Nenhum shopping autorizado";
      vendasShoppingButton.title =
        "Nenhum shopping autorizado";

      vendasShoppingOpcoes.innerHTML = `
        <p class="filter-empty">
          Nenhum shopping autorizado.
        </p>
      `;

      return;
    }

    renderizarOpcoesShoppings();
    atualizarResumoShoppings();
    vendasShoppingButton.disabled = false;
  } catch (error) {
    vendasShoppingButton.textContent =
      "Erro ao carregar shoppings";

    vendasShoppingOpcoes.innerHTML = `
      <p class="filter-empty">
        Erro ao carregar shoppings
      </p>
    `;

    vendasShoppingButton.disabled = true;

    window.alert(error.message);
  }
}

function formatarMoedaRelatorio(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));
}

function formatarDataRelatorio(valor) {
  if (!valor) return "-";
  const [ano, mes, dia] = String(valor)
    .slice(0, 10)
    .split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarPeriodoRelatorio(valor) {
  if (!valor) return "-";
  const [ano, mes] = String(valor)
    .slice(0, 10)
    .split("-");
  return `${mes}/${ano}`;
}

function adicionarCelulaRelatorio(linha, valor) {
  const celula = document.createElement("td");
  celula.textContent =
    valor === null || valor === undefined || valor === ""
      ? "-"
      : String(valor);
  linha.appendChild(celula);
}

function parametrosRelatorioVendas({ incluirPagina = true } = {}) {
  const parametros = new URLSearchParams();

  if (vendasDataInicial.value) {
    parametros.set("dataInicial", vendasDataInicial.value);
  }

  if (vendasDataFinal.value) {
    parametros.set("dataFinal", vendasDataFinal.value);
  }

  if (shoppingsSelecionados.size) {
    parametros.set(
      "shopping",
      [...shoppingsSelecionados].join(",")
    );
  }

  if (vendasCanal.value) {
    parametros.set("canal", vendasCanal.value);
  }

  if (vendasLoja.value.trim()) {
    parametros.set("loja", vendasLoja.value.trim());
  }

  if (vendasContrato.value.trim()) {
    parametros.set(
      "contrato",
      vendasContrato.value.trim()
    );
  }

  if (vendasGranularidade.value) {
    parametros.set(
      "granularidade",
      vendasGranularidade.value
    );
  }

  if (incluirPagina) {
    parametros.set("pagina", String(paginaAtualVendas));
    parametros.set("limite", "50");
  }

  return parametros;
}

function renderizarRelatorioVendas(resultado) {
  vendasTableBody.innerHTML = "";

  if (!resultado.dados.length) {
    const linha = document.createElement("tr");
    const celula = document.createElement("td");
    celula.colSpan = 9;
    celula.textContent =
      "Nenhuma venda encontrada para os filtros informados.";
    linha.appendChild(celula);
    vendasTableBody.appendChild(linha);
  } else {
    resultado.dados.forEach((item) => {
      const linha = document.createElement("tr");

      adicionarCelulaRelatorio(
        linha,
        formatarPeriodoRelatorio(item.periodo)
      );
      adicionarCelulaRelatorio(
        linha,
        formatarDataRelatorio(item.data_venda)
      );
      adicionarCelulaRelatorio(
        linha,
        item.shopping_nome
      );
      adicionarCelulaRelatorio(linha, item.contrato);
      adicionarCelulaRelatorio(linha, item.lucs);
      adicionarCelulaRelatorio(linha, item.loja_sistema);
      adicionarCelulaRelatorio(
        linha,
        Number(item.abl_total_sistema || 0).toLocaleString(
          "pt-BR",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )
      );
      adicionarCelulaRelatorio(linha, item.canal);
      adicionarCelulaRelatorio(
        linha,
        formatarMoedaRelatorio(item.vendas)
      );

      vendasTableBody.appendChild(linha);
    });
  }

  vendasValorTotal.textContent =
    formatarMoedaRelatorio(resultado.resumo.vendasTotal);
  vendasTotalContratos.textContent =
    Number(resultado.resumo.totalContratos || 0)
      .toLocaleString("pt-BR");
  vendasTotalLojas.textContent =
    Number(resultado.resumo.totalLojas || 0)
      .toLocaleString("pt-BR");

  paginaAtualVendas = resultado.paginacao.pagina;
  totalPaginasVendas = resultado.paginacao.totalPaginas;
  vendasPaginaInfo.textContent =
    `Página ${paginaAtualVendas} de ${totalPaginasVendas}`;
  vendasPaginaAnteriorButton.disabled =
    paginaAtualVendas <= 1;
  vendasProximaPaginaButton.disabled =
    paginaAtualVendas >= totalPaginasVendas;
}

async function carregarRelatorioVendas() {
  if (!validarIntervaloDatas()) return;

  filtrarVendasButton.disabled = true;
  exportarVendasButton.disabled = true;
  vendasTableBody.innerHTML = `
    <tr>
      <td colspan="9">Carregando relatório...</td>
    </tr>
  `;

  try {
    const parametros = parametrosRelatorioVendas();
    const resultado = await apiRequest(
      `/vendas/relatorio?${parametros.toString()}`
    );

    renderizarRelatorioVendas(resultado);
    exportarVendasButton.disabled = false;
    exportarVendasButton.title =
      "Exportar os dados com os filtros atuais";
  } catch (error) {
    vendasTableBody.innerHTML = "";
    const linha = document.createElement("tr");
    const celula = document.createElement("td");
    celula.colSpan = 9;
    celula.textContent =
      `Erro ao carregar relatório: ${error.message}`;
    linha.appendChild(celula);
    vendasTableBody.appendChild(linha);
  } finally {
    filtrarVendasButton.disabled = false;
  }
}

async function exportarRelatorioVendas() {
  if (!validarIntervaloDatas()) return;

  exportarVendasButton.disabled = true;
  exportarVendasButton.textContent = "Exportando...";

  try {
    const parametros = parametrosRelatorioVendas({
      incluirPagina: false,
    });
    const response = await fetch(
      `/api/vendas/exportacao.xlsx?${parametros.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      }
    );

    if (!response.ok) {
      const erro = await response.json().catch(() => null);
      throw new Error(
        erro?.message ||
          "Não foi possível exportar o relatório."
      );
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "relatorio-vendas.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    window.alert(error.message);
  } finally {
    exportarVendasButton.disabled = false;
    exportarVendasButton.textContent =
      "Exportar Excel";
  }
}

function usuarioPodeCriarVendas() {
  const permissoes = JSON.parse(
    localStorage.getItem(
      "@portalGMV:permissoes"
    ) || "[]"
  );

  const permissaoVendas = permissoes.find(
    (permissao) =>
      String(permissao.modulo)
        .toUpperCase() === "VENDAS"
  );

  return Boolean(
    permissaoVendas?.pode_criar
  );
}

async function inicializarPaginaVendas() {
  if (!getToken()) {
    window.location.href = "/login";
    return;
  }

  await requireAuth();

  if (!getToken()) {
    return;
  }

  if (usuarioPodeCriarVendas()) {
    importarVendasButton.disabled = false;
    importarVendasButton.title =
      "Abrir importação de vendas";
  }

  await carregarShoppingsAutorizados();
  filtrarVendasButton.disabled = false;
  filtrarVendasButton.title = "Aplicar filtros";
  await carregarRelatorioVendas();
}

baixarModeloVendasButton.addEventListener(
  "click",
  baixarModeloVendas
);

importarVendasButton.addEventListener(
  "click",
  () => {
    window.location.href =
      "/vendas/importacao";
  }
);

vendasShoppingButton.addEventListener(
  "click",
  () => {
    const aberto =
      vendasShoppingDropdown.classList.toggle(
        "open"
      );

    vendasShoppingButton.setAttribute(
      "aria-expanded",
      String(aberto)
    );

    if (aberto) {
      vendasShoppingBusca.focus();
    }
  }
);

vendasShoppingBusca.addEventListener(
  "input",
  renderizarOpcoesShoppings
);

vendasDataInicial.addEventListener(
  "change",
  atualizarLimitesDatas
);

vendasDataFinal.addEventListener(
  "change",
  atualizarLimitesDatas
);

filtrarVendasButton.addEventListener(
  "click",
  () => {
    paginaAtualVendas = 1;
    carregarRelatorioVendas();
  }
);

exportarVendasButton.addEventListener(
  "click",
  exportarRelatorioVendas
);

vendasPaginaAnteriorButton.addEventListener(
  "click",
  () => {
    if (paginaAtualVendas <= 1) return;
    paginaAtualVendas -= 1;
    carregarRelatorioVendas();
  }
);

vendasProximaPaginaButton.addEventListener(
  "click",
  () => {
    if (paginaAtualVendas >= totalPaginasVendas) return;
    paginaAtualVendas += 1;
    carregarRelatorioVendas();
  }
);

document.addEventListener("click", (event) => {
  if (
    vendasShoppingDropdown.contains(
      event.target
    )
  ) {
    return;
  }

  vendasShoppingDropdown.classList.remove(
    "open"
  );

  vendasShoppingButton.setAttribute(
    "aria-expanded",
    "false"
  );
});

inicializarPaginaVendas();
