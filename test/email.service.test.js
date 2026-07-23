const test = require("node:test");
const assert = require("node:assert/strict");
const {
  criarRemetente,
} = require("../src/services/email.service");

test("remetente usa sempre o mesmo endereco autenticado no SMTP", () => {
  assert.deepEqual(
    criarRemetente(
      "power@gpmv.com.br",
      '"Portal GMV <power@gpmv.com.br>"'
    ),
    {
      name: "Portal GMV",
      address: "power@gpmv.com.br",
    }
  );

  assert.deepEqual(
    criarRemetente(
      "power@gpmv.com.br",
      "Outro nome <outra-conta@gpmv.com.br>"
    ),
    {
      name: "Outro nome",
      address: "power@gpmv.com.br",
    }
  );
});

test("remetente sem nome usa diretamente o SMTP_USER", () => {
  assert.equal(
    criarRemetente("power@gpmv.com.br", ""),
    "power@gpmv.com.br"
  );
});
