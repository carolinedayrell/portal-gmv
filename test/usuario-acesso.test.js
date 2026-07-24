const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizarShoppingIds,
  podeAlterarUsuario,
  podeConcederPerfil,
  podeGerenciarUsuarios,
  senhaAtendePolitica,
  sessaoEstaAtiva,
} = require("../src/services/usuario-acesso.service");

test("somente Mestre e Gerente CSC gerenciam usuarios", () => {
  assert.equal(podeGerenciarUsuarios("MESTRE"), true);
  assert.equal(podeGerenciarUsuarios("GERENTE_CSC"), true);
  assert.equal(podeGerenciarUsuarios("GERENTE_SHOPPING"), false);
});

test("Mestre pode conceder todos os perfis validos", () => {
  assert.equal(podeConcederPerfil("MESTRE", "MESTRE"), true);
  assert.equal(podeConcederPerfil("MESTRE", "GERENTE_CSC"), true);
  assert.equal(podeConcederPerfil("MESTRE", "GERENTE_SHOPPING"), true);
});

test("Gerente CSC nao pode conceder perfil Mestre", () => {
  assert.equal(
    podeConcederPerfil("GERENTE_CSC", "MESTRE"),
    false
  );
  assert.equal(
    podeConcederPerfil("GERENTE_CSC", "GERENTE_CSC"),
    true
  );
  assert.equal(
    podeConcederPerfil("GERENTE_CSC", "GERENTE_SHOPPING"),
    true
  );
});

test("Gerente CSC nao pode alterar usuario Mestre", () => {
  assert.equal(
    podeAlterarUsuario(
      "GERENTE_CSC",
      "MESTRE",
      "GERENTE_SHOPPING"
    ),
    false
  );
});

test("IDs de shopping sao expandidos, limpos e deduplicados", () => {
  assert.deepEqual(
    normalizarShoppingIds(["31,32", "32", " 33 "]),
    ["31", "32", "33"]
  );
});

test("politica de senha exige seis caracteres, maiuscula e minuscula", () => {
  assert.equal(senhaAtendePolitica("SenhaA"), true);
  assert.equal(senhaAtendePolitica("Abcdef"), true);
  assert.equal(senhaAtendePolitica("Ab1@cd"), true);
  assert.equal(senhaAtendePolitica("abcde"), false);
  assert.equal(senhaAtendePolitica("abcdef"), false);
  assert.equal(senhaAtendePolitica("ABCDEF"), false);
});

test("sessao exige usuario aprovado, ativo e mesma versao", () => {
  const usuario = {
    ativo: true,
    status_cadastro: "APROVADO",
    perfil: "GERENTE_CSC",
    versao_sessao: 4,
  };

  assert.equal(
    sessaoEstaAtiva({ versaoSessao: 4 }, usuario),
    true
  );
  assert.equal(
    sessaoEstaAtiva({ versaoSessao: 3 }, usuario),
    false
  );
  assert.equal(
    sessaoEstaAtiva(
      { versaoSessao: 4 },
      { ...usuario, ativo: false }
    ),
    false
  );
  assert.equal(
    sessaoEstaAtiva(
      { versaoSessao: 4 },
      { ...usuario, perfil: "MESTRE", status_cadastro: "BLOQUEADO" }
    ),
    false
  );
});
