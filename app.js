"use strict";

const byId = (id) => document.getElementById(id);
const apiUrl = document.querySelector('meta[name="api-base-url"]').content.replace(/\/$/, "");
const api = window.axios?.create({ baseURL: apiUrl, timeout: 8000 });
const params = new URLSearchParams(window.location.search);
const isDetail = Boolean(byId("detail-view"));
const heading = isDetail ? "h2" : "h3";
const cartKey = "movie-rental-cart";
const cartLimit = 10;

byId("form-view").innerHTML = `
  <${heading} id="form-title" tabindex="-1"></${heading}>
  <form id="movie-form">
    <div class="fields">
      <div>
        <label for="name">Título (obligatorio)</label>
        <input id="name" name="name" required>
      </div>
      <div>
        <label for="year">Año (obligatorio)</label>
        <input id="year" name="year" type="number" min="1" max="9999" required>
      </div>
      <div>
        <label for="director">Dirección (obligatorio)</label>
        <input id="director" name="director" required aria-describedby="director-help">
        <small id="director-help">Escribe el nombre y el apellido.</small>
      </div>
      <div>
        <label for="available">Disponibilidad</label>
        <select id="available" name="available">
          <option value="true">Disponible</option>
          <option value="false">No disponible</option>
        </select>
      </div>
    </div>
    <label for="description">Sinopsis</label>
    <textarea id="description" name="description" rows="4"></textarea>
    <div class="fields relations">
      <div>
        <label for="actors">Reparto (opcional)</label>
        <textarea id="actors" name="actors" rows="3" aria-describedby="actors-help"></textarea>
        <small id="actors-help">Escribe un nombre y apellido por línea o sepáralos con comas.</small>
      </div>
      <div>
        <label for="genres">Géneros (opcional)</label>
        <textarea id="genres" name="genres" rows="3" aria-describedby="genres-help"></textarea>
        <small id="genres-help">Escribe un género por línea o sepáralos con comas.</small>
      </div>
    </div>
    <div class="actions">
      <button type="submit" id="save-movie">Guardar película</button>
      <button type="button" class="secondary" id="cancel-form">Cancelar</button>
    </div>
  </form>
`;

const form = byId("movie-form");
const rentalForm = byId("rental-form");
const rentalUser = byId("rental-user");
const payButton = byId("pay-movie");
const search = byId("movie-search");
const list = byId("movie-list");
const statusMessage = byId("status");
const errorMessage = byId("error");
const createButton = byId("new-movie");

let cart = readCart();
let movies = [];
let rentalUsers = [];
let rentedMovieIds = new Set();
let selectedMovie = null;
let editingMovie = null;
let busy = false;

const fullName = (person) => person
  ? [person.name, person.surname].filter(Boolean).join(" ")
  : "Sin dirección";

const normalizeName = (value) => value.trim().replace(/\s+/g, " ").normalize("NFC").toLowerCase();
const normalizeSearch = (value) => normalizeName(value).normalize("NFD").replace(/\p{M}/gu, "");
const posterKey = ({ name, year }) => `${name} (${year})`;
const isRented = (movie) => rentedMovieIds.has(movie.id);
const canRent = (movie) => movie.available && !isRented(movie);
const relationNames = (value) => value.split(/[,\n]+/).map((name) => name.trim()).filter(Boolean);

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function movieLink(id, text, className, payment = false) {
  const link = element("a", text, className);
  link.href = `movie.html?id=${encodeURIComponent(id)}${payment ? "&pay=1" : ""}`;
  return link;
}

function showView(view, focus) {
  for (const name of ["catalog", "detail", "form"]) {
    const section = byId(`${name}-view`);
    if (section) section.hidden = name !== view;
  }
  if (createButton) createButton.hidden = view !== "catalog";
  focus?.focus();
}

