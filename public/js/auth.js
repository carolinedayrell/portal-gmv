function getToken() {
  return localStorage.getItem("@portalGMV:token");
}

async function requireAuth() {
  if (!getToken()) {
    window.location.href = "/login";
    return;
  }

  try {
    const { usuario } = await apiRequest("/auth/me");
    localStorage.setItem(
      "@portalGMV:usuario",
      JSON.stringify(usuario)
    );
  } catch (error) {
    console.error("Nao foi possivel validar a sessao:", error.message);
  }
}

function logout() {
  localStorage.removeItem("@portalGMV:token");
  localStorage.removeItem("@portalGMV:usuario");
  localStorage.removeItem("@portalGMV:permissoes");
  window.location.href = "/login";
}
