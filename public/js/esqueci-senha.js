const form = document.getElementById("redefinicaoForm");
const mensagem = document.getElementById("mensagem");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  mensagem.textContent = "";
  delete mensagem.dataset.status;

  const button = form.querySelector("button");
  button.disabled = true;

  try {
    const response = await apiRequest("/auth/esqueci-senha", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("email").value,
      }),
    });

    mensagem.dataset.status = "success";
    mensagem.textContent = response.message;
  } catch (error) {
    mensagem.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
