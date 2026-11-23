import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const canonicalOrigin = "https://hf-coach-central.vercel.app";
const previewOrigin = /^https:\/\/[a-z0-9-]+-hf-6672\.vercel\.app$/i;

function cors(origin: string | null) {
  const allowed = !origin || origin === canonicalOrigin || previewOrigin.test(origin);
  return {
    allowed,
    headers: {
      "Access-Control-Allow-Origin": origin && allowed ? origin : canonicalOrigin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  };
}

const json = (body: unknown, status = 200, headers: Record<string,string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const corsInfo = cors(origin);
  if (!corsInfo.allowed) return json({ error: "Origen no autorizado." }, 403, corsInfo.headers);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsInfo.headers });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405, corsInfo.headers);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization");
    if (!url || !anonKey || !serviceKey) {
      return json({ error: "Falta configuración de Supabase en el servidor." }, 503, corsInfo.headers);
    }
    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "Iniciá sesión antes de vincular Coach IA." }, 401, corsInfo.headers);
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return json({ error: "La sesión no es válida. Volvé a ingresar." }, 401, corsInfo.headers);
    }
    if (!authData.user.email || !authData.user.email_confirmed_at) {
      return json({ error: "Primero confirmá el correo electrónico de tu cuenta." }, 403, corsInfo.headers);
    }

    const body = await req.json().catch(() => ({}));
    const fullName = String(body?.full_name || authData.user.user_metadata?.full_name || "").trim();
    if (fullName.length < 2 || fullName.length > 120) {
      return json({ error: "Ingresá tu nombre y apellido para crear la ficha deportiva." }, 400, corsInfo.headers);
    }

    const adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: linked, error: linkError } = await adminClient.rpc("link_athlete_to_hf_ai", {
      p_user_id: authData.user.id,
      p_full_name: fullName,
    });
    if (linkError) throw linkError;
    if (!linked?.ok || !linked?.athlete_id || !linked?.organization_id) {
      throw new Error("No se pudo crear la ficha deportiva ni asociarla a HF Coach IA.");
    }

    return json({
      ok: true,
      existing: Boolean(linked.existing),
      athlete_id: linked.athlete_id,
      organization_id: linked.organization_id,
      coach: linked.coach_label || "HF Coach IA",
      human_review_required: linked.human_review_required !== false,
      message: linked.existing
        ? "Tu ficha ya estaba activa y quedó vinculada a HF Coach IA."
        : "Tu ficha deportiva se creó y tu cuenta quedó activa con HF Coach IA. Las planificaciones generadas requerirán revisión humana.",
    }, linked.existing ? 200 : 201, corsInfo.headers);
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : "No se pudo completar la vinculación con Coach IA.",
    }, 400, corsInfo.headers);
  }
});