function confirmAction(title, message, action, danger = false) {
  const dialog = element("dialog", undefined, "confirm-dialog");
  dialog.setAttribute("aria-labelledby", "confirm-title");
  dialog.setAttribute("aria-describedby", "confirm-description");
  dialog.innerHTML = `
    <h2 id="confirm-title"></h2>
    <p id="confirm-description"></p>
    <div class="actions">
      <button type="button" class="secondary" autofocus>Cancelar</button>
      <button type="button"></button>
    </div>
  `;

  const [cancel, accept] = dialog.querySelectorAll("button");
  dialog.querySelector("h2").textContent = title;
  dialog.querySelector("p").textContent = message;
  accept.textContent = action;
  if (danger) accept.className = "danger";
  cancel.onclick = () => dialog.close();
  accept.onclick = () => dialog.close("confirm");

  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(dialog.returnValue === "confirm");
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
}

class FormInputError extends Error {
  constructor(fieldId, message) {
    super(message);
    this.fieldId = fieldId;
  }
}

function errorText(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (error instanceof FormInputError) return error.message;

  if (Array.isArray(detail)) {
    const labels = {
      name: "Título", year: "Año", director_id: "Dirección", description: "Sinopsis",
      actor_ids: "Reparto", genre_ids: "Géneros", available: "Disponibilidad",
      user_id: "Usuario", movie_id: "Película", rental_date: "Fecha de alquiler",
    };
    const fields = [...new Set(detail.map(({ loc }) => labels[loc?.[1]]).filter(Boolean))];
    return fields.length
      ? `Revisa estos campos: ${fields.join(", ")}.`
      : "Los datos enviados no son válidos.";
  }

  return error.response
    ? `La API no pudo completar la operación (HTTP ${error.response.status}).`
    : "No se pudo conectar con la API. Comprueba que FastAPI esté en marcha.";
}

async function run(message, operation) {
  if (busy || !api) return;
  busy = true;
  statusMessage.textContent = message;
  errorMessage.textContent = "";
  list?.setAttribute("aria-busy", "true");

  const controls = document.querySelectorAll(".workspace :is(button, input, select, textarea):enabled");
  controls.forEach((control) => { control.disabled = true; });

  let invalidField;
  try {
    statusMessage.textContent = (await operation()) ?? "";
  } catch (error) {
    statusMessage.textContent = "";
    errorMessage.textContent = errorText(error);
    if (error instanceof FormInputError) invalidField = error.fieldId;
  } finally {
    controls.forEach((control) => { control.disabled = false; });
    list?.setAttribute("aria-busy", "false");
    busy = false;
    if (selectedMovie) syncRentalControls();
    if (invalidField) byId(invalidField)?.focus();
  }
}

// Alquilados

function readCart() {
  try {
    const items = JSON.parse(localStorage.getItem(cartKey) ?? "[]");
    if (!Array.isArray(items)) return [];
    return items.filter((item) =>
      Number.isSafeInteger(item?.id) && item.id > 0 && typeof item.name === "string",
    ).slice(0, cartLimit);
  } catch {
    return [];
  }
}

function saveCart(items) {
  cart = items;
  try {
    localStorage.setItem(cartKey, JSON.stringify(cart));
  } catch {
    errorMessage.textContent = "La lista de Alquilados no se puede conservar al recargar la página.";
  }
  renderCart();
}

const removeFromCart = (id) => saveCart(cart.filter((item) => item.id !== id));

function renderCart() {
  byId("cart-count").textContent = `${cart.length}/${cartLimit}`;
  const items = byId("cart-items");
  items.replaceChildren();
  if (!cart.length) items.append(element("li", "La lista de Alquilados está vacía."));

  for (const { id, name } of cart) {
    const row = element("li");
    const actions = element("div", undefined, "actions");
    const pay = movieLink(id, "Ir al pago", "button secondary", true);
    const remove = element("button", "Quitar", "secondary");

    pay.setAttribute("aria-label", `Ir al pago de ${name}`);
    remove.type = "button";
    remove.setAttribute("aria-label", `Quitar ${name} de Alquilados`);
    remove.addEventListener("click", async () => {
      if (!(await confirmAction("Quitar de Alquilados", `¿Quieres quitar «${name}»?`, "Quitar"))) return;
      removeFromCart(id);
      const next = items.querySelector("button") ?? byId("cart-dialog").querySelector("button");
      next?.focus();
    });

    actions.append(pay, remove);
    row.append(movieLink(id, name), actions);
    items.append(row);
  }
}

