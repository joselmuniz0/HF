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
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function findExistingUserByEmail(adminClient: any, email: string) {
  const perPage = 1000;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error("No se pudo comprobar si la cuenta ya existe: " + error.message);
    const users = data.users || [];
    const match = users.find((user: any) => (user.email || "").toLowerCase() === email);
    if (match) return match;
    if (users.length < perPage) return null;
  }
  throw new Error("No se pudo localizar la cuenta dentro del límite de búsqueda. Contactá al administrador técnico.");
}

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
      return json({ error: "Ingresá un nombre y correo electrónico válidos." }, 400);
    }

    const centralSiteUrl = (Deno.env.get("HF_CENTRAL_SITE_URL") || "https://hf-coach-central.vercel.app")
      .trim()
      .replace(/\/+$/, "");
    if (!centralSiteUrl.startsWith("https://")) {
      throw new Error("HF_CENTRAL_SITE_URL debe ser una URL HTTPS válida.");
    }
    const inviteRedirectTo = \`\${centralSiteUrl}/?flow=invite\`;

    const adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: membership, error: membershipError } = await adminClient
      .from("organization_memberships")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (membership?.role !== "admin") {
      return json({ error: "Solo un administrador de la organización puede generar invitaciones de coaches." }, 403);
    }

    const existingUser = await findExistingUserByEmail(adminClient, email);
    if (existingUser) {
      const { data: existingMembership, error: existingMembershipError } = await adminClient
        .from("organization_memberships")
        .select("role")
        .eq("organization_id", organizationId)
        .eq("user_id", existingUser.id)
        .maybeSingle();
      if (existingMembershipError) throw existingMembershipError;
      if (existingMembership?.role === "admin") {
        return json({ error: "Esta cuenta ya es administradora de la organización y no puede convertirse en coach desde este formulario." }, 409);
      }
    }

    // New accounts receive invite links. Existing accounts receive magic links.
    const linkType = existingUser ? "magiclink" : "invite";
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: linkType,
      email,
      options: {
        data: { full_name: displayName, hf_organization_id: organizationId },
        redirectTo: inviteRedirectTo,
      },
    });
    if (linkError) {
      const context = existingUser
        ? "No se pudo generar el enlace de acceso para la cuenta existente."
        : "No se pudo generar la invitación de la cuenta nueva.";
      throw new Error(context + " " + linkError.message);
    }
    if (!linkData.user || !linkData.properties?.action_link) {
      throw new Error("Supabase no devolvió un enlace de activación válido.");
    }

    const actionLink = linkData.properties.action_link;
    const actionUrl = new URL(actionLink);
    const supabaseOrigin = new URL(url).origin;
    if (actionUrl.protocol !== "https:" || actionUrl.origin !== supabaseOrigin || actionUrl.pathname !== "/auth/v1/verify") {
      throw new Error("Supabase devolvió un enlace que no pertenece al endpoint de verificación esperado.");
    }

    const userId = linkData.user.id;
    const { error: memberInsertError } = await adminClient.from("organization_memberships").upsert({
      organization_id: organizationId,
      user_id: userId,
      role: "coach",
    }, { onConflict: "organization_id,user_id" });
    if (memberInsertError) {
      throw new Error("El enlace se generó, pero no se pudo asignar el rol de coach: " + memberInsertError.message);
    }

    const { error: profileError } = await adminClient.from("coach_profiles").upsert({
      organization_id: organizationId,
      user_id: userId,
      display_name: displayName,
      email,
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,user_id" });
    if (profileError) {
      throw new Error("El enlace se generó, pero no se pudo guardar el perfil de coach: " + profileError.message);
    }

    return json({
      ok: true,
      user_id: userId,
      email,
      role: "coach",
      action_link: actionLink,
      account_exists: Boolean(existingUser),
      link_type: linkType,
      message: existingUser
        ? "Se generó un enlace de acceso de un solo uso y la cuenta quedó vinculada como coach."
        : "Se generó el enlace de invitación y la cuenta quedó registrada como coach.",
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
