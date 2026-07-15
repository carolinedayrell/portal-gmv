const API_BASE_URL = "/api";

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("@portalGMV:token");

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (response.status === 401) {
    localStorage.removeItem("@portalGMV:token");
    localStorage.removeItem("@portalGMV:usuario");
    localStorage.removeItem("@portalGMV:permissoes");

    if (!window.location.pathname.includes("/login")) {
      window.location.href = "/login";
    }

    throw new Error(data?.message || "Sessão inválida ou expirada.");
  }

  if (!response.ok) {
    throw new Error(data?.message || "Erro na requisição.");
  }

  return data;
}