function cartProblem(id) {
  if (cart.some((item) => item.id === id)) return "La película ya está en Alquilados.";
  if (cart.length >= cartLimit) {
    return `Alquilados admite hasta ${cartLimit} películas. Quita una para añadir otra.`;
  }
  return "";
}

async function addToCart(movie) {
  if (busy || !movie || !canRent(movie)) return;
  const problem = cartProblem(movie.id);
  if (problem) {
    statusMessage.textContent = problem;
    return;
  }
  if (!(await confirmAction("Añadir a Alquilados", `¿Quieres añadir «${movie.name}»?`, "Añadir"))) return;

  return run("Comprobando disponibilidad…", async () => {
    const current = await checkMovie(movie.id);
    if (!canRent(current)) return "La película ya no está disponible para alquilar.";

    const problem = cartProblem(current.id);
    if (problem) return problem;

    saveCart([...cart, { id: current.id, name: current.name }]);
    return `${current.name} se añadió a Alquilados.`;
  });
}

// Catálogo, portadas y disponibilidad

function availability(movie) {
  if (isRented(movie)) return "Alquilada";
  return movie.available ? "Disponible" : "No disponible";
}

function updateRentedMovies(rentals) {
  const previous = rentedMovieIds;
  rentedMovieIds = new Set(
    rentals.filter(({ return_date }) => return_date == null).map(({ movie_id }) => movie_id),
  );
  return previous.size !== rentedMovieIds.size || [...previous].some((id) => !rentedMovieIds.has(id));
}

async function checkMovie(id) {
  const [movie, rentals] = await Promise.all([api.get(`/movies/${id}`), api.get("/rentals")]);
  if (selectedMovie?.id === id) selectedMovie = movie.data;
  if (updateRentedMovies(rentals.data)) renderMovies();
  return movie.data;
}

