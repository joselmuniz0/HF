import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(".hf-central/admin");
const appPath = path.join(dir, "app.js");
const htmlPath = path.join(dir, "index.html");
let app = fs.readFileSync(appPath, "utf8");
let html = fs.readFileSync(htmlPath, "utf8");

function replaceOnce(source, needle, replacement, label) {
  const at = source.indexOf(needle);
  if (at < 0) throw new Error("No se encontró " + label);
  return source.slice(0, at) + replacement + source.slice(at + needle.length);
}

const coachSelectOld = `  if ($("newAthleteCoach")) {
    const coaches = data.memberships.filter(function(m){ return m.role === "coach"; }).map(function(m) {
      const p = data.coaches.find(function(c){ return c.user_id === m.user_id; });
      return '<option value="' + esc(m.user_id) + '">' + esc(p && p.display_name || p && p.email || "Coach") + '</option>';
    }).join("");
    $("newAthleteCoach").innerHTML = '<option value="">Asignarme a mí</option>' + coaches;
    $("newAthleteCoach").disabled = currentRole !== "admin";
  }`;
const coachSelectNew = `  if ($("newAthleteCoach")) {
    const coaches = data.memberships.filter(function(m){ return m.role === "coach"; }).map(function(m) {
      const p = data.coaches.find(function(c){ return c.user_id === m.user_id; });
      return '<option value="' + esc(m.user_id) + '">' + esc(p && p.display_name || p && p.email || "Coach") + '</option>';
    }).join("");
    if (currentRole === "admin") {
      $("newAthleteCoach").innerHTML = '<option value="">Seleccionar coach responsable…</option>' + coaches;
      $("newAthleteCoach").disabled = false;
      $("newAthleteCoach").required = true;
    } else {
      const p = data.coaches.find(function(c){ return c.user_id === currentUserId; });
      $("newAthleteCoach").innerHTML = '<option value="' + esc(currentUserId) + '">' + esc(p && (p.display_name || p.email) || "Mi grupo de atletas") + '</option>';
      $("newAthleteCoach").disabled = true;
      $("newAthleteCoach").required = false;
    }
  }`;
if (app.includes(coachSelectOld)) app = app.replace(coachSelectOld, coachSelectNew);

const requestsStart = app.indexOf("  const requestRows = (data.accessRequests || []).filter(function(r){ return r.status === \\"pending\\"; });");
const plansStart = app.indexOf('  $("plansList").innerHTML', requestsStart);
if (requestsStart < 0 || plansStart < 0) throw new Error("No se encontró el listado de solicitudes de atletas.");
const requestsBlock = `  const requestRows = (data.accessRequests || []).filter(function(r){ return r.status === "pending"; });
  $("accessRequests").innerHTML = requestRows.map(function(r) {
    const coach = data.coaches.find(function(c){ return c.user_id === r.requested_coach_id; });
    const athlete = r.athlete_id ? data.athletes.find(function(a){ return a.id === r.athlete_id; }) : null;
    const athleteOptions = data.athletes.map(function(a) {
      return '<option value="' + esc(a.id) + '">' + esc(a.full_name) + '</option>';
    }).join("");
    const profileStatus = r.athlete_id
      ? '<div class="subtle">Ficha creada en la base general' + (athlete ? ' · ' + esc(athlete.full_name) : '') + '</div>'
      : '<select data-request-athlete="' + esc(r.id) + '"><option value="">Elegir ficha deportiva existente…</option>' + athleteOptions + '</select>';
    return '<div class="access-request"><div><b>' + esc(r.requested_full_name) + '</b><div class="subtle">' +
      esc(r.requested_email) + ' · Coach: ' + esc(coach && (coach.display_name || coach.email) || "—") +
      '</div><small>' + esc(r.message || "Sin mensaje") + '</small>' + profileStatus + '</div>' +
      '<button type="button" class="primary" data-approve-request="' + esc(r.id) +
      '" data-athlete-id="' + esc(r.athlete_id || "") + '">Aprobar y vincular</button></div>';
  }).join("") || '<div class="empty">No hay solicitudes pendientes.</div>';

`;
app = app.slice(0, requestsStart) + requestsBlock + app.slice(plansStart);

