let paginaAtual = 1;
let usuariosCache = [];
let modoFormularioUsuario = "edicao";

const limitePorPagina = 25;
const usuarioLogado = JSON.parse(
  localStorage.getItem("@portalGMV:usuario") || "null"
);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatarData(value) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatarTelefone(value) {
  const telefone = String(value || "");

  if (!/^[0-9]{11}$/.test(telefone)) {
    return telefone || "-";
  }

  return telefone.replace(
    /^([0-9]{2})([0-9]{5})([0-9]{4})$/,
    "($1) $2-$3"
  );
}

function formatarStatus(status) {
  const nomes = {
    AGUARDANDO_APROVACAO: "Aguardando aprovação",
    APROVADO: "Aprovado",
    REJEITADO: "Rejeitado",
    BLOQUEADO: "Bloqueado",
  };

  return nomes[status] || status || "-";
}

function formatarShopping(usuario) {
  if (usuario.status_cadastro === "AGUARDANDO_APROVACAO") {
    return usuario.shopping_solicitado_nome || "-";
  }

  if (
    usuario.perfil === "MESTRE" ||
    usuario.perfil === "GERENTE_CSC"
  ) {
    return "Todos os shoppings";
  }

  return usuario.shoppings || "Sem vínculo";
}

function usuarioPodeSerEditado(usuario) {
  return !(
    usuarioLogado?.perfil === "GERENTE_CSC" &&
    usuario.perfil === "MESTRE"
  );
}

function renderizarAcoes(usuario) {
  const id = Number(usuario.id);

  if (usuario.status_cadastro === "AGUARDANDO_APROVACAO") {
    return `
      <div class="inline-actions">
        <button
          type="button"
          class="table-action"
          onclick="abrirAprovacao(${id})"
        >
          Aprovar
        </button>
        <button
          type="button"
          class="table-action danger-action"
          onclick="abrirRejeicao(${id})"
        >
          Rejeitar
        </button>
      </div>
    `;
  }

  if (usuario.status_cadastro !== "APROVADO") {
    return usuario.motivo_rejeicao
      ? `<span title="${escapeHtml(usuario.motivo_rejeicao)}">Ver motivo</span>`
      : "-";
  }

  if (!usuarioPodeSerEditado(usuario)) {
    return "Somente Mestre";
  }

  const reenviar =
    usuario.primeiro_acesso
      ? `
        <button
          type="button"
          class="table-action secondary-action"
          onclick="reenviarConvite(${id})"
        >
          Reenviar convite
        </button>
      `
      : "";
  const redefinirSenha =
  usuarioLogado?.perfil === "MESTRE"
    ? `
      <button
        type="button"
        class="table-action secondary-action"
        onclick="abrirSenhaProvisoria(${id})"
      >
        Redefinir senha
      </button>
    `
    : "";
  return `
    <div class="inline-actions">
      <button
        type="button"
        class="table-action"
        onclick="editarUsuario(${id})"
      >
        Editar
      </button>
      ${reenviar}
      ${redefinirSenha}
    </div>
  `;



}

function preencherSelect(select, itens) {
  for (const item of itens) {
    const option = document.createElement("option");
    option.value = item.id ?? item;
    option.textContent = item.nome ?? item;
    select.appendChild(option);
  }
}

async function carregarOpcoes() {
  const { perfis, shoppings } = await apiRequest("/usuarios/opcoes");

  preencherSelect(
    document.getElementById("perfilFiltro"),
    perfis
  );
  preencherSelect(
    document.getElementById("perfilInput"),
    perfis
  );
  preencherSelect(
    document.getElementById("aprovacaoPerfilInput"),
    perfis
  );
  preencherSelect(
    document.getElementById("shoppingsInput"),
    shoppings
  );
  preencherSelect(
    document.getElementById("aprovacaoShoppingsInput"),
    shoppings
  );
}

