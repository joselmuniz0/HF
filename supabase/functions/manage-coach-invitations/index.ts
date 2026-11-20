import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization");
    if (!url || !anonKey || !serviceKey) throw new Error("Faltan secretos de Supabase.");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Sesión requerida." }, 401);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "La sesión no es válida." }, 401);

    const body = await req.json();
    const action = String(body.action || "list");
    const adminClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    if (action === "list") {
      const { data: memberships, error: membershipError } = await adminClient
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", authData.user.id)
        .eq("role", "admin");
      if (membershipError) throw membershipError;
      const organizationIds = Array.from(new Set((memberships || []).map((m: any) => m.organization_id)));
      if (organizationIds.length === 0) return json({ ok: true, invitations: [] });
      // This endpoint is the operational queue: never return revoked, accepted or expired links.
      // Historical rows remain in coach_invitations for audit and are not exposed as active invitations.
      const { data, error } = await adminClient.from("coach_invitations")
        .select("id, organization_id, email, display_name, created_at, expires_at, accepted_at, revoked_at")
        .in("organization_id", organizationIds)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return json({ ok: true, invitations: data || [] });
    }

    if (action === "revoke") {
      const invitationId = String(body.invitation_id || "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invitationId)) {
        return json({ error: "Invitación inválida." }, 400);
      }
      const { data: invitation, error: lookupError } = await adminClient.from("coach_invitations")
        .select("id, organization_id, accepted_at, revoked_at")
        .eq("id", invitationId)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!invitation) return json({ error: "La invitación no existe." }, 404);

      const { data: membership, error: membershipError } = await adminClient
        .from("organization_memberships")
        .select("role")
        .eq("organization_id", invitation.organization_id)
        .eq("user_id", authData.user.id)
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (membership?.role !== "admin") return json({ error: "No tenés permisos para revocar esta invitación." }, 403);
      if (invitation.accepted_at || invitation.revoked_at) {
        return json({ error: "La invitación ya fue aceptada o revocada." }, 409);
      }

      const { data, error } = await adminClient.from("coach_invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", invitationId)
        .eq("organization_id", invitation.organization_id)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "La invitación cambió de estado y no pudo revocarse." }, 409);
      return json({ ok: true, invitation_id: data.id });
    }
    return json({ error: "Acción no válida." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});