"use strict";

const apiUrl = document.querySelector('meta[name="api-base-url"]').content.replace(/\/$/, "");
const api = window.axios?.create({ baseURL: apiUrl, timeout: 8000 });
const byId = (id) => document.getElementById(id);
const form = byId("movie-form");
const rentalForm = byId("rental-form");
const rentalUser = byId("rental-user");
const filter = byId("director-filter");
const list = byId("movie-list");
const statusMessage = byId("status");
const errorMessage = byId("error");
const createButton = byId("new-movie");
const views = ["catalog", "detail", "form"];
const isDetail = Boolean(byId("detail-view"));
const cartKey = "movie-rental-cart";
let cart = readCart();

let movies = [];
let directors = [];
let rentalUsers = null;
let rentedMovieIds = new Set();
let selectedMovie = null;
let editingMovie = null;
let busy = false;

for (const link of document.querySelectorAll("[data-api-docs]")) {
  link.href = apiUrl + "/docs";
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function fullName(person) {
  return person ? [person.name, person.surname].filter(Boolean).join(" ") : "Sin dirección";
}

function showView(view, focus) {
  for (const name of views) {
    const section = byId(name + "-view");
    if (section) section.hidden = name !== view;
  }
  if (createButton) createButton.hidden = view !== "catalog";
  focus?.focus();
}

function errorText(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const labels = {
      name: "Título", year: "Año", director_id: "Dirección",
      actor_ids: "Reparto", genre_ids: "Géneros", description: "Sinopsis",
      available: "Disponibilidad", user_id: "Usuario", movie_id: "Película",
      rental_date: "Fecha de alquiler",
    };
    const fields = [...new Set(detail.map(({ loc }) => labels[loc?.[1]]).filter(Boolean))];
    return fields.length
      ? "Revisa estos campos: " + fields.join(", ") + "."
      : "Los datos enviados no son válidos.";
  }
  return error.response
    ? "La API no pudo completar la operación (HTTP " + error.response.status + ")."
    : "No se pudo conectar con la API. Comprueba que FastAPI esté en marcha.";
}

async function run(message, operation) {
  if (busy || !api) return;
  busy = true;
  statusMessage.textContent = message;
  errorMessage.textContent = "";
  list?.setAttribute("aria-busy", "true");
  const controls = [...document.querySelectorAll(".workspace button, .workspace input, .workspace select, .workspace textarea")];
  const disabledBefore = controls.map((control) => control.disabled);
  for (const control of controls) control.disabled = true;
  try {
    statusMessage.textContent = (await operation()) ?? "";
  } catch (error) {
    statusMessage.textContent = "";
    errorMessage.textContent = errorText(error);
  } finally {
    busy = false;
    list?.setAttribute("aria-busy", "false");
    controls.forEach((control, index) => { control.disabled = disabledBefore[index]; });
    if (createButton) createButton.disabled = directors.length === 0;
    if (isDetail && selectedMovie) {
      byId("pay-movie").disabled = !canRent(selectedMovie) || !rentalUsers?.length;
      byId("cart-movie").disabled = !canRent(selectedMovie);
    }
  }
}

function readCart() {
  try {
    const items = JSON.parse(localStorage.getItem(cartKey) || "[]");
    return Array.isArray(items) ? items.filter((item) => Number.isSafeInteger(item?.id) && item.id > 0 && typeof item.name === "string") : [];
  } catch {
    return [];
  }
}

function movieUrl(id) {
  return "movie.html?id=" + encodeURIComponent(id);
}

function setPoster(poster, movie) {
  poster.setAttribute("data-art", String((movie.id - 1) % 4));
  poster.textContent = movie.name;
}

