const form = document.getElementById("loginForm");
const mensagem = document.getElementById("mensagem");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  mensagem.textContent = "";

  try {
    const email = document.getElementById("email").value;
    const senha = document.getElementById("senha").value;

    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, senha }),
    });

    localStorage.setItem("@portalGMV:token", data.token);
    localStorage.setItem("@portalGMV:usuario", JSON.stringify(data.usuario));
    localStorage.setItem("@portalGMV:permissoes", JSON.stringify(data.permissoes));

    window.location.href = "/";
  } catch (error) {
    mensagem.textContent = error.message;
  }
});