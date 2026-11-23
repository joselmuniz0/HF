/* HF Coach Central - isolated password recovery controller.
   This classic script binds immediately, independently of the main app module. */
(function () {
  "use strict";

  let recoveryClientPromise = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function showStatus(message, type) {
    const status = byId("passwordRecoveryRequestStatus");
    if (!status) return;
    status.style.display = "block";
    status.textContent = message;
    status.className = "notice" + (type ? " " + type : "");
  }

  function showResetStatus(message, type) {
    const status = byId("passwordResetStatus");
    if (!status) return;
    status.style.display = "block";
    status.textContent = message;
    status.className = "notice" + (type ? " " + type : "");
  }

  async function getRecoveryClient() {
    if (recoveryClientPromise) return recoveryClientPromise;

    recoveryClientPromise = (async function () {
      const runtime = window.HF_CENTRAL_CONFIG || {};
      const urlInput = byId("supabaseUrl");
      const keyInput = byId("supabaseKey");
      const url = String(runtime.supabaseUrl || (urlInput && urlInput.value) || "").trim();
      const key = String(runtime.supabasePublishableKey || (keyInput && keyInput.value) || "").trim();

      if (!url.startsWith("https://") || !key) {
        throw new Error("HF Central no tiene configurada la URL y la clave pública de Supabase.");
      }

      showStatus("Cargando el módulo seguro de autenticación…", "");
      const supabaseModule = await import("https://esm.sh/@supabase/supabase-js@2");
      const client = supabaseModule.createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: "implicit",
          storageKey: "sb-" + new URL(url).hostname.split(".")[0] + "-auth-token"
        }
      });

      window.HF_RECOVERY_CLIENT = client;
      return client;
    })();

    try {
      return await recoveryClientPromise;
    } catch (error) {
      recoveryClientPromise = null;
      throw error;
    }
  }

  async function sendRecoveryRequest(button) {
    const emailInput = byId("recoveryEmail");
    if (!emailInput) {
      showStatus("No se encontró el campo de correo de recuperación. Recargá HF Central.", "error");
      return;
    }

    const email = emailInput.value.trim().toLowerCase();
    if (!email) {
      showStatus("Ingresá el correo de tu cuenta antes de continuar.", "error");
      emailInput.focus();
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Enviando…";
    showStatus("Conectando con Supabase y solicitando el enlace…", "");

    try {
      const client = await getRecoveryClient();
      const redirectTo = window.location.origin + "/";
      const result = await client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
      if (result.error) throw result.error;

      showStatus(
        "Supabase aceptó la solicitud. Revisá Recibidos y Spam. Si el mensaje no llega, revisaremos los registros de entrega y los límites del correo integrado.",
        "success"
      );
    } catch (error) {
      console.error("HF Coach recovery request failed:", error);
      showStatus(
        "No se pudo solicitar la recuperación: " +
          (error && error.message ? error.message : String(error)),
        "error"
      );
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  function showAuthCallbackNotice(message, type) {
    const loginPanel = byId("loginPanel");
    let notice = byId("authCallbackNotice");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "authCallbackNotice";
      notice.setAttribute("role", "status");
      notice.className = "notice";
      if (loginPanel) loginPanel.insertBefore(notice, loginPanel.firstChild);
      else document.body.insertBefore(notice, document.body.firstChild);
    }
    notice.textContent = message;
    notice.className = "notice" + (type ? " " + type : "");
    notice.style.display = "block";
  }

  async function finishRecoveryFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const tokenType = params.get("type");
    const code = params.get("code");
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");
    const fragmentType = fragment.get("type");
    const callbackType = fragmentType || tokenType || "";

    const hasImplicitSession = Boolean(accessToken && refreshToken);
    if (!tokenHash && !code && !hasImplicitSession) return;

    // Supabase coach/athlete invitations have their own acceptance flow.
    // Do not let the password-recovery controller intercept those links.
    if (callbackType === "invite") return;

    const supportedTypes = ["recovery", "signup", "email", "magiclink", "email_change"];
    if (!code && !supportedTypes.includes(callbackType)) return;
    if (hasImplicitSession && (!accessToken || !refreshToken)) return;

    const isRecovery = callbackType === "recovery" || (Boolean(code) && !callbackType);
    const loginPanel = byId("loginPanel");
    const inviteSetupPanel = byId("inviteSetupPanel");
    const inviteDonePanel = byId("inviteDonePanel");
    const resetPanel = byId("passwordResetPanel");
    const resetForm = byId("passwordResetForm");

    if (isRecovery) {
      if (loginPanel) loginPanel.hidden = true;
      if (inviteSetupPanel) inviteSetupPanel.hidden = true;
      if (inviteDonePanel) inviteDonePanel.hidden = true;
      if (resetPanel) resetPanel.hidden = false;
      if (resetForm) resetForm.hidden = true;
      showResetStatus("Validando el enlace de recuperación…", "");
    } else {
      if (resetPanel) resetPanel.hidden = true;
      if (loginPanel) loginPanel.hidden = false;
      showAuthCallbackNotice("Validando el enlace de confirmación…", "");
    }

    try {
      const client = await getRecoveryClient();
      let result;

      if (hasImplicitSession) {
        result = await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
      } else if (tokenHash) {
        // Use the real Supabase OTP type (e.g. "email" for a confirmation link).
        result = await client.auth.verifyOtp({
          token_hash: tokenHash,
          type: tokenType
        });
      } else {
        // Legacy PKCE links are exchanged on the same browser that requested them.
        result = await client.auth.exchangeCodeForSession(code);
      }

      if (result.error) throw result.error;
      const session = result.data && result.data.session;
      if (!session) {
        throw new Error("Supabase no devolvió una sesión válida. El enlace pudo vencer o ya haberse utilizado.");
      }

      if (isRecovery) {
        const email = session.user && session.user.email;
        const emailLabel = byId("passwordRecoveryEmail");
        if (emailLabel) emailLabel.textContent = email || "Cuenta";
        if (resetForm) resetForm.hidden = false;
        showResetStatus("Enlace validado. Definí una contraseña nueva de al menos 10 caracteres.", "success");
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      // The shared Supabase storage key lets the main HF Central client read
      // this verified session after reload and route the athlete to their next step.
      const cleanPath = window.location.pathname || "/";
      window.history.replaceState({}, document.title, cleanPath);
      window.location.replace(cleanPath);
    } catch (error) {
      console.error("HF Coach auth callback failed:", error);
      const message = error && error.message ? error.message : String(error);
      if (isRecovery) {
        if (resetForm) resetForm.hidden = true;
        showResetStatus("No se pudo validar el enlace de recuperación: " + message, "error");
      } else {
        if (resetPanel) resetPanel.hidden = true;
        if (loginPanel) loginPanel.hidden = false;
        showAuthCallbackNotice("No se pudo confirmar el correo: " + message + ". Solicitá un nuevo enlace e intentá otra vez.", "error");
      }
    }
  }

  async function saveNewPassword(button) {
    const passwordInput = byId("recoveryNewPassword");
    const confirmationInput = byId("recoveryConfirmPassword");
    if (!passwordInput || !confirmationInput) {
      showResetStatus("No se encontraron los campos de contraseña. Recargá el enlace de recuperación.", "error");
      return;
    }

    const password = passwordInput.value;
    const confirmation = confirmationInput.value;

    if (password.length < 10) {
      showResetStatus("La contraseña debe tener al menos 10 caracteres.", "error");
      passwordInput.focus();
      return;
    }
    if (password !== confirmation) {
      showResetStatus("Las contraseñas no coinciden.", "error");
      confirmationInput.focus();
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Guardando…";
    showResetStatus("Actualizando la contraseña de la cuenta…", "");

    try {
      const client = await getRecoveryClient();
      const result = await client.auth.updateUser({ password: password });
      if (result.error) throw result.error;

      await client.auth.signOut();
      const form = byId("passwordResetForm");
      if (form) form.hidden = true;
      const backButton = byId("passwordResetBackBtn");
      if (backButton) backButton.hidden = false;

      showResetStatus("Contraseña actualizada. Volvé al ingreso e iniciá sesión con tu correo y la contraseña nueva.", "success");
    } catch (error) {
      console.error("HF Coach password update failed:", error);
      showResetStatus(
        "No se pudo actualizar la contraseña: " +
          (error && error.message ? error.message : String(error)),
        "error"
      );
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  function returnToLogin() {
    const resetPanel = byId("passwordResetPanel");
    const backButton = byId("passwordResetBackBtn");
    const loginPanel = byId("loginPanel");
    if (resetPanel) resetPanel.hidden = true;
    if (backButton) backButton.hidden = true;
    if (loginPanel) loginPanel.hidden = false;
  }

  function bindControls() {
    const requestButton = byId("passwordRecoveryRequestBtn");
    if (requestButton && !requestButton.dataset.hfRecoveryBound) {
      requestButton.dataset.hfRecoveryBound = "1";
      requestButton.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        sendRecoveryRequest(requestButton);
      });
    }

    const saveButton = byId("passwordResetSaveBtn");
    if (saveButton && !saveButton.dataset.hfRecoveryBound) {
      saveButton.dataset.hfRecoveryBound = "1";
      saveButton.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        saveNewPassword(saveButton);
      });
    }

    const backButton = byId("passwordResetBackBtn");
    if (backButton && !backButton.dataset.hfRecoveryBound) {
      backButton.dataset.hfRecoveryBound = "1";
      backButton.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        returnToLogin();
      });
    }
  }

  bindControls();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      bindControls();
      finishRecoveryFromUrl();
    }, { once: true });
  } else {
    finishRecoveryFromUrl();
  }
})();
