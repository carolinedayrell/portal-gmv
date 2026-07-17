const test = require("node:test");
const assert = require("node:assert/strict");
const {
  filtrarBasePorEscopo,
} = require("../src/services/faturamento-shopping-scope.service");

const base = [
  { idlancamento: "1", shopping_id: "3" },
  { idlancamento: "2", shopping_id: "17" },
  { idlancamento: "3", shopping_id: "31" },
  { idlancamento: "4", shopping_id: "32" },
];

test("MESTRE mantém acesso a todos os shoppings", () => {
  assert.deepEqual(filtrarBasePorEscopo(base, null), base);
});

test("GERENTE_CSC mantém acesso a todos os shoppings", () => {
  assert.deepEqual(filtrarBasePorEscopo(base, null), base);
});

test("GERENTE_SHOPPING recebe somente os shoppings vinculados", () => {
  assert.deepEqual(
    filtrarBasePorEscopo(base, ["31", "32"]).map(
      (item) => item.shopping_id
    ),
    ["31", "32"]
  );
});

test("shopping informado manualmente não amplia o escopo", () => {
  const baseAutorizada = filtrarBasePorEscopo(base, ["31"]);
  const solicitado = baseAutorizada.filter(
    (item) => item.shopping_id === "17"
  );

  assert.deepEqual(solicitado, []);
});

test("GERENTE_SHOPPING sem vínculos não recebe dados", () => {
  assert.deepEqual(filtrarBasePorEscopo(base, []), []);
});
