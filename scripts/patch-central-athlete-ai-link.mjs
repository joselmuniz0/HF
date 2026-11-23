import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(".hf-central/admin");
const htmlPath = path.join(dir, "index.html");
const appPath = path.join(dir, "app.js");
let html = fs.readFileSync(htmlPath, "utf8");
let app = fs.readFileSync(appPath, "utf8");

function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error("HF AI link: no se encontró " + label);
  return source.replace(needle, replacement);
}

const formMarker = '      <form id="athleteAccessForm" class="stack-form">';
if (!html.includes('id="linkAthleteAiBtn"')) {
  const aiPanel = [
    '      <div class="panel ai-coach-link">',
    '        <h3>Vinculación directa con Coach IA</h3>',
    '        <p>Podés asociar tu cuenta de atleta directamente con HF Coach IA, sin seleccionar un coach humano. La generación de planes se mantendrá sujeta a revisión humana.</p>',
    '        <button id="linkAthleteAiBtn" type="button" class="primary">Vincular mi cuenta con Coach IA</button>',
    '      </div>'
  ].join("\n");
  html = replaceOnce(html, formMarker, aiPanel + "\n" + formMarker, "formulario de acceso del atleta");
}

if (!app.includes("async function linkAthleteToAICoach()")) {
  const fn = `
async function linkAthleteToAICoach() {
  const button = $("linkAthleteAiBtn");
  if (!button) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Vinculando…";
  try {
    const sb = getClient();
    const { data: authData, error: authError } = await sb.auth.getUser();
    if (authError || !authData.user) throw new Error("La sesión venció. Volvé a ingresar.");
    const fullName = $("accessFullName").value.trim() ||
      authData.user.user_metadata?.full_name || "";
    const result = await sb.functions.invoke("link-athlete-to-ai-coach", {
      body: { full_name: fullName }
    });
    if (result.error) throw result.error;
    if (!result.data || !result.data.ok) {
      throw new Error(result.data?.error || "No se completó la vinculación con Coach IA.");
    }

    currentUserId = authData.user.id;
    currentRole = "athlete";
    organizationId = result.data.organization_id;
    athleteAccount = {
      athlete_id: result.data.athlete_id,
      organization_id: result.data.organization_id,
      account_status: "active"
    };
    $("athleteAccessPanel").hidden = true;
    $("athleteDashboard").hidden = false;
    $("sessionLabel").textContent = authData.user.email + " · atleta · Coach IA";
    $("athletePortalStatus").textContent = result.data.message;
    $("athletePortalStatus").className = "status success";
    await loadAthletePortal();
  } catch(error) {
    $("accessStatus").textContent = error.message || String(error);
    $("accessStatus").className = "status error";
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}
`;
  app = replaceOnce(
    app,
    "$('loginBtn').addEventListener('click', signIn);",
    fn + "\n$('loginBtn').addEventListener('click', signIn);",
    "punto de registro de eventos"
  );
}

const accessListener = "$('athleteAccessForm').addEventListener('submit', sendAthleteAccessRequest);";
if (!app.includes("$('linkAthleteAiBtn').addEventListener('click', linkAthleteToAICoach);")) {
  app = replaceOnce(
    app,
    accessListener,
    accessListener + "\n$('linkAthleteAiBtn').addEventListener('click', linkAthleteToAICoach);",
    "listener de acceso del atleta"
  );
}

const queryWithNotifications = '      sb.from("athlete_notifications").select("*").eq("athlete_id",id).order("created_at",{ascending:false})\n    ]);';
const queryWithMedia = '      sb.from("media_assets").select("*").eq("athlete_id",id).order("created_at",{ascending:false})\n    ]);';
const queryWithoutMedia = '      sb.from("training_sessions").select("*").eq("athlete_id",id)\n    ]);';
if (app.includes(queryWithNotifications) && !app.includes('athlete_ai_coach_assignments')) {
  app = replaceOnce(
    app,
    queryWithNotifications,
    '      sb.from("athlete_notifications").select("*").eq("athlete_id",id).order("created_at",{ascending:false}),\n' +
    '      sb.from("athlete_ai_coach_assignments").select("coach_label,status").eq("athlete_id",id).eq("status","active").maybeSingle()\n    ]);',
    "consultas del portal del atleta después de avisos internos"
  );
} else if (app.includes(queryWithMedia) && !app.includes('athlete_ai_coach_assignments')) {
  app = replaceOnce(
    app,
    queryWithMedia,
    '      sb.from("media_assets").select("*").eq("athlete_id",id).order("created_at",{ascending:false}),\n' +
    '      sb.from("athlete_ai_coach_assignments").select("coach_label,status").eq("athlete_id",id).eq("status","active").maybeSingle()\n    ]);',
    "consultas del portal del atleta después de videoanálisis"
  );
} else if (app.includes(queryWithoutMedia) && !app.includes('athlete_ai_coach_assignments')) {
  app = replaceOnce(
    app,
    queryWithoutMedia,
    '      sb.from("training_sessions").select("*").eq("athlete_id",id),\n' +
    '      sb.from("athlete_ai_coach_assignments").select("coach_label,status").eq("athlete_id",id).eq("status","active").maybeSingle()\n    ]);',
    "consultas del portal del atleta"
  );
}
const portalDataWithNotifications = '      sessions:queries[11].data || [], mediaAssets:queries[12].data || [], notifications:queries[13].data || []';
const portalDataWithMedia = '      sessions:queries[11].data || [], mediaAssets:queries[12].data || []';
const portalDataWithoutMedia = '      sessions:queries[11].data || []';
if (app.includes(portalDataWithNotifications) && !app.includes('aiCoach:queries[')) {
  app = replaceOnce(app, portalDataWithNotifications,
    portalDataWithNotifications + ', aiCoach:queries[14]?.data || null',
    "datos del portal con videoanálisis y avisos");
} else if (app.includes(portalDataWithMedia) && !app.includes('aiCoach:queries[')) {
  app = replaceOnce(app, portalDataWithMedia,
    portalDataWithMedia + ', aiCoach:queries[13]?.data || null',
    "datos del portal con videoanálisis");
} else if (app.includes(portalDataWithoutMedia) && !app.includes('aiCoach:queries[')) {
  app = replaceOnce(app, portalDataWithoutMedia,
    portalDataWithoutMedia + ', aiCoach:queries[12]?.data || null',
    "datos del portal");
}
const portalHeading = '$("athletePortalSub").textContent = athlete.full_name || "Perfil deportivo";';
if (app.includes(portalHeading)) {
  app = replaceOnce(app, portalHeading,
    '$("athletePortalSub").textContent = (athlete.full_name || "Perfil deportivo") + (d.aiCoach?.status === "active" ? " · " + d.aiCoach.coach_label : "");',
    "identificación del coach IA en el portal");
}

html = html.replace(
  "</head>",
  '<style>.ai-coach-link{margin:16px 0;padding:16px;border:1px solid #d8dfdc;border-radius:12px}.ai-coach-link h3{margin-top:0}.ai-coach-link p{color:#68736f}</style>\n</head>'
);

if (!html.includes('id="linkAthleteAiBtn"') ||
    !app.includes("async function linkAthleteToAICoach()") ||
    !app.includes("link-athlete-to-ai-coach")) {
  throw new Error("HF AI link: no se aplicó la vinculación de forma completa.");
}

fs.writeFileSync(htmlPath, html, "utf8");
fs.writeFileSync(appPath, app, "utf8");
console.log("HF Central: botón de vinculación directa al servicio HF Coach IA integrado.");