async function carregarUsuarios() {
  const tbody = document.getElementById("usuariosTableBody");
  const mensagem = document.getElementById("paginaMensagem");
  const params = new URLSearchParams({
    page: paginaAtual,
    limit: limitePorPagina,
  });

  const filtros = {
    busca: document.getElementById("buscaInput").value.trim(),
    perfil: document.getElementById("perfilFiltro").value,
    status: document.getElementById("statusFiltro").value,
    ativo: document.getElementById("ativoFiltro").value,
  };

  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor) params.set(chave, valor);
  }

  mensagem.textContent = "";

  try {
    const response = await apiRequest(
      `/usuarios?${params.toString()}`
    );

    usuariosCache = response.data;

    if (!usuariosCache.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8">Nenhum usuário encontrado.</td>
        </tr>
      `;
    } else {
      tbody.innerHTML = usuariosCache
        .map(
          (usuario) => `
            <tr>
              <td>${escapeHtml(usuario.nome)}</td>
              <td>${escapeHtml(usuario.email)}</td>
              <td>
  ${escapeHtml(
    formatarTelefone(usuario.telefone)
  )}
</td>
              <td>${escapeHtml(usuario.perfil || "-")}</td>
              <td title="${escapeHtml(formatarShopping(usuario))}">
                ${escapeHtml(formatarShopping(usuario))}
              </td>
              <td title="Solicitado em ${escapeHtml(formatarData(usuario.solicitado_em))}">
                ${escapeHtml(formatarStatus(usuario.status_cadastro))}
              </td>
              <td>${
                usuario.ativo
                  ? usuario.primeiro_acesso
                    ? "Ativo — aguardando senha"
                    : "Ativo"
                  : "Inativo"
              }</td>
              <td>${renderizarAcoes(usuario)}</td>
            </tr>
          `
        )
        .join("");
    }

    const pagination = response.pagination;
    document.getElementById("paginaInfo").textContent =
      `Página ${pagination.page} de ${pagination.totalPages || 1}`;
    document.getElementById("paginaAnteriorButton").disabled =
      pagination.page <= 1;
    document.getElementById("proximaPaginaButton").disabled =
      pagination.page >= pagination.totalPages;
  } catch (error) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">${escapeHtml(error.message)}</td>
      </tr>
    `;
  }
}

function selecionarShoppings(selectId, shoppingIds) {
  const ids = (shoppingIds || []).map(String);

  for (const option of document.getElementById(selectId).options) {
    const idsDaOpcao = String(option.value).split(",");
    option.selected = idsDaOpcao.some((id) => ids.includes(id));
  }
}

function obterShoppingsSelecionados(selectId) {
  return Array.from(
    document.getElementById(selectId).selectedOptions
  ).map((option) => option.value);
}

function atualizarVisibilidadeShoppings(perfilId, grupoId) {
  const perfil = document.getElementById(perfilId).value;
  document.getElementById(grupoId).hidden =
    perfil !== "GERENTE_SHOPPING";
}

function fecharModal(modalId, formId, mensagemId) {
  document.getElementById(modalId).hidden = true;
  document.getElementById(formId).reset();
  document.getElementById(mensagemId).textContent = "";
}

function abrirNovoUsuario() {
  modoFormularioUsuario = "criacao";

  document.getElementById(
    "usuarioForm"
  ).reset();

  document.getElementById(
    "usuarioIdInput"
  ).value = "";

  document.getElementById(
    "usuarioModalTitulo"
  ).textContent = "Novo usuário";

  document.getElementById(
    "salvarUsuarioButton"
  ).textContent = "Criar usuário";

  document.getElementById(
    "senhaProvisoriaGroup"
  ).hidden = false;

  document.getElementById(
    "senhaProvisoriaInput"
  ).required = true;

  document.getElementById(
    "confirmacaoSenhaInput"
  ).required = true;

  document.getElementById(
    "ativoInput"
  ).value = "true";

  document.getElementById(
    "usuarioModal"
  ).hidden = false;

  atualizarVisibilidadeShoppings(
  "perfilInput",
  "edicaoShoppingsGroup"
);
}

function editarUsuario(usuarioId) {
  const usuario = usuariosCache.find(
    (item) => Number(item.id) === Number(usuarioId)
  );

  if (!usuario || !usuarioPodeSerEditado(usuario)) return;

  document.getElementById("usuarioIdInput").value = usuario.id;
  document.getElementById("nomeInput").value = usuario.nome;
  document.getElementById("emailInput").value = usuario.email;
  document.getElementById("perfilInput").value = usuario.perfil;
  document.getElementById("ativoInput").value = String(usuario.ativo);
  selecionarShoppings("shoppingsInput", usuario.shopping_ids);
  atualizarVisibilidadeShoppings(
    "perfilInput",
    "edicaoShoppingsGroup"
  );
  document.getElementById("usuarioModal").hidden = false;

  modoFormularioUsuario = "edicao";

document.getElementById(
  "telefoneInput"
).value = usuario.telefone || "";

document.getElementById(
  "senhaProvisoriaGroup"
).hidden = true;

document.getElementById(
  "senhaProvisoriaInput"
).required = false;

document.getElementById(
  "confirmacaoSenhaInput"
).required = false;

document.getElementById(
  "usuarioModalTitulo"
).textContent = "Editar usuário";

document.getElementById(
  "salvarUsuarioButton"
).textContent = "Atualizar usuário";
}

