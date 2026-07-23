const form = document.getElementById("senhaForm");
const mensagem = document.getElementById("mensagem");
const token = new URLSearchParams(window.location.search).get("token");

if (!token) {
  mensagem.textContent = "Link inválido ou incompleto.";
  form.querySelector("button").disabled = true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  mensagem.textContent = "";
  delete mensagem.dataset.status;

  const button = form.querySelector("button");
  button.disabled = true;

  try {
    const response = await apiRequest("/auth/definir-senha", {
      method: "POST",
      body: JSON.stringify({
        token,
        senha: document.getElementById("senha").value,
        confirmacao: document.getElementById("confirmacao").value,
      }),
    });

    mensagem.dataset.status = "success";
    mensagem.textContent = response.message;
    form.reset();

    window.setTimeout(() => {
      window.location.href = "/login";
    }, 1500);
  } catch (error) {
    mensagem.textContent = error.message;
    button.disabled = false;
  }
});
