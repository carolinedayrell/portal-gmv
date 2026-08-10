const form = document.getElementById("senhaForm");
const mensagem = document.getElementById("mensagem");

const token = sessionStorage.getItem(
  "@portalGMV:tokenTrocaSenha"
);

if (!token) {
  window.location.href = "/login";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  mensagem.textContent = "";

  const button = form.querySelector("button");
  button.disabled = true;

  try {
    const response = await apiRequest(
      "/auth/alterar-senha-inicial",
      {
        method: "POST",
        body: JSON.stringify({
          token,
          senha:
            document.getElementById("senha").value,
          confirmacao:
            document.getElementById(
              "confirmacao"
            ).value,
        }),
      }
    );

    sessionStorage.removeItem(
      "@portalGMV:tokenTrocaSenha"
    );

    mensagem.dataset.status = "success";
    mensagem.textContent = response.message;

    window.setTimeout(() => {
      window.location.href = "/login";
    }, 1500);
  } catch (error) {
    mensagem.textContent = error.message;
    button.disabled = false;
  }
});