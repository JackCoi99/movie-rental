"use strict";

(() => {
  const menu = document.querySelector("#account-menu");
  const summary = menu.querySelector("summary");
  const logout = menu.querySelector("#account-logout");
  const baseURL = document.querySelector('meta[name="api-base-url"]').content;
  const client = window.axios?.create({ baseURL, timeout: 8000 });
  const storageKey = "movie-rental-profile";

  let profile = null;

  try {
    profile = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
  } catch {
    // El menú también funciona si el almacenamiento no está disponible.
  }

  function renderAccount() {
    summary.textContent = profile ? `Cuenta · ${profile.name}` : "Cuenta";
    logout.hidden = !profile;
  }

  function selectProfile(user) {
    profile = user ? { id: user.id, name: user.name } : null;

    try {
      if (profile) sessionStorage.setItem(storageKey, JSON.stringify(profile));
      else sessionStorage.removeItem(storageKey);
    } catch {
      // El perfil sigue disponible en esta página.
    }

    renderAccount();
  }

  for (const option of menu.querySelectorAll("[data-account-dialog]")) {
    const dialog = document.getElementById(option.dataset.accountDialog);
    const form = dialog.querySelector("form");
    const message = form.querySelector(".account-message");
    const submit = form.querySelector('button[type="submit"]');
    const registering = form.id === "account-register";

    option.addEventListener("click", () => {
      menu.open = false;
      if (!submit.disabled) message.textContent = "";
      dialog.showModal();
    });

    dialog.querySelector("[data-account-close]").addEventListener("click", () => {
      dialog.close();
    });
    dialog.addEventListener("close", () => summary.focus());

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submit.disabled) return;

      if (!client) {
        message.textContent = "No se pudo conectar con la API.";
        return;
      }

      const fields = new FormData(form);
      const email = String(fields.get("email") ?? "").trim().toLowerCase();
      const name = String(fields.get("name") ?? "").trim();

      if (registering && !name) {
        message.textContent = "Escribe tu nombre.";
        form.elements.namedItem("name").focus();
        return;
      }

      submit.disabled = true;
      message.textContent = registering ? "Creando usuario…" : "Buscando usuario…";

      try {
        const { data: users } = await client.get("/users");
        const existing = users.find((user) => user.email.trim().toLowerCase() === email);

        if (registering && existing) {
          message.textContent = "Ya existe un usuario con ese correo.";
          return;
        }

        if (!registering && !existing) {
          message.textContent = "Ese correo no está registrado.";
          return;
        }

        const user = registering
          ? (await client.post("/users", { name, email })).data
          : existing;

        selectProfile(user);
        form.reset();
        dialog.close();
      } catch (error) {
        const detail = error.response?.data?.detail;
        message.textContent = typeof detail === "string"
          ? detail
          : "No se pudo completar la operación. Revisa los datos y la conexión.";
      } finally {
        submit.disabled = false;
      }
    });
  }

  logout.addEventListener("click", () => {
    selectProfile(null);
    menu.open = false;
    summary.focus();
  });

  renderAccount();
})();