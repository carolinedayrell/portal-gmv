const form = document.getElementById(
  "meuPerfilForm"
);

const mensagem = document.getElementById(
  "perfilMensagem"
);

function formatarTelefone(value) {
  const telefone = String(value || "");

  if (!/^[0-9]{11}$/.test(telefone)) {
    return telefone;
  }

  return telefone.replace(
    /^([0-9]{2})([0-9]{5})([0-9]{4})$/,
    "($1) $2-$3"
  );
}

async function carregarMeuPerfil() {
  mensagem.textContent = "";

  try {
    const { usuario } = await apiRequest(
      "/auth/me"
    );

    document.getElementById(
      "nomeInput"
    ).value = usuario.nome || "";

    document.getElementById(
      "emailInput"
    ).value = usuario.email || "";

    document.getElementById(
      "telefoneInput"
    ).value = formatarTelefone(
      usuario.telefone
    );
  } catch (error) {
    mensagem.textContent = error.message;
  }
}

form.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    mensagem.textContent = "";
    delete mensagem.dataset.status;

    const button = form.querySelector(
      'button[type="submit"]'
    );

    button.disabled = true;

    try {
      const response = await apiRequest(
        "/usuarios/me/telefone",
        {
          method: "PATCH",
          body: JSON.stringify({
            telefone:
              document.getElementById(
                "telefoneInput"
              ).value,
          }),
        }
      );

      const usuarioLocal = JSON.parse(
        localStorage.getItem(
          "@portalGMV:usuario"
        ) || "{}"
      );

      localStorage.setItem(
        "@portalGMV:usuario",
        JSON.stringify({
          ...usuarioLocal,
          telefone:
            response.usuario.telefone,
        })
      );

      document.getElementById(
        "telefoneInput"
      ).value = formatarTelefone(
        response.usuario.telefone
      );

      mensagem.dataset.status = "success";
      mensagem.textContent =
        response.message;
    } catch (error) {
      mensagem.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }
);

carregarMeuPerfil();