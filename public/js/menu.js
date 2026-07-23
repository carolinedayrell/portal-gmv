function getUsuarioLogado() {
  return JSON.parse(localStorage.getItem("@portalGMV:usuario") || "null");
}

function renderMenu() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  const currentPath = window.location.pathname;
  const usuario = getUsuarioLogado();
  const isMestre = usuario?.perfil === "MESTRE";
  const gerenciaUsuarios =
    isMestre || usuario?.perfil === "GERENTE_CSC";

  const paginasRestritasGerenciaUsuarios = ["/usuarios"];
  const paginasRestritasMestre = ["/shoppings", "/permissoes"];

  if (
    (!gerenciaUsuarios &&
      paginasRestritasGerenciaUsuarios.includes(currentPath)) ||
    (!isMestre && paginasRestritasMestre.includes(currentPath))
  ) {
    window.location.href = "/";
    return;
  }

  sidebar.innerHTML = `
    <div class="brand">
      <img src="/img/logo.jpg" alt="GMV" />
    </div>

    <nav>
      <a href="/" class="nav-link" data-path="/">Home</a>

      <div class="nav-group">
        <button type="button" class="nav-toggle" data-menu="faturamento">
          Faturamento
        </button>

        <div class="nav-submenu" data-submenu="faturamento">
          <a href="/faturamento/relatorio" class="nav-link" data-path="/faturamento/relatorio">Relatórios</a>
          <a href="/faturamento/gerar-tabelas" class="nav-link" data-path="/faturamento/gerar-tabelas">Gerar Tabelas</a>
        </div>
      </div>

      ${
        gerenciaUsuarios
          ? `
            <a href="/usuarios" class="nav-link" data-path="/usuarios">Cadastro de Usuários</a>
           `
          : ""
      }

      ${
        isMestre
          ? `
            <a href="/shoppings" class="nav-link" data-path="/shoppings">Shoppings</a>
           `
          : ""
      }

      <div class="nav-group">
        <button type="button" class="nav-toggle" data-menu="vendas">
          Vendas
        </button>

        <div class="nav-submenu" data-submenu="vendas">
          <a href="/vendas/relatorio" class="nav-link" data-path="/vendas/relatorio">Relatórios</a>
        </div>
      </div>
    </nav>

    <button id="logoutButton">Sair</button>
  `;

  document.querySelectorAll(".nav-link").forEach((link) => {
    if (link.dataset.path === currentPath) {
      link.classList.add("active");
    }
  });

  document.querySelectorAll(".nav-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const menuName = button.dataset.menu;
      const submenu = document.querySelector(`[data-submenu="${menuName}"]`);

      button.classList.toggle("open");
      submenu.classList.toggle("open");
    });
  });

  if (currentPath.startsWith("/faturamento")) {
    document.querySelector('[data-menu="faturamento"]')?.classList.add("open");
    document.querySelector('[data-submenu="faturamento"]')?.classList.add("open");
  }

  if (currentPath.startsWith("/vendas")) {
    document.querySelector('[data-menu="vendas"]')?.classList.add("open");
    document.querySelector('[data-submenu="vendas"]')?.classList.add("open");
  }
}

renderMenu();
