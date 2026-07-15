requireAuth();

const logoutButton = document.getElementById("logoutButton");

if (logoutButton) {
  logoutButton.addEventListener("click", logout);
}

function obterTextoCelula(row, index) {
  return row.children[index]?.textContent.trim() || "";
}

function normalizarValorOrdenacao(value) {
  const texto = String(value || "").trim();

  if (/^\d{2}\/\d{4}$/.test(texto)) {
    const [mes, ano] = texto.split("/");
    return Number(`${ano}${mes}`);
  }

  const numeroBr = texto
    .replace("R$", "")
    .replace("%", "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();

  if (numeroBr !== "" && !Number.isNaN(Number(numeroBr))) {
    return Number(numeroBr);
  }

  return texto.toLowerCase();
}

function colunaPodeOrdenar(th) {
  const texto = th.textContent.trim().toLowerCase();

  if (th.closest("#faturamentoTable")) return false;
  if (th.dataset.sortDisabled === "true") return false;

  return !["ações", "acoes"].includes(texto);
}

function limparIndicadoresOrdenacao(table, thAtivo) {
  table.querySelectorAll("th").forEach((th) => {
    if (th !== thAtivo) {
      th.classList.remove("sort-asc", "sort-desc");
      th.removeAttribute("aria-sort");
    }
  });
}

function ordenarTabela(table, columnIndex, direction) {
  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll("tr")).filter((row) => {
    return row.children.length > 1;
  });

  rows.sort((a, b) => {
    const valorA = normalizarValorOrdenacao(obterTextoCelula(a, columnIndex));
    const valorB = normalizarValorOrdenacao(obterTextoCelula(b, columnIndex));

    if (valorA < valorB) return direction === "asc" ? -1 : 1;
    if (valorA > valorB) return direction === "asc" ? 1 : -1;
    return 0;
  });

  rows.forEach((row) => tbody.appendChild(row));
}

function ativarOrdenacaoTabelas() {
  document.querySelectorAll("table").forEach((table) => {
    if (table.dataset.sortReady === "true") return;

    table.dataset.sortReady = "true";

    table.querySelectorAll("thead th").forEach((th, index) => {
      if (!colunaPodeOrdenar(th)) return;

      th.classList.add("sortable-column");
      th.setAttribute("title", "Clique para ordenar");

      th.addEventListener("click", (event) => {
        if (event.target.closest(".column-resizer")) return;

        const direction = th.classList.contains("sort-asc") ? "desc" : "asc";

        limparIndicadoresOrdenacao(table, th);

        th.classList.toggle("sort-asc", direction === "asc");
        th.classList.toggle("sort-desc", direction === "desc");
        th.setAttribute("aria-sort", direction === "asc" ? "ascending" : "descending");

        ordenarTabela(table, index, direction);
      });
    });
  });
}

ativarOrdenacaoTabelas();