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
    if (!authData.user.email || !authData.user.email_confirmed_at) {
      return json({ error: "Primero verificá tu correo electrónico para solicitar la vinculación." }, 403);
    }

    const body = await req.json();
    const organizationId = String(body.organization_id || "").trim();
    const coachEmail = String(body.coach_email || "").trim().toLowerCase();
    const fullName = String(body.full_name || "").trim();
    const message = String(body.message || "").trim().slice(0, 1000);
    if (!uuid.test(organizationId)) return json({ error: "Organización inválida." }, 400);
    if (!emailPattern.test(coachEmail) || fullName.length < 2 || fullName.length > 100) {
      return json({ error: "Ingresá el correo del coach y tu nombre completo." }, 400);
    }
    if (coachEmail === authData.user.email.toLowerCase()) {
      return json({ error: "No podés solicitar vinculación con tu propia cuenta." }, 400);
    }

    const adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: existingLink, error: linkError } = await adminClient
      .from("athlete_accounts")
      .select("id, account_status")
      .eq("organization_id", organizationId)
      .eq("user_id", authData.user.id)
      .in("account_status", ["invited", "active"])
      .limit(1);
    if (linkError) throw linkError;
    if (existingLink?.length) {
      return json({ error: "Tu cuenta ya está vinculada a un atleta en esta organización." }, 409);
    }

    const { data: users, error: usersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) throw usersError;
    const coach = users.users.find((u) => (u.email || "").toLowerCase() === coachEmail);
    if (!coach) return json({ error: "No encontramos una cuenta registrada con ese correo de coach." }, 404);

    const { data: membership, error: membershipError } = await adminClient
      .from("organization_memberships")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", coach.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (membership?.role !== "coach") {
      return json({ error: "Ese correo no corresponde a un coach habilitado en HF Coach." }, 404);
    }

    const { data: coachProfile, error: profileError } = await adminClient
      .from("coach_profiles")
      .select("display_name")
      .eq("organization_id", organizationId)
      .eq("user_id", coach.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const { data: requestRow, error: insertError } = await adminClient
      .from("athlete_access_requests")
      .insert({
        organization_id: organizationId,
        requested_by: authData.user.id,
        requested_email: authData.user.email.toLowerCase(),
        requested_full_name: fullName,
        requested_coach_id: coach.id,
        message: message || null,
        status: "pending",
      })
      .select("id, status, created_at")
      .single();
    if (insertError) {
      if (insertError.code === "23505") return json({ error: "Ya tenés una solicitud pendiente en esta organización." }, 409);
      throw insertError;
    }

    return json({
      ok: true,
      request: requestRow,
      coach: { email: coachEmail, display_name: coachProfile?.display_name || coach.email },
      message: "Solicitud enviada. El coach deberá aprobarla y vincular tu cuenta con tu ficha deportiva.",
    }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
