const ExcelJS = require("exceljs");
const JSZip = require("jszip");
const {
  SHOPPINGS_VENDAS,
  resolverShoppingVendas,
} = require("../utils/vendas-shoppings");

const CABECALHOS_VENDAS = [
  "PERIODO",
  "DATA",
  "SHOPPING",
  "CONTRATO",
  "LOJA",
  "ABL",
  "CANAL",
  "VENDAS",
];

const CANAIS_VENDAS = new Set([
  "LOJA_FISICA",
  "ONLINE",
  "CONSOLIDADO",
]);

const MAXIMO_LINHAS_IMPORTACAO = 20000;
const DIFERENCA_NUMERICA_ACEITA = 0.01;

function normalizarTexto(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

function normalizarComparacao(valor) {
  return normalizarTexto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizarCabecalho(valor) {
  return normalizarComparacao(valor).replace(/\s+/g, "_");
}

function valorOriginalCelula(celula) {
  const valor = celula?.value;

  if (
    valor &&
    typeof valor === "object" &&
    Object.prototype.hasOwnProperty.call(valor, "formula")
  ) {
    return valor.result ?? celula.result ?? "";
  }

  if (valor && typeof valor === "object" && "text" in valor) {
    return valor.text;
  }

  return valor ?? "";
}

function celulaPossuiFormula(celula) {
  return Boolean(
    celula?.value &&
      typeof celula.value === "object" &&
      Object.prototype.hasOwnProperty.call(
        celula.value,
        "formula"
      )
  );
}

function textoParaAuditoria(valor) {
  if (valor instanceof Date) {
    const ano = valor.getUTCFullYear();
    const mes = String(valor.getUTCMonth() + 1).padStart(2, "0");
    const dia = String(valor.getUTCDate()).padStart(2, "0");
    return `${dia}/${mes}/${ano}`;
  }

  return normalizarTexto(valor);
}

function diasNoMes(periodoIso) {
  const [ano, mes] = periodoIso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function dataIso(ano, mes, dia) {
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }

  return [
    String(ano).padStart(4, "0"),
    String(mes).padStart(2, "0"),
    String(dia).padStart(2, "0"),
  ].join("-");
}

function interpretarData(valor) {
  if (valor === null || valor === undefined || valor === "") {
    return null;
  }

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return dataIso(
      valor.getUTCFullYear(),
      valor.getUTCMonth() + 1,
      valor.getUTCDate()
    );
  }

  if (typeof valor === "number" && Number.isFinite(valor)) {
    const dias = Math.floor(valor);
    const milissegundos = Date.UTC(1899, 11, 30) +
      dias * 24 * 60 * 60 * 1000;
    const data = new Date(milissegundos);

    return dataIso(
      data.getUTCFullYear(),
      data.getUTCMonth() + 1,
      data.getUTCDate()
    );
  }

  const texto = normalizarTexto(valor);
  let correspondencia = texto.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/
  );

  if (correspondencia) {
    return dataIso(
      Number(correspondencia[3]),
      Number(correspondencia[2]),
      Number(correspondencia[1])
    );
  }

  correspondencia = texto.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/
  );

  if (correspondencia) {
    return dataIso(
      Number(correspondencia[1]),
      Number(correspondencia[2]),
      Number(correspondencia[3])
    );
  }

  return null;
}

function primeiroDiaDoMes(dataIsoValor) {
  if (!dataIsoValor) return null;
  return `${dataIsoValor.slice(0, 7)}-01`;
}

function interpretarNumero(valor) {
  if (valor === null || valor === undefined || valor === "") {
    return null;
  }

  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : null;
  }

  let texto = normalizarTexto(valor)
    .replace(/R\$/gi, "")
    .replace(/\s/g, "");

  if (!texto) return null;

  if (texto.includes(",")) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  }

  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