function renderCart() {
  byId("cart-count").textContent = cart.length;
  const items = byId("cart-items");
  items.replaceChildren();
  if (!cart.length) items.append(element("li", "El carrito está vacío."));
  for (const item of cart) {
    const row = element("li");
    const link = element("a", item.name);
    link.href = movieUrl(item.id);
    const remove = element("button", "Quitar", "secondary");
    remove.type = "button";
    remove.setAttribute("aria-label", "Quitar " + item.name + " del carrito");
    remove.addEventListener("click", () => {
      saveCart(cart.filter(({ id }) => id !== item.id));
      const next = items.querySelector("button") ?? byId("cart-dialog").querySelector("button");
      next?.focus();
    });
    row.append(link, remove);
    items.append(row);
  }
}

function saveCart(items) {
  cart = items;
  try {
    localStorage.setItem(cartKey, JSON.stringify(cart));
  } catch {
    errorMessage.textContent = "El carrito no se puede conservar al recargar la página.";
  }
  renderCart();
}

function addToCart(movie) {
  if (!canRent(movie)) return;
  if (cart.some(({ id }) => id === movie.id)) {
    statusMessage.textContent = "La película ya está en el carrito.";
    return;
  }
  saveCart([...cart, { id: movie.id, name: movie.name }]);
  statusMessage.textContent = movie.name + " se añadió al carrito.";
}

function renderPremieres() {
  const grid = byId("premieres");
  grid.replaceChildren();
  const latest = [...movies].sort((a, b) => b.year - a.year || b.id - a.id).slice(0, 4);
  if (!latest.length) grid.append(element("p", "El catálogo todavía está vacío."));
  for (const movie of latest) {
    const card = element("article", undefined, "premiere-card");
    const poster = element("div", undefined, "poster");
    poster.setAttribute("aria-hidden", "true");
    setPoster(poster, movie);
    const link = element("a", "Ver película", "button");
    link.href = movieUrl(movie.id);
    link.setAttribute("aria-label", "Ver película: " + movie.name);
    const add = element("button", "+", "secondary");
    add.type = "button";
    add.disabled = !canRent(movie);
    add.setAttribute("aria-label", "Añadir " + movie.name + " al carrito");
    add.addEventListener("click", () => addToCart(movie));
    const actions = element("div", undefined, "poster-actions");
    actions.append(link, add);
    card.append(poster, element("h3", movie.name), element("p", movie.year), actions);
    grid.append(card);
  }
}

function canRent(movie) {
  return movie.available && !rentedMovieIds.has(movie.id);
}

function updateRentedMovies(rentals) {
  rentedMovieIds = new Set(rentals.filter((rental) => rental.return_date == null).map((rental) => rental.movie_id));
}

function renderMovies() {
  if (!list) return;
  renderPremieres();
  const visible = movies.filter((movie) => !filter.value || String(movie.director_id) === filter.value);
  list.replaceChildren();
  if (!visible.length) {
    list.append(element("p", filter.value ? "No hay películas de este director." : "El catálogo está vacío."));
    return;
  }
  for (const movie of visible) {
    const card = element("article", undefined, "card");
    const genreNames = movie.genres.map((genre) => genre.type);
    const button = element("a", canRent(movie) ? "Ver y alquilar" : "Ver ficha", "button secondary");
    button.href = movieUrl(movie.id);
    button.id = "movie-" + movie.id;
    button.setAttribute("aria-label", button.textContent + " · " + movie.name);
    card.append(
      element("span", [movie.year, ...genreNames].join(" · "), "movie-meta"),
      element("h3", movie.name),
      element("p", fullName(movie.director) + " · " + (canRent(movie) ? "Disponible" : "No disponible")),
      button,
    );
    list.append(card);
  }
}

function setOptions(select, options, firstLabel, labelOf) {
  select.replaceChildren(new Option(firstLabel, ""));
  for (const option of options) select.add(new Option(labelOf(option), String(option.id)));
}

async function loadCatalog() {
  await run("Cargando catálogo…", async () => {
    const [movieResult, directorResult, rentalResult] = await Promise.all([
      api.get("/movies"), api.get("/directors"), api.get("/rentals"),
    ]);
    updateRentedMovies(rentalResult.data);
    movies = movieResult.data;
    directors = directorResult.data;
    const previous = filter.value;
    setOptions(filter, directors, "Todos los directores", fullName);
    if (directors.some(({ id }) => String(id) === previous)) filter.value = previous;
    renderMovies();
    if (params.get("deleted") === "1") {
      params.delete("deleted");
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      return "Película eliminada.";
    }
    return directors.length ? "Catálogo actualizado." : "Crea un director desde Swagger para poder añadir películas.";
  });
}

