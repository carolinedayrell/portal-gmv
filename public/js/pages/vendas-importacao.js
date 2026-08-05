const TAMANHO_MAXIMO_ARQUIVO_VENDAS =
  10 * 1024 * 1024;

const voltarRelatorioVendasButton =
  document.getElementById(
    "voltarRelatorioVendasButton"
  );

const baixarModeloImportacaoButton =
  document.getElementById(
    "baixarModeloImportacaoButton"
  );

const selecionarArquivoVendasButton =
  document.getElementById(
    "selecionarArquivoVendasButton"
  );

const validarArquivoVendasButton =
  document.getElementById(
    "validarArquivoVendasButton"
  );

const arquivoVendasInput =
  document.getElementById(
    "arquivoVendasInput"
  );

const arquivoVendasInfo =
  document.getElementById(
    "arquivoVendasInfo"
  );

const aceitarRegrasVendasInput =
  document.getElementById(
    "aceitarRegrasVendasInput"
  );

const vendasImportacaoResultado =
  document.getElementById(
    "vendasImportacaoResultado"
  );

const vendasImportacaoStatus =
  document.getElementById(
    "vendasImportacaoStatus"
  );

const vendasValidacaoTotalLinhas =
  document.getElementById(
    "vendasValidacaoTotalLinhas"
  );

const vendasValidacaoTotalErros =
  document.getElementById(
    "vendasValidacaoTotalErros"
  );

const vendasValidacaoTotalDivergencias =
  document.getElementById(
    "vendasValidacaoTotalDivergencias"
  );

const vendasValidacaoTotalVendas =
  document.getElementById(
    "vendasValidacaoTotalVendas"
  );

const vendasOcorrenciasTableBody =
  document.getElementById(
    "vendasOcorrenciasTableBody"
  );

const vendasPreviewTableBody =
  document.getElementById(
    "vendasPreviewTableBody"
  );

const baixarOcorrenciasVendasButton =
  document.getElementById(
    "baixarOcorrenciasVendasButton"
  );

const vendasConfirmacaoArea =
  document.getElementById(
    "vendasConfirmacaoArea"
  );

const confirmarDivergenciasVendasInput =
  document.getElementById(
    "confirmarDivergenciasVendasInput"
  );

const confirmarImportacaoVendasButton =
  document.getElementById(
    "confirmarImportacaoVendasButton"
  );

const vendasHistoricoTableBody =
  document.getElementById(
    "vendasHistoricoTableBody"
  );

let arquivoVendasSelecionado = null;
let importacaoVendasAtualId = null;

function obterPermissaoVendas() {
  const permissoes = JSON.parse(
    localStorage.getItem(
      "@portalGMV:permissoes"
    ) || "[]"
  );

  return permissoes.find(
    (permissao) =>
      String(permissao.modulo)
        .toUpperCase() === "VENDAS"
  );
}