const ownStart = app.indexOf("async function loadOwnRequests() {");
const ownEnd = app.indexOf("\nasync function registerAthleteAccount", ownStart);
if (ownStart < 0 || ownEnd < 0) throw new Error("No se encontró loadOwnRequests.");
const ownFunction = `async function loadOwnRequests() {
  const result = await getClient().from("athlete_access_requests")
    .select("id,status,created_at,review_note,athlete_id").eq("requested_by", currentUserId)
    .order("created_at", {ascending:false});
  if (result.error) throw result.error;
  $("ownRequests").innerHTML = (result.data || []).map(function(r) {
    return '<div class="timeline-row">Solicitud <b>' + esc(r.status) +
      '</b> · ' + date(r.created_at) +
      (r.athlete_id ? '<div>Ficha deportiva creada y asociada a la solicitud.</div>' : '') +
      (r.review_note ? '<div>' + esc(r.review_note) + '</div>' : '') + '</div>';
  }).join("") || '<p class="muted">Todavía no enviaste una solicitud.</p>';
  const pending = (result.data || []).some(function(r){ return r.status === "pending"; });
  const form = $("athleteAccessForm");
  if (form) Array.from(form.elements).forEach(function(control){ control.disabled = pending; });
  if (pending) {
    $("accessStatus").textContent = "Tu ficha ya fue guardada en la base general. El acceso al portal se activará cuando el coach apruebe la vinculación.";
    $("accessStatus").className = "status success";
  }
}`;
app = app.slice(0, ownStart) + ownFunction + app.slice(ownEnd);

const approveStart = app.indexOf("async function approveAthleteAccount(event) {");
const approveEnd = app.indexOf("\nasync function createAthleteProfile", approveStart);
if (approveStart < 0 || approveEnd < 0) throw new Error("No se encontró approveAthleteAccount.");
const approveFunction = `async function approveAthleteAccount(event) {
  const button = event.target.closest("[data-approve-request]");
  if (!button) return;
  const requestId = button.dataset.approveRequest;
  const select = document.querySelector('[data-request-athlete="' + requestId + '"]');
  const athleteId = button.dataset.athleteId || (select && select.value) || "";
  if (!athleteId && !select) return message("La solicitud no tiene una ficha asociada. Actualizá los datos e intentá nuevamente.", "error");
  if (!athleteId && select && !select.value) return message("Seleccioná la ficha existente que corresponde al atleta.", "error");
  button.disabled = true;
  try {
    const result = await getClient().functions.invoke("approve-athlete-access", {
      body: { request_id: requestId, athlete_id: athleteId || select.value }
    });
    if (result.error) throw result.error;
    if (result.data && result.data.error) throw new Error(result.data.error);
    await loadData();
    message("Cuenta vinculada con " + result.data.athlete_name + ".", "success");
  } catch(error) {
    button.disabled = false;
    message("No se pudo aprobar la solicitud: " + (error.message || error), "error");
  }
}`;
app = app.slice(0, approveStart) + approveFunction + app.slice(approveEnd);

app = app.replace(
  "Solicitud enviada. Tu coach debe aprobarla y vincular la cuenta con tu ficha.",
  "Ficha deportiva guardada en la base general. Tu coach debe aprobar el acceso al portal."
);

html = html.replace(
  "Tu correo está registrado. Indicá el correo habitual del coach que te entrena. Tu solicitud deberá ser aprobada.",
  "Tu correo ya está registrado. Indicá el correo del coach que te entrena; al enviar la solicitud, tu ficha deportiva se crea en la base general y queda pendiente de aprobación."
);
if (!html.includes('id="newAthleteEmail"')) throw new Error("El formulario de alta no exige correo electrónico.");
if (!app.includes('create-athlete-invitation')) throw new Error("El alta del coach no llama a la invitación.");
if (!app.includes('data-athlete-id')) throw new Error("No se agregó la asociación automática de la ficha a la solicitud.");

fs.writeFileSync(appPath, app, "utf8");
fs.writeFileSync(htmlPath, html, "utf8");
console.log("HF Central athlete onboarding now requires email and persists linked athlete profiles.");
