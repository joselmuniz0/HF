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

    const body = await req.json();
    const requestId = String(body.request_id || "").trim();
    const suppliedAthleteId = String(body.athlete_id || "").trim();
    if (!uuid.test(requestId) || (suppliedAthleteId && !uuid.test(suppliedAthleteId))) {
      return json({ error: "La solicitud o ficha deportiva no es válida." }, 400);
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

    const { data: targetCoachMembership, error: targetCoachError } = await adminClient
      .from("organization_memberships").select("role")
      .eq("organization_id", requestRow.organization_id)
      .eq("user_id", requestRow.requested_coach_id).maybeSingle();
    if (targetCoachError) throw targetCoachError;
    if (targetCoachMembership?.role !== "coach") return json({ error: "El coach destinatario ya no está habilitado." }, 403);

    const athleteId = requestRow.athlete_id || suppliedAthleteId;
    if (!athleteId) return json({ error: "La solicitud antigua no tiene una ficha asociada. Seleccioná manualmente la ficha deportiva." }, 400);
    if (requestRow.athlete_id && suppliedAthleteId && suppliedAthleteId !== requestRow.athlete_id) {
      return json({ error: "La ficha asociada a esta solicitud no coincide con la seleccionada." }, 409);
    }

    const { data: athlete, error: athleteError } = await adminClient
      .from("athletes").select("id, organization_id, full_name, owner_coach_id")
      .eq("id", athleteId).eq("organization_id", requestRow.organization_id).maybeSingle();
    if (athleteError) throw athleteError;
    if (!athlete) return json({ error: "No se encontró la ficha deportiva asociada." }, 404);

    if (!isAdmin && athlete.owner_coach_id !== authData.user.id) {
      const { data: assignment, error: assignmentError } = await adminClient
        .from("coach_athletes").select("athlete_id")
        .eq("organization_id", requestRow.organization_id)
        .eq("athlete_id", athleteId).eq("coach_id", authData.user.id).maybeSingle();
      if (assignmentError) throw assignmentError;
      if (!assignment) return json({ error: "La ficha no pertenece a tu grupo de atletas." }, 403);
    }

    const { data: athleteAuth, error: athleteAuthError } = await adminClient.auth.admin.getUserById(requestRow.requested_by);
    if (athleteAuthError) throw athleteAuthError;
    const requestedUser = athleteAuth.user;
    if (!requestedUser?.email_confirmed_at ||
        (requestedUser.email || "").toLowerCase() !== requestRow.requested_email.toLowerCase()) {
      return json({ error: "El correo del atleta no está verificado o no coincide con la solicitud." }, 403);
    }

    const { data: approval, error: approvalError } = await adminClient.rpc("approve_athlete_access_request", {
      p_request_id: requestId,
      p_athlete_id: athleteId,
      p_approver_id: authData.user.id,
    });
    if (approvalError) throw approvalError;
    if (!approval?.ok) return json({ error: approval?.error || "No se pudo completar la vinculación." }, 409);
    return json(approval);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