function normalizarCanal(valor) {
  const canal = normalizarComparacao(valor)
    .replace(/[\s-]+/g, "_");

  return CANAIS_VENDAS.has(canal) ? canal : null;
}

function normalizarShoppingInformado(valor) {
  const texto = normalizarTexto(valor);
  const shopping = resolverShoppingVendas(texto);
  if (shopping) return shopping.id;

  const codigoInicial = texto.match(/^([0-9]+)(?:\s*-|$)/);
  return codigoInicial ? codigoInicial[1] : texto;
}

function criarOcorrencia({
  linha = null,
  severidade,
  codigo,
  campo = null,
  mensagem,
  valorInformado = null,
  valorEsperado = null,
  orientacao = null,
}) {
  return {
    numeroLinha: linha?.numeroLinha ?? null,
    contrato: linha?.contrato ||
      normalizarTexto(linha?.contratoInformado) ||
      null,
    periodo: linha?.periodo || null,
    severidade,
    codigo,
    campo,
    mensagem,
    valorInformado:
      valorInformado === null || valorInformado === undefined
        ? null
        : String(valorInformado),
    valorEsperado:
      valorEsperado === null || valorEsperado === undefined
        ? null
        : String(valorEsperado),
    orientacao,
  };
}

async function normalizarXlsxParaExcelJS(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const arquivosXml = Object.keys(zip.files).filter(
    (nome) => /^xl\/.*\.xml$/i.test(nome)
  );
  let normalizouNamespace = false;

  for (const nome of arquivosXml) {
    const arquivo = zip.file(nome);
    if (!arquivo) continue;

    const xml = await arquivo.async("string");
    const normalizado = xml
      .replace(
        /xmlns:x="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main"/g,
        'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
      )
      .replace(/<x:/g, "<")
      .replace(/<\/x:/g, "</");

    if (normalizado !== xml) {
      zip.file(nome, normalizado);
      normalizouNamespace = true;
    }
  }

  if (!normalizouNamespace) return buffer;

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}

async function lerArquivoVendas(buffer) {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer);
  } catch (error) {
    try {
      const bufferNormalizado = await normalizarXlsxParaExcelJS(buffer);
      if (bufferNormalizado === buffer) throw error;
      await workbook.xlsx.load(bufferNormalizado);
    } catch (erroNormalizacao) {
      const falha = new Error(
        "O arquivo não é um Excel .xlsx válido ou está corrompido."
      );
      falha.code = "ARQUIVO_XLSX_INVALIDO";
      falha.cause = erroNormalizacao || error;
      throw falha;
    }
  }

  const planilha = workbook.getWorksheet("Importação");

  if (!planilha) {
    const falha = new Error(
      'A planilha obrigatória "Importação" não foi encontrada.'
    );
    falha.code = "PLANILHA_IMPORTACAO_AUSENTE";
    throw falha;
  }

  const cabecalhos = CABECALHOS_VENDAS.map((_, indice) =>
    normalizarCabecalho(
      valorOriginalCelula(planilha.getCell(1, indice + 1))
    )
  );

  const cabecalhoValido = CABECALHOS_VENDAS.every(
    (esperado, indice) => cabecalhos[indice] === esperado
  );

  const possuiCabecalhoExtra = Array.from(
    { length: Math.max(planilha.actualColumnCount - CABECALHOS_VENDAS.length, 0) },
    (_, indice) =>
      valorOriginalCelula(
        planilha.getCell(1, CABECALHOS_VENDAS.length + indice + 1)
      )
  ).some((valor) => normalizarTexto(valor) !== "");

  if (!cabecalhoValido || possuiCabecalhoExtra) {
    const falha = new Error(
      "O cabeçalho da aba Importação foi alterado. Use o modelo oficial sem incluir, excluir ou reordenar colunas."
    );
    falha.code = "CABECALHO_INVALIDO";
    falha.cabecalhos = cabecalhos;
    throw falha;
  }

  const linhas = [];
  const ultimaLinha = planilha.actualRowCount;

  for (let numeroLinha = 2; numeroLinha <= ultimaLinha; numeroLinha += 1) {
    const linhaExcel = planilha.getRow(numeroLinha);
    const celulas = CABECALHOS_VENDAS.map((_, indice) =>
      linhaExcel.getCell(indice + 1)
    );
    const valores = celulas.map(valorOriginalCelula);

    if (valores.every((valor) => normalizarTexto(valor) === "")) {
      continue;
    }

    linhas.push({
      numeroLinha,
      periodoInformado: textoParaAuditoria(valores[0]),
      dataInformada: textoParaAuditoria(valores[1]),
      shoppingInformado: textoParaAuditoria(valores[2]),
      contratoInformado: textoParaAuditoria(valores[3]),
      lucInformada: "",
      lojaInformada: textoParaAuditoria(valores[4]),
      ablInformadaTexto: textoParaAuditoria(valores[5]),
      canalInformado: textoParaAuditoria(valores[6]),
      vendasInformadasTexto: textoParaAuditoria(valores[7]),
      valoresOriginais: valores,
      camposComFormula: celulas
        .map((celula, indice) =>
          celulaPossuiFormula(celula)
            ? CABECALHOS_VENDAS[indice]
            : null
        )
        .filter(Boolean),
    });

    if (linhas.length > MAXIMO_LINHAS_IMPORTACAO) {
      const falha = new Error(
        `O arquivo ultrapassa o limite de ${MAXIMO_LINHAS_IMPORTACAO} linhas de dados.`
      );
      falha.code = "LIMITE_LINHAS_EXCEDIDO";
      throw falha;
    }
  }

  if (!linhas.length) {
    const falha = new Error(
      "A aba Importação não possui linhas de dados."
    );
    falha.code = "ARQUIVO_SEM_DADOS";
    throw falha;
  }

  return linhas;
}