function showMovie(movie) {
  selectedMovie = movie;
  setPoster(byId("detail-poster"), movie);
  rentalForm.hidden = true;
  byId("pay-movie").setAttribute("aria-expanded", "false");
  byId("pay-movie").disabled = !canRent(movie) || !rentalUsers?.length;
  byId("cart-movie").disabled = !canRent(movie);
  byId("detail-title").textContent = movie.name;
  byId("detail-description").textContent = movie.description || "Sin sinopsis.";
  const data = byId("detail-data");
  data.replaceChildren();
  for (const [label, value] of [
    ["Año", movie.year],
    ["Dirección", fullName(movie.director)],
    ["Reparto", movie.actors.map(fullName).join(", ") || "Sin reparto asociado"],
    ["Géneros", movie.genres.map((genre) => genre.type).join(", ") || "Sin géneros asociados"],
    ["Disponibilidad", canRent(movie) ? "Disponible para alquilar" : "No disponible"],
  ]) {
    data.append(element("dt", label), element("dd", value));
  }
  byId("rental-controls").hidden = !canRent(movie) || !rentalUsers?.length;
  const help = byId("rental-help");
  if (!canRent(movie)) {
    help.textContent = "Esta película no está disponible para alquilar.";
  } else if (rentalUsers === null) {
    help.textContent = "Vuelve al catálogo y abre esta ficha para iniciar el alquiler.";
  } else if (!rentalUsers.length) {
    help.textContent = "Crea un usuario desde Swagger para registrar el alquiler.";
  } else {
    help.textContent = "Selecciona el usuario que quedará asociado al alquiler.";
  }
  setOptions(rentalUser, rentalUsers ?? [], "Selecciona un usuario", ({ name }) => name);
  showView("detail", byId("detail-title"));
}

function openMovie(id) {
  run("Cargando ficha…", async () => {
    const [movieResult, userResult, rentalResult] = await Promise.all([
      api.get("/movies/" + id), api.get("/users"), api.get("/rentals"),
    ]);
    updateRentedMovies(rentalResult.data);
    rentalUsers = userResult.data;
    renderMovies();
    showMovie(movieResult.data);
    return "Ficha cargada.";
  });
}

function today() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return date.getFullYear() + "-" + month + "-" + day;
}

rentalForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const movie = selectedMovie;
  const userId = Number(rentalUser.value);
  if (!movie || !canRent(movie) || !userId) return;

  run("Registrando alquiler…", async () => {
    const [movieResult, rentalResult] = await Promise.all([
      api.get("/movies/" + movie.id), api.get("/rentals"),
    ]);
    updateRentedMovies(rentalResult.data);
    if (!canRent(movieResult.data)) {
      movies = movies.map((item) => item.id === movie.id ? movieResult.data : item);
      renderMovies();
      showMovie(movieResult.data);
      return "La película ya no está disponible para alquilar.";
    }
    const { data } = await api.post("/rentals", {
      user_id: userId,
      movie_id: movie.id,
      rental_date: today(),
      return_date: null,
    });
    rentedMovieIds.add(movie.id);
    saveCart(cart.filter(({ id }) => id !== movie.id));
    renderMovies();
    showMovie(movieResult.data);
    return "Alquiler confirmado. Referencia: " + data.id + ".";
  });
});

function backToCatalog(id) {
  showView("catalog", byId("movie-" + id) ?? byId("catalog-title"));
}

function setChoices(container, options, selected, labelOf) {
  container.replaceChildren();
  if (!options.length) container.append(element("p", "No hay opciones registradas."));
  for (const option of options) {
    const label = element("label");
    const input = element("input");
    input.type = "checkbox";
    input.value = String(option.id);
    input.checked = selected.has(option.id);
    label.append(input, document.createTextNode(labelOf(option)));
    container.append(label);
  }
}

