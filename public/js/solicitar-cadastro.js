const form = document.getElementById("solicitacaoForm");
const mensagem = document.getElementById("mensagem");
const shoppingInput = document.getElementById("shoppingId");

async function carregarShoppings() {
  try {
    const shoppings = await apiRequest(
      "/usuarios/solicitacoes/shoppings"
    );

    for (const shopping of shoppings) {
      const option = document.createElement("option");
      option.value = shopping.id;
      option.textContent = shopping.nome;
      shoppingInput.appendChild(option);
    }
  } catch (error) {
    mensagem.textContent = error.message;
    form.querySelector("button").disabled = true;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  mensagem.textContent = "";
  delete mensagem.dataset.status;

  const button = form.querySelector("button");
  button.disabled = true;

  try {
    const response = await apiRequest("/usuarios/solicitacoes", {
      method: "POST",
      body: JSON.stringify({
        nome: document.getElementById("nome").value,
        email: document.getElementById("email").value,
        shoppingId: shoppingInput.value,
      }),
    });

    mensagem.dataset.status = "success";
    mensagem.textContent = response.message;
    form.reset();
  } catch (error) {
    mensagem.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

carregarShoppings();
