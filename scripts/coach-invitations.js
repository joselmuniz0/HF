/* HF Coach Central — custom coach invitation flow.
   Invite tokens stay in the URL fragment, are previewed without consumption,
   and are accepted only through a server-validated POST. */
(function () {
  "use strict";

  var clientPromise = null;

  function byId(id) { return document.getElementById(id); }
  function setVisible(id, visible) {
    var node = byId(id);
    if (node) node.hidden = !visible;
  }
  function setStatus(id, message, kind) {
    var node = byId(id);
    if (!node) return;
    node.textContent = message || "";
    node.className = "status" + (kind ? " " + kind : "");
    node.hidden = !message;
  }
  function escapeDate(value) {
    if (!value) return "—";
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("es-AR");
  }
  async function getClient() {
    if (window.HF_SUPABASE_CLIENT) return window.HF_SUPABASE_CLIENT;
    if (clientPromise) return clientPromise;
    clientPromise = (async function () {
      var config = window.HF_CENTRAL_CONFIG || {};
      if (!config.supabaseUrl || !config.supabasePublishableKey) {
        throw new Error("HF Central no tiene configurada la conexión con Supabase.");
      }
      var module = await import("https://esm.sh/@supabase/supabase-js@2");
      var client = module.createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      });
      window.HF_SUPABASE_CLIENT = client;
      return client;
    })();
    try { return await clientPromise; }
    catch (error) { clientPromise = null; throw error; }
  }
  async function invoke(name, body) {
    var client = await getClient();
    var result = await client.functions.invoke(name, { body: body });
    if (result.error) {
      var detail = result.error.message || "No se pudo completar la operación.";
      try {
        var payload = await result.error.context.clone().json();
        if (payload && payload.error) detail = payload.error;
      } catch (_) {}
      throw new Error(detail);
    }
    if (result.data && result.data.error) throw new Error(result.data.error);
    return result.data || {};
  }
  function readToken() {
    var fragment = window.location.hash.replace(/^#/, "");
    var params = new URLSearchParams(fragment);
    return params.get("coach_invite") || "";
  }
  function clearTokenFromAddress() {
    history.replaceState({}, document.title, window.location.pathname + window.location.search);
  }

  async function acceptExisting(token, email, password) {
    setStatus("coachInviteExistingStatus", "Validando las credenciales…", "");
    var client = await getClient();
    var signed = await client.auth.signInWithPassword({ email: email, password: password });
    if (signed.error) throw signed.error;
    var accepted = await invoke("accept-coach-invitation", {
      action: "accept_existing",
      token: token
    });
    if (!accepted.ok) throw new Error("No se pudo confirmar la invitación.");
    completeAcceptance();
  }
  async function acceptNew(token, email, password, confirmation) {
    if (password.length < 12 || password.length > 128) {
      throw new Error("La contraseña debe tener entre 12 y 128 caracteres.");
    }
    if (password !== confirmation) throw new Error("Las contraseñas no coinciden.");
    setStatus("coachInviteNewStatus", "Creando tu cuenta y confirmando la invitación…", "");
    var result = await invoke("accept-coach-invitation", {
      action: "accept_new",
      token: token,
      password: password
    });
    if (!result.ok) throw new Error("No se pudo confirmar la invitación.");
    var client = await getClient();
    var current = await client.auth.getSession();
    if (current.data && current.data.session) await client.auth.signOut();
    var signed = await client.auth.signInWithPassword({ email: email, password: password });
    if (signed.error) throw signed.error;
    completeAcceptance();
  }
  function completeAcceptance() {
    clearTokenFromAddress();
    setStatus("coachInviteGlobalStatus",
      "Invitación confirmada. Tu cuenta ya tiene el rol de coach en HF Coach. Abriendo tu espacio…", "success");
    setVisible("coachInviteExistingForm", false);
    setVisible("coachInviteNewForm", false);
    setVisible("coachInviteSignedIn", false);
    window.setTimeout(function () { window.location.replace(window.location.pathname); }, 900);
  }

  async function showInvitation(token) {
    setVisible("loginPanel", false);
    setVisible("dashboard", false);
    setVisible("inviteSetupPanel", false);
    setVisible("inviteDonePanel", false);
    setVisible("passwordResetPanel", false);
    setVisible("coachInviteLanding", true);
    setStatus("coachInviteGlobalStatus", "Comprobando la invitación…", "");
    setVisible("coachInviteExistingForm", false);
    setVisible("coachInviteNewForm", false);
    setVisible("coachInviteSignedIn", false);

    var preview = await invoke("accept-coach-invitation", {
      action: "preview",
      token: token
    });
    if (!preview.valid) throw new Error("La invitación no está disponible.");
    byId("coachInviteGreeting").textContent = "Hola " + preview.display_name + ".";
    byId("coachInviteEmail").textContent = preview.email;
    byId("coachInviteOrganization").textContent = preview.organization_name || "HF Coach";
    byId("coachInviteExpiry").textContent = "Vence: " + escapeDate(preview.expires_at);

    var client = await getClient();
    var sessionResult = await client.auth.getSession();
    var session = sessionResult.data && sessionResult.data.session;
    var signedEmail = session && session.user && String(session.user.email || "").toLowerCase();
    if (signedEmail && signedEmail === preview.email.toLowerCase()) {
      setVisible("coachInviteSignedIn", true);
      setStatus("coachInviteGlobalStatus", "La sesión abierta corresponde al correo invitado. Confirmá para incorporar la cuenta a la organización.", "success");
      byId("coachInviteAcceptSignedIn").onclick = async function () {
        var button = this;
        button.disabled = true;
        try {
          await invoke("accept-coach-invitation", { action: "accept_existing", token: token });
          completeAcceptance();
        } catch (error) {
          setStatus("coachInviteGlobalStatus", error.message || String(error), "error");
          button.disabled = false;
        }
      };
      return;
    }

    if (preview.account_exists) {
      setVisible("coachInviteExistingForm", true);
      setStatus("coachInviteGlobalStatus", "Esta dirección ya tiene una cuenta de HF Coach. Iniciá sesión con ese correo y tu contraseña para aceptar la invitación.", "");
      byId("coachInviteExistingForm").onsubmit = async function (event) {
        event.preventDefault();
        var button = byId("coachInviteExistingSubmit");
        button.disabled = true;
        try {
          await acceptExisting(token, preview.email, byId("coachInviteExistingPassword").value);
        } catch (error) {
          setStatus("coachInviteExistingStatus", error.message || String(error), "error");
          button.disabled = false;
        }
      };
    } else {
      setVisible("coachInviteNewForm", true);
      setStatus("coachInviteGlobalStatus", "Esta invitación te permite crear tu cuenta personal de coach.", "");
      byId("coachInviteNewForm").onsubmit = async function (event) {
        event.preventDefault();
        var button = byId("coachInviteNewSubmit");
        button.disabled = true;
        try {
          await acceptNew(
            token,
            preview.email,
            byId("coachInviteNewPassword").value,
            byId("coachInviteNewPasswordConfirm").value
          );
        } catch (error) {
          setStatus("coachInviteNewStatus", error.message || String(error), "error");
          button.disabled = false;
        }
      };
    }
  }

  function statusLabel(item) {
    if (item.accepted_at) return "Aceptada · " + escapeDate(item.accepted_at);
    if (item.revoked_at) return "Revocada";
    if (new Date(item.expires_at).getTime() <= Date.now()) return "Vencida";
    return "Pendiente · vence " + escapeDate(item.expires_at);
  }
  async function refreshInvitations() {
    var list = byId("coachInvitationsList");
    var button = byId("refreshCoachInvitations");
    if (!list) return;
    if (button) button.disabled = true;
    list.replaceChildren();
    var loading = document.createElement("p");
    loading.textContent = "Cargando invitaciones…";
    list.appendChild(loading);
    try {
      var result = await invoke("manage-coach-invitations", { action: "list" });
      list.replaceChildren();
      var items = result.invitations || [];
      if (!items.length) {
        var empty = document.createElement("p");
        empty.textContent = "Todavía no hay invitaciones registradas.";
        list.appendChild(empty);
        return;
      }
      items.forEach(function (item) {
        var row = document.createElement("div");
        row.className = "coach-invitation-row";
        var details = document.createElement("div");
        details.className = "coach-invitation-details";
        var name = document.createElement("strong");
        name.textContent = item.display_name + " · " + item.email;
        var meta = document.createElement("small");
        meta.textContent = statusLabel(item) + " · creada " + escapeDate(item.created_at);
        details.append(name, meta);
        row.appendChild(details);
        var pending = !item.accepted_at && !item.revoked_at && new Date(item.expires_at).getTime() > Date.now();
        if (pending) {
          var revoke = document.createElement("button");
          revoke.type = "button";
          revoke.className = "quiet";
          revoke.textContent = "Revocar";
          revoke.addEventListener("click", async function () {
            revoke.disabled = true;
            try {
              await invoke("manage-coach-invitations", {
                action: "revoke",
                invitation_id: item.id
              });
              await refreshInvitations();
              setStatus("coachInvitationAdminStatus", "Invitación revocada.", "success");
            } catch (error) {
              setStatus("coachInvitationAdminStatus", error.message || String(error), "error");
              revoke.disabled = false;
            }
          });
          row.appendChild(revoke);
        }
        list.appendChild(row);
      });
    } catch (error) {
      list.replaceChildren();
      var failure = document.createElement("p");
      failure.textContent = error.message || String(error);
      list.appendChild(failure);
    } finally {
      if (button) button.disabled = false;
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var token = readToken();
    if (token) {
      showInvitation(token).catch(function (error) {
        setVisible("coachInviteLanding", true);
        setVisible("loginPanel", false);
        setVisible("dashboard", false);
        setStatus("coachInviteGlobalStatus", error.message || String(error), "error");
      });
    }
    var refresh = byId("refreshCoachInvitations");
    if (refresh) refresh.addEventListener("click", refreshInvitations);
    if (refresh) refreshInvitations();
  });
})();