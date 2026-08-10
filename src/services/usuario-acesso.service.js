const PERFIS_VALIDOS = new Set([
  "MESTRE",
  "GERENTE_CSC",
  "GERENTE_SHOPPING",
]);

const PERFIS_GERENCIADORES = new Set([
  "MESTRE",
  "GERENTE_CSC",
]);

function normalizarPerfil(perfil) {
  return String(perfil || "").trim().toUpperCase();
}

function podeGerenciarUsuarios(perfil) {
  return PERFIS_GERENCIADORES.has(normalizarPerfil(perfil));
}

function podeConcederPerfil(perfilGerenciador, perfilDestino) {
  const gerenciador = normalizarPerfil(perfilGerenciador);
  const destino = normalizarPerfil(perfilDestino);

  if (!PERFIS_VALIDOS.has(destino)) return false;
  if (gerenciador === "MESTRE") return true;

  return (
    gerenciador === "GERENTE_CSC" &&
    destino !== "MESTRE"
  );
}

function podeAlterarUsuario(
  perfilGerenciador,
  perfilAtual,
  perfilDestino
) {
  const gerenciador = normalizarPerfil(perfilGerenciador);
  const atual = normalizarPerfil(perfilAtual);

  if (!podeConcederPerfil(gerenciador, perfilDestino)) {
    return false;
  }

  return !(gerenciador === "GERENTE_CSC" && atual === "MESTRE");
}

function normalizarShoppingIds(shoppingIds) {
  if (!Array.isArray(shoppingIds)) return [];

  return [
    ...new Set(
      shoppingIds
        .flatMap((grupo) => String(grupo).split(","))
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
}

function normalizarTelefone(valor) {
  const bruto = String(valor || "").trim();

  if (!bruto || !/^[0-9()+.\-\s]+$/.test(bruto)) {
    return null;
  }

  let digitos = bruto.replace(/\D/g, "");

  // Permite colar número com +55, mas não o armazena.
  if (digitos.length === 13 && digitos.startsWith("55")) {
    digitos = digitos.slice(2);
  }

  if (!/^[1-9][0-9]9[0-9]{8}$/.test(digitos)) {
    return null;
  }

  return digitos;
}

function perfilEhMestre(perfil) {
  return normalizarPerfil(perfil) === "MESTRE";
}

function senhaAtendePolitica(senha) {
  const valor = String(senha || "");

  return (
    valor.length >= 6 &&
    /[a-z]/.test(valor) &&
    /[A-Z]/.test(valor)
  );
}

function sessaoEstaAtiva(decoded, usuario) {
  if (
    !decoded ||
    !usuario ||
    !usuario.ativo ||
    usuario.status_cadastro !== "APROVADO" ||
    !usuario.perfil
  ) {
    return false;
  }

  return (
    Number.isInteger(Number(decoded.versaoSessao)) &&
    Number(decoded.versaoSessao) === Number(usuario.versao_sessao)
  );
}

module.exports = {
  PERFIS_VALIDOS,
  normalizarPerfil,
  normalizarShoppingIds,
  normalizarTelefone,
  perfilEhMestre,
  podeAlterarUsuario,
  podeConcederPerfil,
  podeGerenciarUsuarios,
  senhaAtendePolitica,
  sessaoEstaAtiva,
};