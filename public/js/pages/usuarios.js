let paginaAtual = 1;
let usuariosCache = [];

const limitePorPagina = 25;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function obterTotalShoppingsDisponiveis() {
  return document.getElementById("shoppingsInput").options.length;
}

function formatarShoppingsUsuario(usuario) {
  const shoppingIds = usuario.shopping_ids || [];
  const totalDisponivel = obterTotalShoppingsDisponiveis();

  if (shoppingIds.length && shoppingIds.length === totalDisponivel) {
    return "Todos";
  }

  if (!usuario.shoppings) {
    return "Sem restrição cadastrada";
  }

  const shoppings = String(usuario.shoppings)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (shoppings.length <= 1) {
    return shoppings[0] || "Sem restrição cadastrada";
  }

  return `${shoppings[0]}...`;
}

async function carregarOpcoes() {
  const { perfis, shoppings } = await apiRequest("/usuarios/opcoes");

  const perfilFiltro = document.getElementById("perfilFiltro");
  const perfilInput = document.getElementById("perfilInput");
  const shoppingsInput = document.getElementById("shoppingsInput");

  perfis.forEach((perfil) => {
    const option = `<option value="${escapeHtml(perfil)}">${escapeHtml(perfil)}</option>`;

    perfilFiltro.insertAdjacentHTML("beforeend", option);
    perfilInput.insertAdjacentHTML("beforeend", option);
  });

  shoppings.forEach((shopping) => {
    shoppingsInput.insertAdjacentHTML(
      "beforeend",
      `<option value="${shopping.id}">${escapeHtml(shopping.nome)}</option>`
    );
  });
}

async function carregarUsuarios() {
  const tbody = document.getElementById("usuariosTableBody");
  const paginaInfo = document.getElementById("paginaInfo");
  const anteriorButton = document.getElementById("paginaAnteriorButton");
  const proximaButton = document.getElementById("proximaPaginaButton");

  const busca = document.getElementById("buscaInput").value;
  const perfil = document.getElementById("perfilFiltro").value;
  const ativo = document.getElementById("ativoFiltro").value;

  const params = new URLSearchParams({
    page: paginaAtual,
    limit: limitePorPagina,
  });

  if (busca) params.set("busca", busca);
  if (perfil) params.set("perfil", perfil);
  if (ativo) params.set("ativo", ativo);

  try {
    const response = await apiRequest(`/usuarios?${params.toString()}`);
    const usuarios = response.data;
    const pagination = response.pagination;

    usuariosCache = usuarios;

    if (!usuarios.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">Nenhum usuário encontrado.</td>
        </tr>
      `;
    } else {
      tbody.innerHTML = usuarios
        .map(
          (usuario) => `
            <tr>
              <td>${escapeHtml(usuario.nome)}</td>
              <td>${escapeHtml(usuario.email)}</td>
              <td>${escapeHtml(usuario.perfil)}</td>
              <td title="${escapeHtml(usuario.shoppings || "")}">
  ${escapeHtml(formatarShoppingsUsuario(usuario))}
</td>
              <td>${usuario.ativo ? "Ativo" : "Inativo"}</td>
              <td>
                <button
                  type="button"
                  class="table-action"
                  onclick="editarUsuario(${usuario.id})"
                >
                  Editar
                </button>
              </td>
            </tr>
          `
        )
        .join("");
    }

    paginaInfo.textContent = `Página ${pagination.page} de ${pagination.totalPages || 1}`;
    anteriorButton.disabled = pagination.page <= 1;
    proximaButton.disabled = pagination.page >= pagination.totalPages;
  } catch (error) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">${escapeHtml(error.message)}</td>
      </tr>
    `;
  }
}

function abrirModal() {
  document.getElementById("usuarioModal").hidden = false;
}

function fecharModal() {
  document.getElementById("usuarioModal").hidden = true;
  document.getElementById("usuarioForm").reset();
  document.getElementById("usuarioMensagem").textContent = "";
  document.getElementById("usuarioIdInput").value = "";
  document.getElementById("senhaInput").required = true;
}

function abrirModalNovoUsuario() {
  document.getElementById("usuarioModalTitulo").textContent = "Novo Usuário";
  document.getElementById("salvarUsuarioButton").textContent = "Salvar Usuário";
  document.getElementById("usuarioIdInput").value = "";
  document.getElementById("senhaInput").required = true;
  document.getElementById("ativoInput").value = "true";

  Array.from(document.getElementById("shoppingsInput").options).forEach((option) => {
    option.selected = false;
  });

  abrirModal();
}

function editarUsuario(usuarioId) {
  const usuario = usuariosCache.find((item) => Number(item.id) === Number(usuarioId));

  if (!usuario) {
    return;
  }

  document.getElementById("usuarioModalTitulo").textContent = "Editar Usuário";
  document.getElementById("salvarUsuarioButton").textContent = "Atualizar Usuário";

  document.getElementById("usuarioIdInput").value = usuario.id;
  document.getElementById("nomeInput").value = usuario.nome;
  document.getElementById("emailInput").value = usuario.email;
  document.getElementById("senhaInput").value = "";
  document.getElementById("senhaInput").required = false;
  document.getElementById("perfilInput").value = usuario.perfil;
  document.getElementById("ativoInput").value = String(usuario.ativo);

  const shoppingIds = usuario.shopping_ids || [];

  Array.from(document.getElementById("shoppingsInput").options).forEach((option) => {
option.selected = shoppingIds.map(String).includes(String(option.value));
  });

  abrirModal();
}

async function salvarUsuario(event) {
  event.preventDefault();

  const mensagem = document.getElementById("usuarioMensagem");
  const usuarioId = document.getElementById("usuarioIdInput").value;
  const shoppingsSelecionados = Array.from(
    document.getElementById("shoppingsInput").selectedOptions
  ).map((option) => option.value);

  const payload = {
    nome: document.getElementById("nomeInput").value,
    email: document.getElementById("emailInput").value,
    senha: document.getElementById("senhaInput").value,
    perfil: document.getElementById("perfilInput").value,
    ativo: document.getElementById("ativoInput").value === "true",
    shoppingIds: shoppingsSelecionados,
  };

  if (!payload.senha) {
    delete payload.senha;
  }

  mensagem.textContent = "";

  try {
    await apiRequest(usuarioId ? `/usuarios/${usuarioId}` : "/usuarios", {
      method: usuarioId ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });

    fecharModal();
    paginaAtual = 1;
    await carregarUsuarios();
  } catch (error) {
    mensagem.textContent = `Não foi possível salvar o usuário. Detalhe: ${error.message}`;
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

document.getElementById("novoUsuarioButton").addEventListener("click", abrirModalNovoUsuario);
document.getElementById("fecharModalButton").addEventListener("click", fecharModal);
document.getElementById("usuarioForm").addEventListener("submit", salvarUsuario);

carregarOpcoes().then(carregarUsuarios);