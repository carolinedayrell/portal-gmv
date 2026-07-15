function getToken() {
  return localStorage.getItem("@portalGMV:token");
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = "/login";
  }
}

function logout() {
  localStorage.removeItem("@portalGMV:token");
  localStorage.removeItem("@portalGMV:usuario");
  localStorage.removeItem("@portalGMV:permissoes");
  window.location.href = "/login";
}