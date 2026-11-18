import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const requestId = String(body.request_id || "").trim();
    const athleteId = String(body.athlete_id || "").trim();
    if (!uuid.test(requestId) || !uuid.test(athleteId)) {
      return json({ error: "Solicitud o ficha deportiva inválida." }, 400);
    }

    const adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: requestRow, error: requestError } = await adminClient
      .from("athlete_access_requests").select("*").eq("id", requestId).maybeSingle();
    if (requestError) throw requestError;
    if (!requestRow || requestRow.status !== "pending") {
      return json({ error: "La solicitud no existe o ya fue procesada." }, 404);
    }

    const { data: membership, error: membershipError } = await adminClient
      .from("organization_memberships").select("role")
      .eq("organization_id", requestRow.organization_id)
      .eq("user_id", authData.user.id).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !["admin", "coach"].includes(membership.role)) {
      return json({ error: "No tenés permisos para aprobar solicitudes en esta organización." }, 403);
    }
    const isAdmin = membership.role === "admin";
    if (!isAdmin && requestRow.requested_coach_id !== authData.user.id) {
      return json({ error: "Solo el coach indicado en la solicitud puede aprobarla." }, 403);
    }

    const { data: athlete, error: athleteError } = await adminClient
      .from("athletes").select("id, organization_id, full_name, owner_coach_id")
      .eq("id", athleteId).eq("organization_id", requestRow.organization_id).maybeSingle();
    if (athleteError) throw athleteError;
    if (!athlete) return json({ error: "No se encontró la ficha deportiva seleccionada." }, 404);

    if (!isAdmin && athlete.owner_coach_id !== authData.user.id) {
      const { data: assignment, error: assignmentError } = await adminClient
        .from("coach_athletes").select("athlete_id")
        .eq("athlete_id", athleteId).eq("coach_id", authData.user.id).maybeSingle();
      if (assignmentError) throw assignmentError;
      if (!assignment) return json({ error: "La ficha seleccionada no pertenece a tu grupo de atletas." }, 403);
    }

    const { data: athleteAuth, error: athleteAuthError } =
      await adminClient.auth.admin.getUserById(requestRow.requested_by);
    if (athleteAuthError) throw athleteAuthError;
    const requestedUser = athleteAuth.user;
    if (!requestedUser?.email_confirmed_at ||
        (requestedUser.email || "").toLowerCase() !== requestRow.requested_email.toLowerCase()) {
      return json({ error: "La cuenta del atleta no tiene el correo verificado o no coincide con la solicitud." }, 403);
    }

    const now = new Date().toISOString();
    const { error: assignmentError } = await adminClient.from("coach_athletes").upsert({
      organization_id: requestRow.organization_id,
      athlete_id: athleteId,
      coach_id: requestRow.requested_coach_id,
      assigned_by: authData.user.id,
    }, { onConflict: "athlete_id,coach_id", ignoreDuplicates: true });
    if (assignmentError) throw assignmentError;

    const { error: linkError } = await adminClient.from("athlete_accounts").upsert({
      organization_id: requestRow.organization_id,
      athlete_id: athleteId,
      user_id: requestRow.requested_by,
      email: requestRow.requested_email.toLowerCase(),
      account_status: "active",
      linked_by: authData.user.id,
      linked_at: now,
      activated_at: now,
    }, { onConflict: "user_id,athlete_id" });
    if (linkError) throw linkError;

    const { error: updateError } = await adminClient.from("athlete_access_requests")
      .update({ status: "approved", reviewed_by: authData.user.id, reviewed_at: now })
      .eq("id", requestId).eq("status", "pending");
    if (updateError) {
      await adminClient.from("athlete_accounts").delete()
        .eq("user_id", requestRow.requested_by).eq("athlete_id", athleteId);
      throw updateError;
    }

    return json({
      ok: true,
      athlete_id: athleteId,
      athlete_name: athlete.full_name,
      user_email: requestRow.requested_email,
      coach_id: requestRow.requested_coach_id,
      message: "Cuenta vinculada. El atleta ya puede ingresar y consultar su historial deportivo.",
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