function adicionarOcorrencia(linha, ocorrencias, dados) {
  const ocorrencia = criarOcorrencia({ linha, ...dados });
  ocorrencias.push(ocorrencia);
  linha.ocorrencias.push(ocorrencia);
}

function validarLinhasVendas(
  linhasRecebidas,
  contratosOficiais,
  shoppingIdsPermitidos = null
) {
  const ocorrencias = [];
  let encontrouShoppingNaoAutorizado = false;
  const permitidos = Array.isArray(shoppingIdsPermitidos)
    ? new Set(shoppingIdsPermitidos.map(String))
    : null;

  const linhas = linhasRecebidas.map((recebida) => {
    const periodoOriginal = recebida.valoresOriginais[0];
    const dataOriginal = recebida.valoresOriginais[1];
    const periodoInterpretado = interpretarData(periodoOriginal);
    const dataVenda = interpretarData(dataOriginal);
    const contrato = normalizarTexto(recebida.contratoInformado);
    const canal = normalizarCanal(recebida.canalInformado);
    const vendas = interpretarNumero(recebida.valoresOriginais[7]);
    const ablInformada = interpretarNumero(recebida.valoresOriginais[5]);

    const linha = {
      ...recebida,
      periodo: primeiroDiaDoMes(periodoInterpretado),
      dataVenda,
      granularidade: normalizarTexto(recebida.dataInformada)
        ? "DIARIA"
        : "MENSAL",
      contrato,
      canal,
      vendas,
      ablInformada,
      shoppingSistemaId: null,
      shoppingSistemaNome: null,
      lojaSistema: null,
      lucsSistema: [],
      ablTotalSistema: null,
      autorizada: true,
      resultado: "VALIDA",
      ocorrencias: [],
    };

    if (recebida.camposComFormula.length) {
      adicionarOcorrencia(linha, ocorrencias, {
        severidade: "ERRO",
        codigo: "FORMULA_NAO_PERMITIDA",
        campo: recebida.camposComFormula.join(", "),
        mensagem: "A linha possui fórmula. A importação aceita somente valores de célula.",
        orientacao: "Substitua as fórmulas pelos valores calculados antes de importar.",
      });
    }

    if (!normalizarTexto(recebida.periodoInformado)) {
      adicionarOcorrencia(linha, ocorrencias, {
        severidade: "ERRO",
        codigo: "PERIODO_OBRIGATORIO",
        campo: "PERIODO",
        mensagem: "O período é obrigatório.",
        orientacao: "Informe o primeiro dia do mês, por exemplo 01/01/2026.",
      });
    } else if (!periodoInterpretado) {
      adicionarOcorrencia(linha, ocorrencias, {
        severidade: "ERRO",
        codigo: "PERIODO_INVALIDO",
        campo: "PERIODO",
        mensagem: "O período informado não é uma data válida.",
        valorInformado: recebida.periodoInformado,
        orientacao: "Informe o primeiro dia do mês em um formato de data válido.",
      });
    } else if (!periodoInterpretado.endsWith("-01")) {
      adicionarOcorrencia(linha, ocorrencias, {
        severidade: "ERRO",
        codigo: "PERIODO_NAO_INICIA_MES",
        campo: "PERIODO",
        mensagem: "O período deve representar o primeiro dia do mês.",
        valorInformado: recebida.periodoInformado,
        valorEsperado: linha.periodo,
        orientacao: "Use o dia 01 para identificar a competência.",
      });
    }

    if (normalizarTexto(recebida.dataInformada) && !dataVenda) {
      adicionarOcorrencia(linha, ocorrencias, {
        severidade: "ERRO",
        codigo: "DATA_INVALIDA",
        campo: "DATA",
        mensagem: "A data diária informada não é válida.",
        valorInformado: recebida.dataInformada,
      });
    }

    if (
      dataVenda &&
      linha.periodo &&
      primeiroDiaDoMes(dataVenda) !== linha.periodo
    ) {
      adicionarOcorrencia(linha, ocorrencias, {
        severidade: "ERRO",
        codigo: "DATA_FORA_DO_PERIODO",
        campo: "DATA",
        mensagem: "A data não pertence ao período informado.",
        valorInformado: recebida.dataInformada,
        valorEsperado: linha.periodo,
      });
    }

    if (!normalizarTexto(recebida.shoppingInformado)) {
      adicionarOcorrencia(linha, ocorrencias, {
        severidade: "ERRO",
        codigo: "SHOPPING_OBRIGATORIO",
        campo: "SHOPPING",
        mensagem: "O shopping é obrigatório.",
      });
    }

    if (!contrato) {
      adicionarOcorrencia(linha, ocorrencias, {
        severidade: "ERRO",
        codigo: "CONTRATO_OBRIGATORIO",
        campo: "CONTRATO",
        mensagem: "O contrato é obrigatório.",
      });
    }

    if (!canal) {
      adicionarOcorrencia(linha, ocorrencias, {
        severidade: "ERRO",
        codigo: "CANAL_INVALIDO",
        campo: "CANAL",
        mensagem: "O canal informado é inválido.",
        valorInformado: recebida.canalInformado,
        valorEsperado: "LOJA_FISICA, ONLINE ou CONSOLIDADO",
      });
    }

    if (vendas === null) {
      adicionarOcorrencia(linha, ocorrencias, {
        severidade: "ERRO",
        codigo: "VENDAS_INVALIDAS",
        campo: "VENDAS",
        mensagem: "O valor de vendas é obrigatório e deve ser numérico.",
        valorInformado: recebida.vendasInformadasTexto,
      });
    }

    if (
      normalizarTexto(recebida.ablInformadaTexto) &&
      ablInformada === null
    ) {
      adicionarOcorrencia(linha, ocorrencias, {
        severidade: "DIVERGENCIA",
        codigo: "ABL_INFORMADA_INVALIDA",
        campo: "ABL",
        mensagem: "A ABL informada não pôde ser comparada porque não é numérica.",
        valorInformado: recebida.ablInformadaTexto,
      });
    }

    const oficial = contratosOficiais.get(contrato);

    if (contrato && !oficial) {
      adicionarOcorrencia(linha, ocorrencias, {
        severidade: "ERRO",
        codigo: "CONTRATO_INEXISTENTE",
        campo: "CONTRATO",
        mensagem: "O contrato não foi encontrado no cadastro oficial.",
        valorInformado: contrato,
      });
    } else if (oficial?.multiplosShoppings) {
      adicionarOcorrencia(linha, ocorrencias, {
        severidade: "ERRO",
        codigo: "CONTRATO_MULTIPLOS_SHOPPINGS",
        campo: "CONTRATO",
        mensagem: "O contrato está associado a mais de um shopping no cadastro oficial.",
        valorInformado: contrato,
        orientacao: "Corrija o cadastro mestre antes de importar.",
      });
    } else if (oficial) {
      linha.shoppingSistemaId = oficial.shoppingId;
      linha.shoppingSistemaNome = oficial.shoppingNome;
      linha.lojaSistema = oficial.lojaSistema;
      linha.lucsSistema = oficial.lucs;
      linha.ablTotalSistema = oficial.ablTotal;

      const shoppingInformado = normalizarShoppingInformado(
        recebida.shoppingInformado
      );
      const shoppingInformadoReconhecido = resolverShoppingVendas(
        recebida.shoppingInformado
      );

      if (
        normalizarTexto(recebida.shoppingInformado) &&
        !shoppingInformadoReconhecido
      ) {
        adicionarOcorrencia(linha, ocorrencias, {
          severidade: "ERRO",
          codigo: "SHOPPING_INVALIDO",
          campo: "SHOPPING",
          mensagem: "O shopping informado não pertence à lista padronizada.",
          valorInformado: recebida.shoppingInformado,
          valorEsperado: SHOPPINGS_VENDAS.map((item) => item.nome).join(", "),
          orientacao: "Selecione um dos shoppings disponíveis no modelo oficial.",
        });
      }

      if (
        permitidos &&
        shoppingInformado &&
        !permitidos.has(shoppingInformado)
      ) {
        linha.autorizada = false;
        encontrouShoppingNaoAutorizado = true;
        adicionarOcorrencia(linha, ocorrencias, {
          severidade: "ERRO",
          codigo: "SHOPPING_INFORMADO_NAO_AUTORIZADO",
          campo: "SHOPPING",
          mensagem: "A carga contém shopping não autorizado para o usuário.",
          orientacao: "Remova o shopping não autorizado e envie uma nova carga.",
        });
      }

      if (permitidos && !permitidos.has(oficial.shoppingId)) {
        linha.autorizada = false;
        encontrouShoppingNaoAutorizado = true;
        adicionarOcorrencia(linha, ocorrencias, {
          severidade: "ERRO",
          codigo: "SHOPPING_CONTRATO_NAO_AUTORIZADO",
          campo: "CONTRATO",
          mensagem: "A carga contém contrato de shopping não autorizado para o usuário.",
          orientacao: "Remova o contrato não autorizado e envie uma nova carga.",
        });
      }

      if (
        shoppingInformado &&
        shoppingInformado !== oficial.shoppingId
      ) {
        adicionarOcorrencia(linha, ocorrencias, {
          severidade: "DIVERGENCIA",
          codigo: "SHOPPING_DIVERGENTE",
          campo: "SHOPPING",
          mensagem: "O shopping informado diverge do shopping encontrado pelo contrato.",
          valorInformado: recebida.shoppingInformado,
          valorEsperado: `${oficial.shoppingId} - ${oficial.shoppingNome}`,
          orientacao: "O dado oficial do contrato será utilizado.",
        });
      }

      const lojaInformada = normalizarComparacao(
        recebida.lojaInformada
      );
      const lojaSistema = normalizarComparacao(
        oficial.lojaSistema
      );

      if (lojaInformada && lojaSistema && lojaInformada !== lojaSistema) {
        adicionarOcorrencia(linha, ocorrencias, {
          severidade: "DIVERGENCIA",
          codigo: "LOJA_DIVERGENTE",
          campo: "LOJA",
          mensagem: "A loja informada diverge do cadastro oficial.",
          valorInformado: recebida.lojaInformada,
          valorEsperado: oficial.lojaSistema,
          orientacao: "O nome oficial disponível será utilizado.",
        });
      }

      let ablEsperada = oficial.ablTotal;

      if (oficial.lucs.length === 1) {
        ablEsperada = oficial.lucs[0].abl;
      }

      if (!normalizarTexto(recebida.ablInformadaTexto)) {
        adicionarOcorrencia(linha, ocorrencias, {
          severidade: "DIVERGENCIA",
          codigo: "ABL_NAO_INFORMADA",
          campo: "ABL",
          mensagem: "A ABL não foi informada.",
          valorEsperado: ablEsperada,
          orientacao: "A ABL oficial do contrato será utilizada.",
        });
      } else if (
        ablInformada !== null &&
        ablEsperada !== null &&
        Math.abs(ablInformada - ablEsperada) >
          DIFERENCA_NUMERICA_ACEITA
      ) {
        adicionarOcorrencia(linha, ocorrencias, {
          severidade: "DIVERGENCIA",
          codigo: "ABL_DIVERGENTE",
          campo: "ABL",
          mensagem: "A ABL informada diverge da ABL oficial aplicável.",
          valorInformado: ablInformada,
          valorEsperado: ablEsperada,
          orientacao: "A ABL oficial do contrato será utilizada.",
        });
      }
    }

    return linha;
  });

  const gruposPorCobertura = new Map();
  const gruposPorContratoPeriodo = new Map();

  for (const linha of linhas) {
    if (!linha.contrato || !linha.periodo || !linha.canal) continue;

    const chaveCobertura = [
      linha.contrato,
      linha.periodo,
      linha.canal,
    ].join("|");

    const chaveContratoPeriodo = [
      linha.contrato,
      linha.periodo,
    ].join("|");

    if (!gruposPorCobertura.has(chaveCobertura)) {
      gruposPorCobertura.set(chaveCobertura, []);
    }

    if (!gruposPorContratoPeriodo.has(chaveContratoPeriodo)) {
      gruposPorContratoPeriodo.set(chaveContratoPeriodo, []);
    }

    gruposPorCobertura.get(chaveCobertura).push(linha);
    gruposPorContratoPeriodo.get(chaveContratoPeriodo).push(linha);
  }

  for (const grupo of gruposPorCobertura.values()) {
    const granularidades = new Set(
      grupo.map((linha) => linha.granularidade)
    );

    if (granularidades.size > 1) {
      for (const linha of grupo) {
        adicionarOcorrencia(linha, ocorrencias, {
          severidade: "ERRO",
          codigo: "MENSAL_DIARIO_MISTURADOS",
          campo: "DATA",
          mensagem: "Existem valores mensais e diários para o mesmo contrato, período e canal.",
          orientacao: "Escolha uma única granularidade para a cobertura.",
        });
      }
      continue;
    }

    if (grupo[0].granularidade === "MENSAL") {
      if (grupo.length > 1) {
        for (const linha of grupo) {
          adicionarOcorrencia(linha, ocorrencias, {
            severidade: "ERRO",
            codigo: "LINHA_MENSAL_DUPLICADA",
            campo: "CONTRATO",
            mensagem: "A cobertura mensal aparece mais de uma vez no arquivo.",
          });
        }
      }
      continue;
    }

    const datas = new Map();

    for (const linha of grupo) {
      if (!linha.dataVenda) continue;
      if (!datas.has(linha.dataVenda)) datas.set(linha.dataVenda, []);
      datas.get(linha.dataVenda).push(linha);
    }

    for (const linhasDaData of datas.values()) {
      if (linhasDaData.length <= 1) continue;

      for (const linha of linhasDaData) {
        adicionarOcorrencia(linha, ocorrencias, {
          severidade: "ERRO",
          codigo: "DATA_DIARIA_DUPLICADA",
          campo: "DATA",
          mensagem: "A mesma data aparece mais de uma vez na cobertura diária.",
          valorInformado: linha.dataInformada,
        });
      }
    }

    const periodo = grupo[0].periodo;
    const quantidadeDias = diasNoMes(periodo);
    const datasAusentes = [];

    for (let dia = 1; dia <= quantidadeDias; dia += 1) {
      const dataEsperada = `${periodo.slice(0, 8)}${String(dia).padStart(2, "0")}`;
      if (!datas.has(dataEsperada)) datasAusentes.push(dataEsperada);
    }

    if (datasAusentes.length) {
      const linha = grupo[0];
      adicionarOcorrencia(linha, ocorrencias, {
        severidade: "ERRO",
        codigo: "DIAS_AUSENTES",
        campo: "DATA",
        mensagem: `A cobertura diária não contém todos os dias do mês. Faltam ${datasAusentes.length} dia(s).`,
        valorEsperado: datasAusentes.join(", "),
        orientacao: "Inclua todos os dias e informe zero quando não houver vendas.",
      });
    }
  }

  for (const grupo of gruposPorContratoPeriodo.values()) {
    const canais = new Set(grupo.map((linha) => linha.canal));
    const conflito =
      canais.has("CONSOLIDADO") &&
      (canais.has("LOJA_FISICA") || canais.has("ONLINE"));

    if (!conflito) continue;

    for (const linha of grupo) {
      adicionarOcorrencia(linha, ocorrencias, {
        severidade: "ERRO",
        codigo: "CONSOLIDADO_COM_COMPONENTES",
        campo: "CANAL",
        mensagem: "O canal CONSOLIDADO não pode coexistir com LOJA_FISICA ou ONLINE para o mesmo contrato e período.",
      });
    }
  }

  for (const linha of linhas) {
    const severidades = new Set(
      linha.ocorrencias.map((item) => item.severidade)
    );

    linha.resultado = severidades.has("ERRO")
      ? "ERRO"
      : severidades.has("DIVERGENCIA")
        ? "DIVERGENCIA"
        : "VALIDA";
  }

  const totalErros = ocorrencias.filter(
    (item) => item.severidade === "ERRO"
  ).length;
  const totalDivergencias = ocorrencias.filter(
    (item) => item.severidade === "DIVERGENCIA"
  ).length;
  const totalAvisos = ocorrencias.filter(
    (item) => item.severidade === "AVISO"
  ).length;

  return {
    linhas,
    ocorrencias,
    encontrouShoppingNaoAutorizado,
    totalLinhas: linhas.length,
    totalVendas: linhas.reduce(
      (total, linha) => total + (linha.vendas ?? 0),
      0
    ),
    totalErros,
    totalDivergencias,
    totalAvisos,
    status: encontrouShoppingNaoAutorizado
      ? "REJEITADA"
      : totalErros
        ? "COM_ERROS"
        : "AGUARDANDO_CONFIRMACAO",
  };
}

module.exports = {
  CABECALHOS_VENDAS,
  CANAIS_VENDAS,
  MAXIMO_LINHAS_IMPORTACAO,
  interpretarData,
  interpretarNumero,
  lerArquivoVendas,
  normalizarXlsxParaExcelJS,
  normalizarCanal,
  normalizarShoppingInformado,
  normalizarTexto,
  validarLinhasVendas,
};
