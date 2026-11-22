import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function optionalDate(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("Una fecha del perfil no es válida.");
  const parsed = new Date(raw + "T12:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== raw) throw new Error("Una fecha del perfil no es válida.");
  return raw;
}
function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error("Un dato deportivo no es numérico.");
  return n;
}
async function findUserByEmail(adminClient: any, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user: any) => (user.email || "").toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  throw new Error("No se pudo verificar si el correo ya tiene una cuenta. Contactá al administrador.");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  let createdAuthUserId: string | null = null;
  let adminClient: any = null;
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
    if (authError || !authData.user) return json({ error: "La sesión del coach no es válida." }, 401);
    const actor = authData.user;

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const fullName = String(body.full_name || "").trim();
    const organizationId = String(body.organization_id || "").trim();
    const level = String(body.level || "initial");
    const sex = body.sex ? String(body.sex) : null;
    const notes = String(body.notes || "").trim().slice(0,1500);
    if (!emailPattern.test(email) || email.length > 320) return json({ error: "El correo del atleta es obligatorio y debe ser válido." }, 400);
    if (email === (actor.email || "").toLowerCase()) return json({ error: "No podés utilizar el correo del coach como cuenta de atleta." }, 400);
    if (fullName.length < 2 || fullName.length > 120) return json({ error: "Ingresá el nombre completo del atleta." }, 400);
    if (!["initial","intermediate","advanced"].includes(level)) return json({ error: "El nivel deportivo no es válido." }, 400);
    if (sex && !["female","male","other"].includes(sex)) return json({ error: "El sexo indicado no es válido." }, 400);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) {
      return json({ error: "La organización de HF Coach no es válida." }, 400);
    }

    const { data: membership, error: membershipError } = await userClient
      .from("organization_memberships").select("role")
      .eq("organization_id", organizationId).eq("user_id", actor.id).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !["admin","coach"].includes(membership.role)) return json({ error: "Solo un coach o administrador puede invitar atletas." }, 403);
    const ownerCoachId = membership.role === "coach" ? actor.id : String(body.owner_coach_id || "");
    if (!ownerCoachId) return json({ error: "Seleccioná el coach responsable del atleta." }, 400);
    const { data: coachMembership, error: coachError } = await userClient
      .from("organization_memberships").select("role")
      .eq("organization_id", organizationId).eq("user_id", ownerCoachId).maybeSingle();
    if (coachError) throw coachError;
    if (coachMembership?.role !== "coach") return json({ error: "El coach responsable no pertenece a esta organización." }, 400);

    adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    let athleteUser = await findUserByEmail(adminClient, email);
    let accountAlreadyExists = false;
    if (athleteUser) {
      const { data: staff, error: staffError } = await adminClient
        .from("organization_memberships").select("role")
        .eq("organization_id", organizationId).eq("user_id", athleteUser.id).maybeSingle();
      if (staffError) throw staffError;
      if (staff) return json({ error: "Ese correo ya pertenece a un coach o administrador de HF Coach." }, 409);
      const { data: existingLink, error: existingLinkError } = await adminClient
        .from("athlete_accounts").select("athlete_id")
        .eq("organization_id", organizationId).eq("user_id", athleteUser.id)
        .in("account_status", ["invited","active"]).maybeSingle();
      if (existingLinkError) throw existingLinkError;
      if (existingLink) return json({ error: "Ese correo ya está vinculado a un atleta en esta organización." }, 409);
      accountAlreadyExists = true;
      if (!athleteUser.email_confirmed_at) {
        const { error: resendError } = await userClient.auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo: "https://hf-coach-central.vercel.app" },
        });
        if (resendError) return json({ error: "La cuenta ya existe pero no se pudo reenviar la confirmación: " + resendError.message }, 502);
      }
    } else {
      const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo: "https://hf-coach-central.vercel.app",
      });
      if (inviteError) return json({ error: "No se pudo enviar la invitación. Verificá el servicio de correo SMTP de HF Coach: " + inviteError.message }, 502);
      athleteUser = invited.user;
      if (!athleteUser?.id) throw new Error("El servicio de invitaciones no devolvió el usuario creado.");
      createdAuthUserId = athleteUser.id;
    }

    const registration = await adminClient.rpc("create_invited_athlete_atomic", {
      p_actor_id: actor.id,
      p_user_id: athleteUser.id,
      p_email: email,
      p_organization_id: organizationId,
      p_owner_coach_id: ownerCoachId,
      p_full_name: fullName,
      p_date_of_birth: optionalDate(body.date_of_birth),
      p_sporting_start_date: optionalDate(body.sporting_start_date),
      p_level: level,
      p_sex: sex,
      p_height_cm: optionalNumber(body.height_cm),
      p_body_weight_kg: optionalNumber(body.body_weight_kg),
      p_snatch_kg: optionalNumber(body.snatch_kg),
      p_clean_jerk_kg: optionalNumber(body.clean_jerk_kg),
      p_notes: notes || null,
    });
    if (registration.error) throw registration.error;
    if (!registration.data?.ok || !registration.data?.athlete_id) throw new Error("No se guardó la ficha y la cuenta del atleta.");
    createdAuthUserId = null;

    return json({
      ok: true,
      athlete: registration.data,
      invitation_sent: !accountAlreadyExists,
      existing_account: accountAlreadyExists,
      message: accountAlreadyExists
        ? "Ficha creada y vinculada al correo existente. El atleta debe ingresar con sus credenciales de HF Coach."
        : "Ficha creada en la base general, cuenta vinculada y correo de invitación enviado.",
    }, 201);
  } catch (error) {
    if (createdAuthUserId && adminClient) {
      await adminClient.auth.admin.deleteUser(createdAuthUserId).catch(() => null);
    }
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
