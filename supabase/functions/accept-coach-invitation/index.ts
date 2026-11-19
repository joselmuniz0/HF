import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
async function findUserByEmail(adminClient: any, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("No se pudo comprobar la cuenta: " + error.message);
    const users = data.users || [];
    const found = users.find((u: any) => (u.email || "").toLowerCase() === email);
    if (found) return found;
    if (users.length < 1000) return null;
  }
  throw new Error("Se superó el límite de búsqueda de cuentas.");
}
async function loadInvitation(adminClient: any, tokenHash: string) {
  const { data, error } = await adminClient
    .from("coach_invitations")
    .select("id, organization_id, email, display_name, role, expires_at, accepted_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { invitation: null, status: "not_found" };
  if (data.accepted_at) return { invitation: data, status: "used" };
  if (data.revoked_at) return { invitation: data, status: "revoked" };
  if (new Date(data.expires_at).getTime() <= Date.now()) return { invitation: data, status: "expired" };
  return { invitation: data, status: "pending" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Faltan secretos de Supabase." }, 500);

  const adminClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const body = await req.json();
    const action = String(body.action || "");
    const token = String(body.token || "").trim();
    if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return json({ error: "El enlace de invitación no es válido.", code: "INVITE_INVALID" }, 404);
    const tokenHash = await sha256Hex(token);
    const { invitation, status } = await loadInvitation(adminClient, tokenHash);

    if (action === "preview") {
      if (!invitation || status !== "pending") {
        const messages: Record<string, string> = {
          not_found: "La invitación no existe o el enlace está incompleto.",
          used: "Esta invitación ya fue aceptada.",
          revoked: "Esta invitación fue revocada por el administrador.",
          expired: "Esta invitación venció. Solicitá una nueva al administrador.",
        };
        return json({ valid: false, error: messages[status] || "Invitación no válida.", code: status.toUpperCase() }, status === "not_found" ? 404 : 410);
      }
      const [{ data: organization, error: orgError }, existingUser] = await Promise.all([
        adminClient.from("organizations").select("name").eq("id", invitation.organization_id).maybeSingle(),
        findUserByEmail(adminClient, invitation.email),
      ]);
      if (orgError) throw orgError;
      return json({
        valid: true,
        email: invitation.email,
        display_name: invitation.display_name,
        organization_name: organization?.name || "HF Coach",
        expires_at: invitation.expires_at,
        account_exists: Boolean(existingUser),
      });
    }

    if (action === "accept_existing") {
      if (!invitation || status !== "pending") return json({ error: "La invitación ya no está disponible.", code: status.toUpperCase() }, 410);
      const authorization = req.headers.get("Authorization");
      if (!authorization?.startsWith("Bearer ")) return json({ error: "Iniciá sesión con la cuenta invitada.", code: "AUTH_REQUIRED" }, 401);
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: authData, error: authError } = await userClient.auth.getUser();
      if (authError || !authData.user) return json({ error: "La sesión no es válida. Iniciá sesión nuevamente." }, 401);
      if ((authData.user.email || "").toLowerCase() !== invitation.email) {
        return json({ error: "La sesión pertenece a un correo diferente al de la invitación.", code: "EMAIL_MISMATCH" }, 403);
      }
      const { data, error } = await adminClient.rpc("accept_coach_invitation", {
        p_token_hash: tokenHash,
        p_user_id: authData.user.id,
        p_email: invitation.email,
        p_display_name: invitation.display_name,
      });
      if (error) throw error;
      return json({ ok: true, ...data });
    }

    if (action === "set_existing_password") {
      if (!invitation || status !== "pending") {
        return json({ error: "La invitación ya no está disponible.", code: status.toUpperCase() }, 410);
      }
      const password = String(body.password || "");
      if (password.length < 12 || password.length > 128) {
        return json({ error: "La contraseña debe tener entre 12 y 128 caracteres." }, 400);
      }
      const existingUser = await findUserByEmail(adminClient, invitation.email);
      if (!existingUser) {
        return json({ error: "No encontramos una cuenta existente para esta invitación. Usá la opción de crear cuenta.", code: "ACCOUNT_NOT_FOUND" }, 404);
      }
      const { data: existingMembership, error: membershipError } = await adminClient
        .from("organization_memberships")
        .select("role")
        .eq("organization_id", invitation.organization_id)
        .eq("user_id", existingUser.id)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (existingMembership?.role === "admin") {
        return json({ error: "Una cuenta administradora no puede aceptar una invitación de coach." }, 409);
      }

      const { error: passwordError } = await adminClient.auth.admin.updateUserById(existingUser.id, {
        password,
        email_confirm: true
      });
      if (passwordError) throw passwordError;

      const { data, error } = await adminClient.rpc("accept_coach_invitation", {
        p_token_hash: tokenHash,
        p_user_id: existingUser.id,
        p_email: invitation.email,
        p_display_name: invitation.display_name,
      });
      if (error) throw error;
      return json({ ok: true, password_updated: true, ...data });
    }

    if (action === "accept_new") {
      if (!invitation || status !== "pending") return json({ error: "La invitación ya no está disponible.", code: status.toUpperCase() }, 410);
      const password = String(body.password || "");
      if (password.length < 12 || password.length > 128) {
        return json({ error: "La contraseña debe tener entre 12 y 128 caracteres." }, 400);
      }
      const existingUser = await findUserByEmail(adminClient, invitation.email);
      if (existingUser) {
        return json({ error: "Esta dirección ya tiene una cuenta. Elegí 'Ya tengo cuenta' e iniciá sesión.", code: "ACCOUNT_EXISTS" }, 409);
      }
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email: invitation.email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: invitation.display_name,
          hf_organization_id: invitation.organization_id,
        },
      });
      if (createError || !created.user) {
        return json({ error: createError?.message || "No se pudo crear la cuenta." }, 400);
      }
      const { data, error } = await adminClient.rpc("accept_coach_invitation", {
        p_token_hash: tokenHash,
        p_user_id: created.user.id,
        p_email: invitation.email,
        p_display_name: invitation.display_name,
      });
      if (error) {
        await adminClient.auth.admin.deleteUser(created.user.id);
        throw error;
      }
      return json({ ok: true, account_created: true, ...data });
    }

    return json({ error: "Acción no válida." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});