function openForm(movie = null) {
  run("Cargando opciones del formulario…", async () => {
    const [directorResult, actorResult, genreResult] = await Promise.all([
      api.get("/directors"), api.get("/actors"), api.get("/genres"),
    ]);
    directors = directorResult.data;
    editingMovie = movie;
    form.reset();
    byId("form-title").textContent = movie ? "Editar película" : "Nueva película";
    byId("name").value = movie?.name ?? "";
    byId("year").value = movie?.year ?? "";
    byId("description").value = movie?.description ?? "";
    byId("available").value = String(movie?.available ?? true);
    setOptions(byId("director"), directors, "Selecciona un director", fullName);
    byId("director").value = movie ? String(movie.director_id) : "";
    setChoices(byId("actors"), actorResult.data, new Set(movie?.actors.map(({ id }) => id)), fullName);
    setChoices(byId("genres"), genreResult.data, new Set(movie?.genres.map(({ id }) => id)), ({ type }) => type);
    showView("form", byId("form-title"));
    return directors.length ? "" : "Crea un director desde Swagger para poder guardar la película.";
  });
}

function checkedIds(id) {
  return [...byId(id).querySelectorAll("input:checked")].map(({ value }) => Number(value));
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = byId("name").value.trim();
  if (!name) {
    errorMessage.textContent = "Escribe un título para la película.";
    byId("name").focus();
    return;
  }
  const payload = {
    name,
    year: Number(byId("year").value),
    description: byId("description").value.trim() || null,
    available: byId("available").value === "true",
    director_id: Number(byId("director").value),
    actor_ids: checkedIds("actors"),
    genre_ids: checkedIds("genres"),
  };
  const movie = editingMovie;
  run("Guardando película…", async () => {
    const { data } = movie
      ? await api.put("/movies/" + movie.id, payload)
      : await api.post("/movies", payload);
    movies = movie ? movies.map((item) => item.id === data.id ? data : item) : [...movies, data];
    renderMovies();
    if (isDetail) showMovie(data);
    else backToCatalog(data.id);
    return movie ? "Película actualizada." : "Película creada.";
  });
});

byId("delete-movie")?.addEventListener("click", () => {
  const movie = selectedMovie;
  if (!movie || !window.confirm("¿Eliminar «" + movie.name + "» del catálogo?")) return;
  run("Eliminando película…", async () => {
    await api.delete("/movies/" + movie.id);
    movies = movies.filter(({ id }) => id !== movie.id);
    saveCart(cart.filter(({ id }) => id !== movie.id));
    window.location.href = "index.html?deleted=1#catalogo";
  });
});

byId("reload")?.addEventListener("click", loadCatalog);
filter?.addEventListener("change", () => {
  renderMovies();
  statusMessage.textContent = "Filtro aplicado.";
});
createButton?.addEventListener("click", () => openForm());
byId("edit-movie")?.addEventListener("click", () => openForm(selectedMovie));
byId("cancel-form").addEventListener("click", () => {
  if (editingMovie) showMovie(editingMovie);
  else backToCatalog();
});
byId("open-cart").addEventListener("click", () => byId("cart-dialog").showModal());
byId("cart-movie")?.addEventListener("click", () => addToCart(selectedMovie));
byId("pay-movie")?.addEventListener("click", () => {
  rentalForm.hidden = !rentalForm.hidden;
  byId("pay-movie").setAttribute("aria-expanded", String(!rentalForm.hidden));
  if (!rentalForm.hidden) rentalUser.focus();
});
renderCart();

const params = new URLSearchParams(window.location.search);
if (!api) {
  errorMessage.textContent = "No se pudo cargar Axios. Comprueba tu conexión y recarga la página.";
} else if (isDetail) {
  const id = Number(params.get("id"));
  if (Number.isSafeInteger(id) && id > 0) openMovie(id);
  else errorMessage.textContent = "No se ha indicado una película válida. Vuelve al catálogo.";
} else {
  loadCatalog();
}
