const SHOPPINGS_VENDAS = Object.freeze([
  {
    id: "31",
    nome: "BH OUTLET",
    aliases: [
      "BH OUTLET EMPREENDIMENTOS LTDA",
      "BH OUTLET",
    ],
  },
  {
    id: "1",
    nome: "OIAPOQUE BH",
    aliases: [
      "SHOPPING OIAPOQUE CENTRO",
      "OIAPOQUE BH",
    ],
  },
  {
    id: "13",
    nome: "OIAPOQUE CONTAGEM",
    aliases: [
      "SHOPPING OIAPOQUE CONTAGEM",
      "OIAPOQUE CONTAGEM",
    ],
  },
  {
    id: "3",
    nome: "SÓ MARCAS CONTAGEM",
    aliases: [
      "SHOPPING SO MARCAS OUTLET CONTAGEM",
      "SHOPPING SÓ MARCAS OUTLET CONTAGEM",
      "SÓ MARCAS CONTAGEM",
    ],
  },
  {
    id: "17",
    nome: "SÓ MARCAS GUARULHOS",
    aliases: [
      "SHOPPING SO MARCAS OUTLET GUARULHOS",
      "SHOPPING SÓ MARCAS OUTLET GUARULHOS",
      "SÓ MARCAS GUARULHOS",
    ],
  },
  {
    id: "8",
    nome: "SHOPPING DO AVIÃO",
    aliases: [
      "SHOPPING SÓ MARCAS AUTO E POWER SHOPPING",
      "SHOPPING SO MARCAS AUTO E POWER SHOPPING",
      "SÓ MARCAS AUTO E POWER SHOPPING",
      "SO MARCAS AUTO E POWER SHOPPING",
      "SHOPPING DO AVIÃO",
      "SHOPPING DO AVIAO",
    ],
  },
]);

function normalizarNomeShopping(valor) {
  return String(valor ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

const SHOPPINGS_POR_ID = new Map(
  SHOPPINGS_VENDAS.map((shopping) => [shopping.id, shopping])
);

const SHOPPINGS_POR_NOME = new Map();

for (const shopping of SHOPPINGS_VENDAS) {
  for (const nome of [shopping.nome, ...shopping.aliases]) {
    SHOPPINGS_POR_NOME.set(normalizarNomeShopping(nome), shopping);
  }
}

function resolverShoppingVendas(valor) {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;

  const codigoInicial = texto.match(/^([0-9]+)(?:\s*-|$)/);
  if (codigoInicial) {
    return SHOPPINGS_POR_ID.get(codigoInicial[1]) || null;
  }

  return SHOPPINGS_POR_NOME.get(normalizarNomeShopping(texto)) || null;
}

function nomePadraoShopping(id, nomeAlternativo = null) {
  return SHOPPINGS_POR_ID.get(String(id))?.nome || nomeAlternativo;
}

module.exports = {
  SHOPPINGS_VENDAS,
  idsShoppingsVendas: () => SHOPPINGS_VENDAS.map(({ id }) => id),
  nomePadraoShopping,
  normalizarNomeShopping,
  resolverShoppingVendas,
};
