import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization");
    if (!url || !anonKey || !serviceKey) throw new Error("Faltan secretos de Supabase en la función.");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Sesión requerida." }, 401);

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "La sesión no es válida." }, 401);

    const body = await req.json();
    const organizationId = String(body.organization_id || "");
    const email = String(body.email || "").trim().toLowerCase();
    const displayName = String(body.display_name || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) {
      return json({ error: "Organización inválida." }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || displayName.length < 2 || displayName.length > 100) {
      return json({ error: "Ingresá un nombre y correo electrónico válidos." }, 400);
    }

    const centralSiteUrl = Deno.env.get("HF_CENTRAL_SITE_URL")?.trim().replace(/\/+$/, "");
    if (!centralSiteUrl || !centralSiteUrl.startsWith("https://")) {
      throw new Error("Falta configurar HF_CENTRAL_SITE_URL con la URL HTTPS del panel HF Coach Central.");
    }
    const inviteRedirectTo = `${centralSiteUrl}/?flow=invite`;

    const adminClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: membership, error: membershipError } = await adminClient
      .from("organization_memberships")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (membership?.role !== "admin") return json({ error: "Solo un administrador de la organización puede invitar coaches." }, 403);

    const { data: invitation, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: displayName, hf_organization_id: organizationId },
      redirectTo: inviteRedirectTo,
    });
    if (inviteError) throw inviteError;
    if (!invitation.user) throw new Error("Supabase no devolvió el usuario invitado.");

    const userId = invitation.user.id;
    const { error: memberInsertError } = await adminClient.from("organization_memberships").upsert({
      organization_id: organizationId, user_id: userId, role: "coach",
    }, { onConflict: "organization_id,user_id" });
    if (memberInsertError) throw memberInsertError;

    const { error: profileError } = await adminClient.from("coach_profiles").upsert({
      organization_id: organizationId, user_id: userId, display_name: displayName, email,
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,user_id" });
    if (profileError) throw profileError;

    return json({ ok: true, user_id: userId, email, role: "coach", message: "Invitación enviada. El coach debe aceptar el correo y establecer su contraseña." });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