function abrirAprovacao(usuarioId) {
  const usuario = usuariosCache.find(
    (item) => Number(item.id) === Number(usuarioId)
  );

  if (!usuario) return;

  document.getElementById("aprovacaoUsuarioId").value = usuario.id;
  document.getElementById("aprovacaoUsuarioResumo").textContent =
    `${usuario.nome} — ${usuario.email} — ` +
    `${usuario.shopping_solicitado_nome || "sem shopping"}`;
  document.getElementById("aprovacaoPerfilInput").value = "";
  selecionarShoppings(
    "aprovacaoShoppingsInput",
    [usuario.shopping_solicitado]
  );
  atualizarVisibilidadeShoppings(
    "aprovacaoPerfilInput",
    "aprovacaoShoppingsGroup"
  );
  document.getElementById("aprovacaoModal").hidden = false;
}

function abrirRejeicao(usuarioId) {
  document.getElementById("rejeicaoUsuarioId").value = usuarioId;
  document.getElementById("rejeicaoModal").hidden = false;
  document.getElementById("motivoRejeicaoInput").focus();
}

async function salvarUsuario(event) {
  event.preventDefault();

  const mensagem = document.getElementById("usuarioMensagem");
  const usuarioId = document.getElementById("usuarioIdInput").value;
  const payload = {
    nome: document.getElementById("nomeInput").value,
    email: document.getElementById("emailInput").value,
    telefone: document.getElementById("telefoneInput").value,
    perfil: document.getElementById("perfilInput").value,
    ativo: document.getElementById("ativoInput").value === "true",
    shoppingIds: obterShoppingsSelecionados("shoppingsInput"),
  };

  mensagem.textContent = "";

try {
  if (modoFormularioUsuario === "criacao") {
    payload.senhaProvisoria =
      document.getElementById(
        "senhaProvisoriaInput"
      ).value;

    payload.confirmacaoSenha =
      document.getElementById(
        "confirmacaoSenhaInput"
      ).value;

    await apiRequest("/usuarios", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } else {
    await apiRequest(
      `/usuarios/${usuarioId}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      }
    );
  }

    fecharModal("usuarioModal", "usuarioForm", "usuarioMensagem");
    await carregarUsuarios();
  } catch (error) {
    mensagem.textContent = error.message;
  }
}

async function aprovarUsuario(event) {
  event.preventDefault();

  const mensagem = document.getElementById("aprovacaoMensagem");
  const usuarioId =
    document.getElementById("aprovacaoUsuarioId").value;
  const payload = {
    perfil: document.getElementById("aprovacaoPerfilInput").value,
    shoppingIds: obterShoppingsSelecionados(
      "aprovacaoShoppingsInput"
    ),
  };

  mensagem.textContent = "";

  try {
    await apiRequest(`/usuarios/${usuarioId}/aprovar`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    fecharModal(
      "aprovacaoModal",
      "aprovacaoForm",
      "aprovacaoMensagem"
    );
    await carregarUsuarios();
  } catch (error) {
    mensagem.textContent = error.message;
  }
}

async function rejeitarUsuario(event) {
  event.preventDefault();

  const mensagem = document.getElementById("rejeicaoMensagem");
  const usuarioId =
    document.getElementById("rejeicaoUsuarioId").value;
  const motivo =
    document.getElementById("motivoRejeicaoInput").value;

  mensagem.textContent = "";

  try {
    await apiRequest(`/usuarios/${usuarioId}/rejeitar`, {
      method: "POST",
      body: JSON.stringify({ motivo }),
    });

    fecharModal(
      "rejeicaoModal",
      "rejeicaoForm",
      "rejeicaoMensagem"
    );
    await carregarUsuarios();
  } catch (error) {
    mensagem.textContent = error.message;
  }
}

function abrirSenhaProvisoria(usuarioId) {
  document.getElementById(
    "senhaProvisoriaForm"
  ).reset();

  document.getElementById(
    "senhaProvisoriaMensagem"
  ).textContent = "";

  document.getElementById(
    "senhaUsuarioIdInput"
  ).value = usuarioId;

  document.getElementById(
    "senhaProvisoriaModal"
  ).hidden = false;
}

async function salvarSenhaProvisoria(event) {
  event.preventDefault();

  const usuarioId = document.getElementById(
    "senhaUsuarioIdInput"
  ).value;

  const mensagem = document.getElementById(
    "senhaProvisoriaMensagem"
  );

  try {
    const response = await apiRequest(
      `/usuarios/${usuarioId}/senha-provisoria`,
      {
        method: "POST",
        body: JSON.stringify({
          senhaProvisoria:
            document.getElementById(
              "novaSenhaProvisoriaInput"
            ).value,
          confirmacaoSenha:
            document.getElementById(
              "confirmacaoNovaSenhaInput"
            ).value,
        }),
      }
    );

  mensagem.dataset.status = "success";
mensagem.textContent = response.message;

    window.setTimeout(() => {
      fecharModal(
        "senhaProvisoriaModal",
        "senhaProvisoriaForm",
        "senhaProvisoriaMensagem"
      );
    }, 1200);
  } catch (error) {
    delete mensagem.dataset.status;
    mensagem.textContent = error.message;
  }
}

async function reenviarConvite(usuarioId) {
  if (!window.confirm("Deseja reenviar o convite para este usuário?")) {
    return;
  }

  const mensagem = document.getElementById("paginaMensagem");
  mensagem.textContent = "";

  try {
    const response = await apiRequest(
      `/usuarios/${usuarioId}/reenviar-convite`,
      { method: "POST" }
    );

    await carregarUsuarios();
    mensagem.dataset.status = "success";
    mensagem.textContent = response.message;
  } catch (error) {
    delete mensagem.dataset.status;
    mensagem.textContent = error.message;
  }
}

document.getElementById("filtrarButton").addEventListener("click", () => {
  paginaAtual = 1;
  carregarUsuarios();
});

document.getElementById("buscaInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    paginaAtual = 1;
    carregarUsuarios();
  }
});

document.getElementById("paginaAnteriorButton").addEventListener("click", () => {
  if (paginaAtual > 1) {
    paginaAtual -= 1;
    carregarUsuarios();
  }
});

document.getElementById("proximaPaginaButton").addEventListener("click", () => {
  paginaAtual += 1;
  carregarUsuarios();
});

document.getElementById("perfilInput").addEventListener("change", () => {
  atualizarVisibilidadeShoppings(
    "perfilInput",
    "edicaoShoppingsGroup"
  );
});

document
  .getElementById("aprovacaoPerfilInput")
  .addEventListener("change", () => {
    atualizarVisibilidadeShoppings(
      "aprovacaoPerfilInput",
      "aprovacaoShoppingsGroup"
    );
  });

document.getElementById("fecharModalButton").addEventListener("click", () => {
  fecharModal("usuarioModal", "usuarioForm", "usuarioMensagem");
});

document.getElementById("fecharAprovacaoButton").addEventListener("click", () => {
  fecharModal(
    "aprovacaoModal",
    "aprovacaoForm",
    "aprovacaoMensagem"
  );
});

document.getElementById("fecharRejeicaoButton").addEventListener("click", () => {
  fecharModal(
    "rejeicaoModal",
    "rejeicaoForm",
    "rejeicaoMensagem"
  );
});

document
  .getElementById(
    "fecharSenhaProvisoriaButton"
  )
  .addEventListener("click", () => {
    fecharModal(
      "senhaProvisoriaModal",
      "senhaProvisoriaForm",
      "senhaProvisoriaMensagem"
    );
  });

document.getElementById("usuarioForm").addEventListener("submit", salvarUsuario);
document.getElementById("aprovacaoForm").addEventListener("submit", aprovarUsuario);
document.getElementById("rejeicaoForm").addEventListener("submit", rejeitarUsuario);
const novoUsuarioButton =
  document.getElementById(
    "novoUsuarioButton"
  );

if (usuarioLogado?.perfil === "MESTRE") {
  novoUsuarioButton.hidden = false;
  novoUsuarioButton.addEventListener(
    "click",
    abrirNovoUsuario
  );
}

document.getElementById(
  "senhaProvisoriaForm"
).addEventListener(
  "submit",
  salvarSenhaProvisoria
);


carregarOpcoes()
  .then(carregarUsuarios)
  .catch((error) => {
    document.getElementById("paginaMensagem").textContent = error.message;
  });
