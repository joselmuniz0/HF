import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization");
    if (!url || !anonKey || !serviceKey) throw new Error("Faltan secretos de Supabase.");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Sesión requerida.", code: "AUTH_REQUIRED" }, 401);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "La sesión no es válida." }, 401);

    const body = await req.json();
    const organizationId = String(body.organization_id || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const displayName = String(body.display_name || "").trim();
    if (!uuid.test(organizationId)) return json({ error: "Organización inválida." }, 400);
    if (!emailPattern.test(email) || displayName.length < 2 || displayName.length > 100) {
      return json({ error: "Ingresá un nombre y correo válidos." }, 400);
    }

    const siteUrl = (Deno.env.get("HF_CENTRAL_SITE_URL") || "https://hf-coach-central.vercel.app").trim().replace(/\/+$/, "");
    const site = new URL(siteUrl);
    if (site.protocol !== "https:" || site.hostname !== "hf-coach-central.vercel.app" || site.port) {
      throw new Error("HF_CENTRAL_SITE_URL no corresponde al dominio oficial de HF Coach Central.");
    }

    const adminClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: membership, error: membershipError } = await adminClient
      .from("organization_memberships").select("role")
      .eq("organization_id", organizationId).eq("user_id", authData.user.id).maybeSingle();
    if (membershipError) throw membershipError;
    if (membership?.role !== "admin") return json({ error: "Solo un administrador puede invitar coaches." }, 403);

    const existingUser = await findUserByEmail(adminClient, email);
    if (existingUser) {
      const { data: existingMembership, error } = await adminClient
        .from("organization_memberships").select("role")
        .eq("organization_id", organizationId).eq("user_id", existingUser.id).maybeSingle();
      if (error) throw error;
      if (existingMembership?.role === "admin") {
        return json({ error: "Esta cuenta es administradora y no puede recibir una invitación de coach." }, 409);
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
    const { error: revokeError } = await adminClient.from("coach_invitations")
      .update({ revoked_at: now.toISOString() })
      .eq("organization_id", organizationId).eq("email", email)
      .is("accepted_at", null).is("revoked_at", null);
    if (revokeError) throw revokeError;

    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const { data: invitation, error: insertError } = await adminClient.from("coach_invitations")
      .insert({
        organization_id: organizationId,
        email,
        display_name: displayName,
        role: "coach",
        token_hash: tokenHash,
        created_by: authData.user.id,
        expires_at: expiresAt,
      })
      .select("id, expires_at")
      .single();
    if (insertError) throw insertError;

    const inviteUrl = new URL("/", siteUrl);
    // Keep the bearer token in the fragment: it is not sent in the HTTP request or referrer.
    inviteUrl.hash = "coach_invite=" + encodeURIComponent(token);
    return json({
      ok: true,
      invitation_id: invitation.id,
      email,
      display_name: displayName,
      invite_url: inviteUrl.toString(),
      action_link: inviteUrl.toString(),
      expires_at: invitation.expires_at,
      account_exists: Boolean(existingUser),
      link_type: "hf_coach_invitation",
      message: "Invitación HF Coach creada. Los permisos se asignan únicamente después de la aceptación explícita.",
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});