async function baixarModeloImportacao() {
  const token = getToken();

  if (!token) {
    window.location.href = "/login";
    return;
  }

  baixarModeloImportacaoButton.disabled = true;
  baixarModeloImportacaoButton.textContent =
    "Baixando...";

  try {
    const response = await fetch(
      "/api/vendas/modelo",
      {
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
    baixarModeloImportacaoButton.disabled =
      false;

    baixarModeloImportacaoButton.textContent =
      "Baixar modelo";
  }
}

function limparArquivoSelecionado(mensagem) {
  arquivoVendasInput.value = "";
  arquivoVendasSelecionado = null;
  validarArquivoVendasButton.disabled = true;
  arquivoVendasInfo.dataset.status = "error";
  arquivoVendasInfo.textContent = mensagem;
}

function atualizarDisponibilidadeValidacao() {
  validarArquivoVendasButton.disabled = !(
    arquivoVendasSelecionado &&
    aceitarRegrasVendasInput.checked
  );
}

function tratarArquivoSelecionado() {
  const arquivo = arquivoVendasInput.files[0];

  if (!arquivo) {
    arquivoVendasSelecionado = null;
    arquivoVendasInfo.dataset.status = "";
    arquivoVendasInfo.textContent =
      "Nenhum arquivo selecionado. Utilize somente o " +
      "formato .xlsx, com tamanho máximo de 10 MB.";
    atualizarDisponibilidadeValidacao();
    return;
  }

  if (!arquivo.name.toLowerCase().endsWith(".xlsx")) {
    limparArquivoSelecionado(
      "Formato inválido. Selecione um arquivo .xlsx."
    );
    return;
  }

  if (arquivo.size <= 0) {
    limparArquivoSelecionado(
      "O arquivo selecionado está vazio."
    );
    return;
  }

  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO_VENDAS) {
    limparArquivoSelecionado(
      "O arquivo ultrapassa o limite de 10 MB."
    );
    return;
  }

  const tamanhoMb =
    (arquivo.size / 1024 / 1024).toFixed(2);

  arquivoVendasInfo.dataset.status = "success";
  arquivoVendasInfo.textContent =
    `${arquivo.name} (${tamanhoMb} MB) selecionado e pronto para validação.`;

  arquivoVendasSelecionado = arquivo;
  atualizarDisponibilidadeValidacao();
}

function formatarMoedaVendas(valor) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));
}

function adicionarCelula(linha, valor, classe = "") {
  const celula = document.createElement("td");
  celula.textContent =
    valor === null || valor === undefined || valor === ""
      ? "-"
      : String(valor);

  if (classe) celula.className = classe;
  linha.appendChild(celula);
}

function formatarDataHoraVendas(valor) {
  if (!valor) return "-";
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? "-"
    : data.toLocaleString("pt-BR");
}

async function carregarHistoricoVendas() {
  try {
    const resultado = await apiRequest(
      "/vendas/importacoes?pagina=1&limite=20"
    );

    vendasHistoricoTableBody.innerHTML = "";

    if (!resultado.dados.length) {
      const linha = document.createElement("tr");
      const celula = document.createElement("td");
      celula.colSpan = 8;
      celula.textContent =
        "Nenhuma importação registrada.";
      linha.appendChild(celula);
      vendasHistoricoTableBody.appendChild(linha);
      return;
    }

    resultado.dados.forEach((item) => {
      const linha = document.createElement("tr");
      adicionarCelula(linha, item.id);
      adicionarCelula(linha, item.arquivo_nome);
      adicionarCelula(linha, item.status);
      adicionarCelula(linha, item.usuario_nome);
      adicionarCelula(linha, item.confirmado_por_nome);
      adicionarCelula(linha, item.total_linhas);
      adicionarCelula(
        linha,
        formatarMoedaVendas(item.total_vendas)
      );
      adicionarCelula(
        linha,
        formatarDataHoraVendas(item.criada_em)
      );
      vendasHistoricoTableBody.appendChild(linha);
    });
  } catch (error) {
    vendasHistoricoTableBody.innerHTML = "";
    const linha = document.createElement("tr");
    const celula = document.createElement("td");
    celula.colSpan = 8;
    celula.textContent =
      `Erro ao carregar histórico: ${error.message}`;
    linha.appendChild(celula);
    vendasHistoricoTableBody.appendChild(linha);
  }
}

function renderizarOcorrencias(ocorrencias) {
  vendasOcorrenciasTableBody.innerHTML = "";

  if (!ocorrencias.length) {
    const linha = document.createElement("tr");
    const celula = document.createElement("td");
    celula.colSpan = 7;
    celula.textContent =
      "Nenhum erro, divergência ou aviso encontrado.";
    linha.appendChild(celula);
    vendasOcorrenciasTableBody.appendChild(linha);
    return;
  }

  ocorrencias.forEach((ocorrencia) => {
    const linha = document.createElement("tr");
    const classe =
      `vendas-severidade-${String(ocorrencia.severidade || "")
        .toLowerCase()}`;

    adicionarCelula(linha, ocorrencia.numero_linha);
    adicionarCelula(linha, ocorrencia.severidade, classe);
    adicionarCelula(linha, ocorrencia.campo);
    adicionarCelula(linha, ocorrencia.mensagem);
    adicionarCelula(linha, ocorrencia.valor_informado);
    adicionarCelula(linha, ocorrencia.valor_esperado);
    adicionarCelula(linha, ocorrencia.orientacao);
    vendasOcorrenciasTableBody.appendChild(linha);
  });
}

