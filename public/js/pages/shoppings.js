let shoppingsCache = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizarCnpjAlfanumerico(value) {
  const limpo = String(value ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 14);

  const base = limpo.slice(0, 12);
  const dv = limpo.slice(12, 14).replace(/\D/g, "");

  return `${base}${dv}`.slice(0, 14);
}

function formatarCnpjAlfanumerico(value) {
  const cnpj = normalizarCnpjAlfanumerico(value);

  if (cnpj.length <= 2) return cnpj;
  if (cnpj.length <= 5) return `${cnpj.slice(0, 2)}.${cnpj.slice(2)}`;
  if (cnpj.length <= 8) return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5)}`;

  if (cnpj.length <= 12) {
    return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8)}`;
  }

  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12, 14)}`;
}

function usuarioEhMestre() {
  const usuario = JSON.parse(localStorage.getItem("@portalGMV:usuario") || "null");
  return usuario?.perfil === "MESTRE";
}

async function carregarShoppings() {
  const tbody = document.getElementById("shoppingsTableBody");
  const busca = document.getElementById("buscaInput").value;
  const params = new URLSearchParams();

  if (busca) params.set("busca", busca);

  try {
    const shoppings = await apiRequest(`/shoppings?${params.toString()}`);
    shoppingsCache = shoppings;

    if (!shoppings.length) {
      tbody.innerHTML = `<tr><td colspan="7">Nenhum shopping encontrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = shoppings
      .map(
        (shopping) => `
          <tr>
            <td>${escapeHtml(shopping.nome_shopping)}</td>
            <td>${escapeHtml(shopping.num_shopping)}</td>
            <td>${escapeHtml(formatarCnpjAlfanumerico(shopping.cnpjshopping))}</td>
            <td>${escapeHtml(formatarCnpjAlfanumerico(shopping.cnpj_totvs) || "-")}</td>
            <td>${escapeHtml(shopping.coligada_totvs || "-")}</td>
            <td>${escapeHtml(shopping.nome_reduzido_coligada || "-")}</td>
            <td>
              ${
                usuarioEhMestre()
                  ? `<button type="button" class="table-action" onclick="editarShopping('${escapeHtml(shopping.num_shopping)}')">Editar</button>`
                  : "-"
              }
            </td>
          </tr>
        `
      )
      .join("");
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="7">${escapeHtml(error.message)}</td></tr>`;
  }
}

function abrirModal() {
  document.getElementById("shoppingModal").hidden = false;
}

function fecharModal() {
  document.getElementById("shoppingModal").hidden = true;
  document.getElementById("shoppingForm").reset();
  document.getElementById("shoppingMensagem").textContent = "";
}

function editarShopping(numShopping) {
  const shopping = shoppingsCache.find(
    (item) => String(item.num_shopping) === String(numShopping)
  );

  if (!shopping) return;

  document.getElementById("numShoppingInput").value = shopping.num_shopping;
  document.getElementById("nomeShoppingInput").value = shopping.nome_shopping || "";
  document.getElementById("groupInput").value = shopping.num_shopping || "";
  document.getElementById("cnpjInput").value = formatarCnpjAlfanumerico(shopping.cnpjshopping);
document.getElementById("cnpjTotvsInput").value = formatarCnpjAlfanumerico(shopping.cnpj_totvs);
  document.getElementById("coligadaTotvsInput").value = shopping.coligada_totvs || "";
  document.getElementById("nomeReduzidoInput").value = shopping.nome_reduzido_coligada || "";

  abrirModal();
}

async function salvarShopping(event) {
  event.preventDefault();

  const mensagem = document.getElementById("shoppingMensagem");
  const numShopping = document.getElementById("numShoppingInput").value;

  mensagem.textContent = "";

  try {
await apiRequest(`/shoppings/${encodeURIComponent(numShopping)}`, {
  method: "PUT",
  body: JSON.stringify({
    cnpj_totvs: normalizarCnpjAlfanumerico(document.getElementById("cnpjTotvsInput").value),
    coligada_totvs: document.getElementById("coligadaTotvsInput").value,
    nome_reduzido_coligada: document.getElementById("nomeReduzidoInput").value,
  }),
});
fecharModal();
await carregarShoppings();
alert("Shopping atualizado com sucesso.");
  } catch (error) {
    mensagem.textContent = error.message;
  }
}

document.getElementById("filtrarButton").addEventListener("click", carregarShoppings);

document.getElementById("buscaInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") carregarShoppings();
});

document.getElementById("fecharModalButton").addEventListener("click", fecharModal);
document.getElementById("shoppingForm").addEventListener("submit", salvarShopping);
document.getElementById("cnpjTotvsInput").addEventListener("input", (event) => {
  event.target.value = formatarCnpjAlfanumerico(event.target.value);
});

carregarShoppings();