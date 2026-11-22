import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function optionalDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("Una fecha del perfil no es válida.");
  const parsed = new Date(raw + "T12:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== raw) throw new Error("Una fecha del perfil no es válida.");
  return raw;
}
function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error("Un valor deportivo no es numérico.");
  return n;
}

Deno.serve(async (req: Request) => {
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
    const athleteUser = authData.user;
    if (!athleteUser.email || !athleteUser.email_confirmed_at) {
      return json({ error: "Primero verificá el correo con el que creaste tu cuenta." }, 403);
    }

    const body = await req.json();
    const organizationId = String(body.organization_id || "").trim();
    const coachEmail = String(body.coach_email || "").trim().toLowerCase();
    const fullName = String(body.full_name || athleteUser.user_metadata?.full_name || "").trim();
    const message = String(body.message || "").trim().slice(0, 1000);
    if (!uuid.test(organizationId)) return json({ error: "La organización de HF Coach no es válida." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(coachEmail) || fullName.length < 2 || fullName.length > 120) {
      return json({ error: "Ingresá tu nombre completo y el correo del coach." }, 400);
    }
    if (coachEmail === athleteUser.email.toLowerCase()) return json({ error: "El correo del coach no puede ser tu propio correo." }, 400);

    const adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: requesterMembership, error: requesterMembershipError } = await adminClient
      .from("organization_memberships").select("role")
      .eq("organization_id", organizationId).eq("user_id", athleteUser.id).maybeSingle();
    if (requesterMembershipError) throw requesterMembershipError;
    if (requesterMembership) return json({ error: "Las cuentas de coach o administración no pueden solicitar un alta como atleta." }, 403);

    const { data: coachUsers, error: coachUsersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (coachUsersError) throw coachUsersError;
    const coach = coachUsers.users.find((u) => (u.email || "").toLowerCase() === coachEmail);
    if (!coach) return json({ error: "No encontramos una cuenta registrada con ese correo de coach." }, 404);

    const { data: coachMembership, error: coachMembershipError } = await adminClient
      .from("organization_memberships").select("role")
      .eq("organization_id", organizationId).eq("user_id", coach.id).maybeSingle();
    if (coachMembershipError) throw coachMembershipError;
    if (coachMembership?.role !== "coach") return json({ error: "Ese correo no corresponde a un coach activo de HF Coach." }, 404);

    const { data: profile, error: profileError } = await adminClient
      .from("coach_profiles").select("display_name")
      .eq("organization_id", organizationId).eq("user_id", coach.id).maybeSingle();
    if (profileError) throw profileError;

    const { data: registration, error: registrationError } = await adminClient.rpc("register_athlete_access_request_atomic", {
      p_user_id: athleteUser.id,
      p_email: athleteUser.email.toLowerCase(),
      p_organization_id: organizationId,
      p_full_name: fullName,
      p_requested_coach_id: coach.id,
      p_date_of_birth: optionalDate(body.date_of_birth),
      p_sporting_start_date: optionalDate(body.sporting_start_date),
      p_level: String(body.level || "intermediate"),
      p_sex: body.sex ? String(body.sex) : null,
      p_body_weight_kg: optionalNumber(body.body_weight_kg),
      p_snatch_kg: optionalNumber(body.snatch_kg),
      p_clean_jerk_kg: optionalNumber(body.clean_jerk_kg),
      p_back_squat_kg: optionalNumber(body.back_squat_kg),
      p_front_squat_kg: optionalNumber(body.front_squat_kg),
      p_message: message || null,
    });
    if (registrationError) throw registrationError;
    if (!registration?.ok || !registration?.athlete_id || !registration?.request_id) {
      throw new Error("No se creó la ficha deportiva ni la solicitud de vinculación.");
    }

    return json({
      ok: true,
      request: registration,
      coach: { email: coachEmail, display_name: profile?.display_name || coach.email },
      athlete_email: athleteUser.email.toLowerCase(),
      message: registration.existing
        ? "Tu ficha ya estaba registrada y la solicitud sigue pendiente."
        : "Tu ficha deportiva ya se guardó en la base general de HF Coach. El coach recibirá la solicitud para aprobar el acceso.",
    }, registration.existing ? 200 : 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