function renderizarPreviewLinhas(linhas) {
  vendasPreviewTableBody.innerHTML = "";

  linhas.forEach((item) => {
    const linha = document.createElement("tr");
    const lucs = Array.isArray(item.lucs_sistema)
      ? item.lucs_sistema
          .map((luc) =>
            luc.abl === null || luc.abl === undefined
              ? luc.luc
              : `${luc.luc} (${Number(luc.abl).toLocaleString("pt-BR")} m²)`
          )
          .join(", ")
      : "";

    adicionarCelula(linha, item.numero_linha);
    adicionarCelula(linha, item.contrato_informado);
    adicionarCelula(linha, item.shopping_informado);
    adicionarCelula(
      linha,
      item.shopping_sistema_id
        ? `${item.shopping_sistema_id} - ${item.shopping_sistema_nome}`
        : null
    );
    adicionarCelula(linha, lucs);
    adicionarCelula(linha, item.abl_informada_texto);
    adicionarCelula(linha, item.abl_total_sistema);
    adicionarCelula(
      linha,
      formatarMoedaVendas(item.vendas)
    );
    adicionarCelula(linha, item.resultado);
    vendasPreviewTableBody.appendChild(linha);
  });
}

function renderizarResultadoValidacao(resultado) {
  const importacao = resultado.importacao;
  importacaoVendasAtualId = Number(importacao.id);
  vendasImportacaoResultado.hidden = false;
  vendasImportacaoStatus.textContent =
    `Importação ${importacao.id}: ${importacao.status}.`;

  vendasValidacaoTotalLinhas.textContent =
    Number(importacao.total_linhas || 0).toLocaleString("pt-BR");
  vendasValidacaoTotalErros.textContent =
    Number(importacao.total_erros || 0).toLocaleString("pt-BR");
  vendasValidacaoTotalDivergencias.textContent =
    Number(importacao.total_divergencias || 0).toLocaleString("pt-BR");
  vendasValidacaoTotalVendas.textContent =
    formatarMoedaVendas(importacao.total_vendas);

  renderizarOcorrencias(resultado.ocorrencias || []);
  renderizarPreviewLinhas(resultado.linhas || []);

  baixarOcorrenciasVendasButton.disabled =
    !(resultado.ocorrencias || []).length;

  const permissaoVendas = obterPermissaoVendas();
  const podeConfirmar =
    importacao.status === "AGUARDANDO_CONFIRMACAO" &&
    permissaoVendas?.pode_criar;

  vendasConfirmacaoArea.hidden = !podeConfirmar;
  confirmarDivergenciasVendasInput.checked = false;
  confirmarImportacaoVendasButton.disabled = true;

  if (
    importacao.status === "AGUARDANDO_CONFIRMACAO" &&
    !permissaoVendas?.pode_criar
  ) {
    vendasImportacaoStatus.textContent +=
      " A carga está válida, mas a confirmação exige a permissão de criação.";
  }

  vendasImportacaoResultado.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

async function validarArquivoVendas() {
  if (!arquivoVendasSelecionado || !aceitarRegrasVendasInput.checked) {
    return;
  }

  validarArquivoVendasButton.disabled = true;
  selecionarArquivoVendasButton.disabled = true;
  validarArquivoVendasButton.textContent = "Validando...";

  try {
    const response = await fetch(
      "/api/vendas/importacoes/validar",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "X-File-Name": encodeURIComponent(
            arquivoVendasSelecionado.name
          ),
          "X-Rules-Accepted": "true",
        },
        body: arquivoVendasSelecionado,
      }
    );

    const resultado = await response
      .json()
      .catch(() => null);

    if (response.status === 401) {
      localStorage.removeItem("@portalGMV:token");
      localStorage.removeItem("@portalGMV:usuario");
      localStorage.removeItem("@portalGMV:permissoes");
      window.location.href = "/login";
      return;
    }

    if (resultado?.importacao && resultado?.linhas) {
      renderizarResultadoValidacao(resultado);
      await carregarHistoricoVendas();
    }

    if (!response.ok && !resultado?.importacao) {
      throw new Error(
        resultado?.message ||
          "Não foi possível validar o arquivo."
      );
    }
  } catch (error) {
    window.alert(error.message);
  } finally {
    selecionarArquivoVendasButton.disabled = false;
    validarArquivoVendasButton.textContent =
      "Validar arquivo";
    atualizarDisponibilidadeValidacao();
  }
}