function setPoster(poster, movie) {
  poster.dataset.art = String((movie.id - 1) % 4);
  poster.classList.toggle("is-rented", isRented(movie));
  poster.textContent = movie.name;

  const url = window.moviePosterUrls?.[posterKey(movie)]?.trim();
  if (!url || !/^https?:\/\//i.test(url)) return;

  const image = element("img");
  image.alt = "";
  image.hidden = true;
  image.onload = () => {
    if (image.parentNode !== poster) return;
    poster.replaceChildren(image);
    image.hidden = false;
  };
  image.onerror = () => image.remove();
  poster.append(image);
  image.src = url;
}

function renderPremieres() {
  const grid = byId("premieres");
  const posters = window.moviePosterUrls ?? {};
  const hasPoster = (movie) => Number(Object.hasOwn(posters, posterKey(movie)));
  const latest = [...movies].sort((a, b) => hasPoster(b) - hasPoster(a) || b.id - a.id).slice(0, 4);

  grid.replaceChildren();
  if (!latest.length) grid.append(element("p", "El catálogo todavía está vacío."));

  for (const movie of latest) {
    const card = element("article", undefined, "premiere-card");
    const poster = element("div", undefined, "poster");
    const actions = element("div", undefined, "poster-actions");
    const link = movieLink(movie.id, "Ver película", "button");
    const add = element("button", "+", "secondary");

    poster.setAttribute("aria-hidden", "true");
    setPoster(poster, movie);
    link.setAttribute("aria-label", `Ver película: ${movie.name}`);
    add.type = "button";
    add.disabled = !canRent(movie);
    add.setAttribute("aria-label", `Añadir ${movie.name} a Alquilados`);
    add.addEventListener("click", () => addToCart(movie));

    actions.append(link, add);
    card.append(
      poster,
      element("h3", movie.name),
      element("p", `${movie.year} · ${availability(movie)}`),
      actions,
    );
    grid.append(card);
  }
}

function matchesSearch(movie, query, terms) {
  if (query === "disponible") return canRent(movie);
  if (query === "no disponible") return !canRent(movie);
  if (query === "alquilada") return isRented(movie);

  const people = [movie.director, ...movie.actors].filter(Boolean);
  const text = normalizeSearch([
    movie.name, movie.year, movie.description,
    canRent(movie) ? "disponible" : "no disponible", availability(movie),
    ...people.flatMap((person) => [fullName(person), person.country, person.year]),
    movie.director?.bio,
    ...movie.genres.map(({ type }) => type),
  ].join(" "));

  return terms.every((term) => text.includes(term));
}

function renderSearchResults() {
  const query = normalizeSearch(search.value);
  const terms = query.split(" ");
  const visible = query ? movies.filter((movie) => matchesSearch(movie, query, terms)) : movies;
  const summary = byId("movie-search-results");

  list.replaceChildren();
  if (!visible.length) {
    summary.textContent = query
      ? "No hay películas que coincidan con la búsqueda."
      : "El catálogo está vacío.";
    return;
  }
  summary.textContent = query
    ? visible.length === 1 ? "1 película encontrada." : `${visible.length} películas encontradas.`
    : "";

  for (const movie of visible) {
    const card = element("article", undefined, "card");
    const link = movieLink(movie.id, canRent(movie) ? "Ver y alquilar" : "Ver ficha", "button secondary");
    const genres = movie.genres.map(({ type }) => type);

    card.classList.toggle("is-rented", isRented(movie));
    link.id = `movie-${movie.id}`;
    link.setAttribute("aria-label", `${link.textContent} · ${movie.name}`);
    card.append(
      element("span", [movie.year, ...genres].join(" · "), "movie-meta"),
      element("h3", movie.name),
      element("p", `${fullName(movie.director)} · ${availability(movie)}`),
      link,
    );
    list.append(card);
  }
}

function renderMovies() {
  if (!list) return;
  renderPremieres();
  renderSearchResults();
}

function loadCatalog() {
  return run("Cargando catálogo…", async () => {
    const [catalog, rentals] = await Promise.all([api.get("/movies"), api.get("/rentals")]);
    movies = catalog.data;
    updateRentedMovies(rentals.data);
    renderMovies();

    if (params.get("deleted") !== "1") return "Catálogo actualizado.";
    params.delete("deleted");
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    return "Película eliminada.";
  });
}

async function refreshActiveRentals() {
  if (busy || document.hidden) return;
  const previous = rentedMovieIds;

  try {
    const { data } = await api.get("/rentals");
    if (busy || previous !== rentedMovieIds || !updateRentedMovies(data)) return;
    renderMovies();
    if (selectedMovie) syncRentalControls();
  } catch {
    // La siguiente consulta volverá a intentarlo.
  }
}

// Ficha y pago de prueba

function setPaymentOpen(open) {
  rentalForm.hidden = !open;
  payButton.setAttribute("aria-expanded", String(open));
  if (open) rentalUser.focus();
}

function syncRentalControls() {
  const rentable = canRent(selectedMovie);
  const canPay = rentable && rentalUsers.length > 0;
  const rented = isRented(selectedMovie);
  const status = byId("detail-availability");

  byId("detail-poster").classList.toggle("is-rented", rented);
  const text = rented ? "Alquilada · pendiente de devolución" : availability(selectedMovie);
  if (status.textContent !== text) status.textContent = text;

  payButton.disabled = !canPay;
  byId("cart-movie").disabled = !rentable;
  byId("rental-controls").hidden = !canPay;

  if (!canPay && !rentalForm.hidden) {
    const focusWasInForm = rentalForm.contains(document.activeElement);
    setPaymentOpen(false);
    if (focusWasInForm) byId("detail-title").focus();
  }

  let help = "Selecciona el usuario que quedará asociado al alquiler.";
  if (!rentable) help = `${text}.`;
  else if (!canPay) help = "Registra un usuario desde Cuenta y recarga la ficha.";
  byId("rental-help").textContent = help;
}

function showMovie(movie) {
  selectedMovie = movie;
  setPoster(byId("detail-poster"), movie);
  setPaymentOpen(false);
  byId("detail-title").textContent = movie.name;
  byId("detail-description").textContent = movie.description || "Sin sinopsis.";

  const data = byId("detail-data");
  data.replaceChildren();
  for (const [label, value] of [
    ["Año", movie.year],
    ["Dirección", fullName(movie.director)],
    ["Reparto", movie.actors.map(fullName).join(", ") || "Sin reparto asociado"],
    ["Géneros", movie.genres.map(({ type }) => type).join(", ") || "Sin géneros asociados"],
  ]) {
    data.append(element("dt", label), element("dd", value));
  }

  const status = element("dd");
  status.id = "detail-availability";
  status.setAttribute("aria-live", "polite");
  data.append(element("dt", "Disponibilidad"), status);

  rentalUser.replaceChildren(
    new Option("Selecciona un usuario", ""),
    ...rentalUsers.map(({ name, id }) => new Option(name, String(id))),
  );
  syncRentalControls();
  showView("detail", byId("detail-title"));
}

async function openMovie(id) {
  await run("Cargando ficha…", async () => {
    const [movie, users] = await Promise.all([checkMovie(id), api.get("/users")]);
    rentalUsers = users.data;
    showMovie(movie);
    return "Ficha cargada.";
  });

  if (params.get("pay") !== "1" || !selectedMovie) return;
  if (payButton.disabled) statusMessage.textContent = byId("rental-help").textContent;
  else setPaymentOpen(true);
}

function today() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function submitRental(event) {
  event.preventDefault();
  const movie = selectedMovie;
  const userId = Number(rentalUser.value);
  if (!movie || !canRent(movie) || !userId) return;

  return run("Registrando alquiler…", async () => {
    const current = await checkMovie(movie.id);
    if (!canRent(current)) {
      showMovie(current);
      return "La película ya no está disponible para alquilar.";
    }

    const { data } = await api.post("/rentals", {
      user_id: userId,
      movie_id: movie.id,
      rental_date: today(),
      return_date: null,
    });

    rentedMovieIds = new Set([...rentedMovieIds, movie.id]);
    removeFromCart(movie.id);
    showMovie(current);
    return `Alquiler confirmado. Referencia: ${data.id}.`;
  });
}

// Alta, edición y borrado

function backToCatalog(id) {
  showView("catalog", byId(`movie-${id}`) ?? byId("catalog-title"));
}

function openForm(movie = null) {
  errorMessage.textContent = "";
  statusMessage.textContent = "";
  editingMovie = movie;
  form.reset();

  byId("form-title").textContent = movie ? "Editar película" : "Nueva película";
  for (const field of ["name", "year", "description"]) byId(field).value = movie?.[field] ?? "";
  byId("available").value = String(movie?.available ?? true);
  byId("director").value = movie ? fullName(movie.director) : "";
  byId("actors").value = movie?.actors.map(fullName).join("\n") ?? "";
  byId("genres").value = movie?.genres.map(({ type }) => type).join("\n") ?? "";
  showView("form", byId("form-title"));
}

function personData(value, field) {
  const [name, ...surname] = value.trim().split(/\s+/);
  if (!name || !surname.length) {
    const label = field === "director" ? "Dirección" : "Reparto";
    throw new FormInputError(field, `${label}: escribe un nombre y un apellido para «${value}».`);
  }
  return { name, surname: surname.join(" ") };
}

async function resolveIds(path, names, records, preferred, label, create) {
  const ids = new Set();
  for (const name of names) {
    const key = normalizeName(name);
    const matches = (record) => normalizeName(label(record)) === key;
    const existing = preferred.filter(matches);

    if (existing.length) {
      for (const record of existing) ids.add(record.id);
      continue;
    }

    let record = records.find(matches);
    if (!record) {
      ({ data: record } = await api.post(path, create(name)));
      records.push(record);
    }
    ids.add(record.id);
  }
  return [...ids];
}

async function submitMovie(event) {
  event.preventDefault();
  if (busy) return;

  const name = byId("name").value.trim();
  if (!name) {
    errorMessage.textContent = "Escribe un título para la película.";
    byId("name").focus();
    return;
  }

  const movie = editingMovie;
  if (!movie && !(await confirmAction("Añadir al catálogo", `¿Quieres añadir «${name}»?`, "Añadir"))) return;

  const payload = {
    name,
    year: Number(byId("year").value),
    description: byId("description").value.trim() || null,
    available: byId("available").value === "true",
  };
  const directorName = byId("director").value.trim();
  const actorNames = relationNames(byId("actors").value);
  const genreNames = relationNames(byId("genres").value);

  return run("Guardando película…", async () => {
    const [directors, actors, genres] = await Promise.all([
      api.get("/directors"), api.get("/actors"), api.get("/genres"),
    ]);
    const people = [
      ["/directors", "director", [directorName], directors.data, movie?.director ? [movie.director] : []],
      ["/actors", "actors", actorNames, actors.data, movie?.actors ?? []],
    ];

    // Valida todos los nombres antes de crear relaciones.
    for (const [, field, names, records, preferred] of people) {
      const known = new Set([...preferred, ...records].map((record) => normalizeName(fullName(record))));
      for (const name of names) {
        if (!known.has(normalizeName(name))) personData(name, field);
      }
    }

    for (const [path, field, names, records, preferred] of people) {
      const ids = await resolveIds(path, names, records, preferred, fullName, (name) => personData(name, field));
      if (field === "director") [payload.director_id] = ids;
      else payload.actor_ids = ids;
    }
    payload.genre_ids = await resolveIds(
      "/genres", genreNames, genres.data, movie?.genres ?? [],
      ({ type }) => type, (type) => ({ type }),
    );

    const { data } = movie
      ? await api.put(`/movies/${movie.id}`, payload)
      : await api.post("/movies", payload);

    if (isDetail) {
      showMovie(data);
    } else {
      movies = [...movies, data];
      renderMovies();
      backToCatalog(data.id);
    }
    return movie ? "Película actualizada." : "Película creada.";
  });
}

async function deleteMovie() {
  const movie = selectedMovie;
  if (busy || !movie || !(await confirmAction(
    "Eliminar del catálogo", `¿Quieres eliminar «${movie.name}»?`, "Eliminar", true,
  ))) return;

  return run("Eliminando película…", async () => {
    await api.delete(`/movies/${movie.id}`);
    removeFromCart(movie.id);
    window.location.href = "index.html?deleted=1#catalogo";
  });
}

// Eventos e inicio

for (const link of document.querySelectorAll("[data-api-docs]")) link.href = `${apiUrl}/docs`;

form.addEventListener("submit", submitMovie);
rentalForm?.addEventListener("submit", submitRental);
byId("delete-movie")?.addEventListener("click", deleteMovie);
byId("reload")?.addEventListener("click", loadCatalog);
search?.addEventListener("input", renderSearchResults);
createButton?.addEventListener("click", () => openForm());
byId("edit-movie")?.addEventListener("click", () => openForm(selectedMovie));
byId("cancel-form").addEventListener("click", () => {
  if (editingMovie) showMovie(editingMovie);
  else backToCatalog();
});
byId("open-cart").addEventListener("click", () => byId("cart-dialog").showModal());
byId("cart-movie")?.addEventListener("click", () => addToCart(selectedMovie));
payButton?.addEventListener("click", () => setPaymentOpen(rentalForm.hidden));

renderCart();

if (!api) {
  errorMessage.textContent = "No se pudo cargar Axios. Comprueba tu conexión y recarga la página.";
} else {
  if (isDetail) {
    const id = Number(params.get("id"));
    if (Number.isSafeInteger(id) && id > 0) openMovie(id);
    else errorMessage.textContent = "No se ha indicado una película válida. Vuelve al catálogo.";
  } else {
    loadCatalog();
  }

  window.setInterval(refreshActiveRentals, 10000);
}