async function baixarOcorrenciasVendas() {
  if (!importacaoVendasAtualId) return;

  try {
    const response = await fetch(
      `/api/vendas/importacoes/${importacaoVendasAtualId}/ocorrencias.xlsx`,
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
          "Não foi possível baixar as ocorrências."
      );
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      `ocorrencias-vendas-${importacaoVendasAtualId}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    window.alert(error.message);
  }
}

async function confirmarImportacaoVendas() {
  if (
    !importacaoVendasAtualId ||
    !confirmarDivergenciasVendasInput.checked
  ) {
    return;
  }

  confirmarImportacaoVendasButton.disabled = true;
  confirmarImportacaoVendasButton.textContent =
    "Confirmando...";

  try {
    const resultado = await apiRequest(
      `/vendas/importacoes/${importacaoVendasAtualId}/confirmar`,
      {
        method: "POST",
        body: JSON.stringify({
          confirmarDivergencias: true,
        }),
      }
    );

    window.alert(
      `Importação concluída. ${resultado.coberturasCriadas} ` +
        `cobertura(s) criada(s) e ${resultado.coberturasSubstituidas} ` +
        "substituída(s)."
    );

    window.location.href = "/vendas/relatorio";
  } catch (error) {
    window.alert(error.message);
    confirmarImportacaoVendasButton.disabled = false;
    confirmarImportacaoVendasButton.textContent =
      "Confirmar importação";
  }
}

async function inicializarImportacaoVendas() {
  if (!getToken()) {
    window.location.href = "/login";
    return;
  }

  await requireAuth();

  if (!getToken()) {
    return;
  }

  const permissaoVendas =
    obterPermissaoVendas();

  if (!permissaoVendas?.pode_criar) {
    window.alert(
      "Você não possui permissão para importar vendas."
    );

    window.location.href =
      "/vendas/relatorio";
    return;
  }

  await carregarHistoricoVendas();
}

voltarRelatorioVendasButton.addEventListener(
  "click",
  () => {
    window.location.href =
      "/vendas/relatorio";
  }
);

baixarModeloImportacaoButton.addEventListener(
  "click",
  baixarModeloImportacao
);

selecionarArquivoVendasButton.addEventListener(
  "click",
  () => arquivoVendasInput.click()
);

arquivoVendasInput.addEventListener(
  "change",
  tratarArquivoSelecionado
);

aceitarRegrasVendasInput.addEventListener(
  "change",
  atualizarDisponibilidadeValidacao
);

validarArquivoVendasButton.addEventListener(
  "click",
  validarArquivoVendas
);

baixarOcorrenciasVendasButton.addEventListener(
  "click",
  baixarOcorrenciasVendas
);

confirmarDivergenciasVendasInput.addEventListener(
  "change",
  () => {
    confirmarImportacaoVendasButton.disabled =
      !confirmarDivergenciasVendasInput.checked;
  }
);

confirmarImportacaoVendasButton.addEventListener(
  "click",
  confirmarImportacaoVendas
);

inicializarImportacaoVendas();
