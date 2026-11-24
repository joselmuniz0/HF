import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const DECLARATION_VERSION = "hf-athlete-ai-declaration-v1";
const HEALTH_CONSENT_VERSION = "hf-health-ai-consent-v1";
const DECLARATION_TEXT = [
  "DECLARACIÓN JURADA DEL ATLETA - HF COACH IA",
  "Declaro bajo juramento que los datos personales, deportivos y de salud que incorporo son, según mi leal saber y entender, verdaderos, completos y actuales a la fecha de esta presentación.",
  "Declaro que informaré a HF Coach IA cualquier cambio relevante en mi peso, condición física, antecedentes de salud, lesiones, medicación, restricciones médicas o marcas deportivas antes de solicitar nuevas planificaciones.",
  "Comprendo que las marcas, mediciones y antecedentes que ingreso son autodeclarados y pueden permanecer pendientes de validación. La declaración no convierte esos datos en mediciones verificadas ni en aptitud médica para entrenar.",
  "Comprendo que HF Coach IA no diagnostica enfermedades, no reemplaza la evaluación de profesionales de la salud y no autoriza por sí misma el retorno al entrenamiento luego de una lesión o enfermedad.",
  "Comprendo que una propuesta de entrenamiento generada por IA requiere revisión humana antes de su publicación y aplicación.",
  "La aceptación de esta declaración no limita mis derechos sobre mis datos personales ni sustituye la información de privacidad y los consentimientos específicos que se muestran por separado."
].join("\n");

function cors(origin: string | null) {
  const allowed = !origin || origin === "https://hf-coach-central.vercel.app" ||
    /^https:\/\/[a-z0-9-]+-hf-6672\.vercel\.app$/i.test(origin);
  return {
    allowed,
    headers: {
      "Access-Control-Allow-Origin": origin && allowed ? origin : "https://hf-coach-central.vercel.app",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin"
    }
  };
}
const json = (body: unknown, status = 200, headers: Record<string,string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type":"application/json", "Cache-Control":"no-store" }
  });
const text = (value: unknown, max = 1500) =>
  String(value ?? "").trim().slice(0,max);

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const corsInfo = cors(origin);
  if (!corsInfo.allowed) return json({error:"Origen no autorizado."},403,corsInfo.headers);
  if (req.method === "OPTIONS") return new Response("ok",{headers:corsInfo.headers});
  if (req.method !== "POST") return json({error:"Método no permitido."},405,corsInfo.headers);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization");
    if (!url || !anonKey || !serviceKey) {
      return json({error:"Falta configuración segura de Supabase en el servidor."},503,corsInfo.headers);
    }
    if (!authorization?.startsWith("Bearer ")) {
      return json({error:"Iniciá sesión para guardar tu evaluación inicial."},401,corsInfo.headers);
    }

    const userClient = createClient(url,anonKey,{
      global:{headers:{Authorization:authorization}},
      auth:{autoRefreshToken:false,persistSession:false}
    });
    const {data:authData,error:authError}=await userClient.auth.getUser();
    const user=authData?.user;
    if(authError || !user?.id || !user.email_confirmed_at) {
      return json({error:"La sesión debe estar activa y el correo confirmado."},401,corsInfo.headers);
    }

    const body=await req.json().catch(()=>({}));
    if(body?.accept_declaration !== true) {
      return json({error:"Debés aceptar la declaración jurada para guardar la evaluación."},400,corsInfo.headers);
    }

    const payload={
      age:Number(body.age),
      height_cm:Number(body.height_cm),
      weight_kg:Number(body.weight_kg),
      training_years:Number(body.training_years),
      training_days_per_week:Number(body.training_days_per_week),
      training_objective:text(body.training_objective,1500),
      declared_level:text(body.declared_level,30),
      snatch_kg:body.snatch_not_tested===true?null:(body.snatch_kg===""||body.snatch_kg==null?null:Number(body.snatch_kg)),
      snatch_not_tested:body.snatch_not_tested===true,
      clean_jerk_kg:body.clean_jerk_not_tested===true?null:(body.clean_jerk_kg===""||body.clean_jerk_kg==null?null:Number(body.clean_jerk_kg)),
      clean_jerk_not_tested:body.clean_jerk_not_tested===true,
      back_squat_kg:body.back_squat_not_tested===true?null:(body.back_squat_kg===""||body.back_squat_kg==null?null:Number(body.back_squat_kg)),
      back_squat_not_tested:body.back_squat_not_tested===true,
      front_squat_kg:body.front_squat_not_tested===true?null:(body.front_squat_kg===""||body.front_squat_kg==null?null:Number(body.front_squat_kg)),
      front_squat_not_tested:body.front_squat_not_tested===true,
      health_status:text(body.health_status,40),
      consent_for_ai_processing:body.consent_for_ai_processing===true,
      health_details:{
        chronic_conditions:text(body.chronic_conditions,2000),
        bone_joint_injuries:text(body.bone_joint_injuries,2000),
        muscular_injuries:text(body.muscular_injuries,2000),
        surgeries:text(body.surgeries,1500),
        medication_and_treatments:text(body.medication_and_treatments,2000),
        medical_restrictions:text(body.medical_restrictions,2000),
        other_relevant_history:text(body.other_relevant_history,1500)
      }
    };

    const numericFields=[
      ["Edad",payload.age,18,100],["Altura",payload.height_cm,50,250],
      ["Peso",payload.weight_kg,20,300],["Antigüedad deportiva",payload.training_years,0,80],
      ["Días semanales",payload.training_days_per_week,1,7]
    ];
    for(const [label,value,min,max] of numericFields){
      if(!Number.isFinite(value)||value<min||value>max){
        return json({error:label+" fuera del rango permitido."},400,corsInfo.headers);
      }
    }
    if(!Number.isInteger(payload.age)||!Number.isInteger(payload.training_days_per_week)){
      return json({error:"Edad y días semanales deben ser números enteros."},400,corsInfo.headers);
    }
    if(payload.age<18){
      return json({error:"En esta etapa, la autogestión con declaración de salud está habilitada solo para mayores de 18 años. Para menores se necesita un flujo específico de autorización de responsable legal."},403,corsInfo.headers);
    }
    if(payload.training_objective.length<3){
      return json({error:"Describí brevemente tu objetivo deportivo."},400,corsInfo.headers);
    }
    if(!["initial","intermediate","advanced","undetermined"].includes(payload.declared_level)){
      return json({error:"Seleccioná un nivel o pedí evaluación por video."},400,corsInfo.headers);
    }
    const rmSpecs=[
      ["Snatch",payload.snatch_kg,payload.snatch_not_tested],
      ["Clean & Jerk",payload.clean_jerk_kg,payload.clean_jerk_not_tested],
      ["Back Squat",payload.back_squat_kg,payload.back_squat_not_tested],
      ["Front Squat",payload.front_squat_kg,payload.front_squat_not_tested]
    ];
    for(const [label,value,notTested] of rmSpecs){
      if((value===null)===!notTested){
        return json({error:label+": ingresá una RM o marcá «No tengo RM vigente»."},400,corsInfo.headers);
      }
      if(value!==null && (!Number.isFinite(value)||value<=0||value>700)){
        return json({error:label+": la marca ingresada no es válida."},400,corsInfo.headers);
      }
    }

    if(!["no_known_conditions","conditions_reported","prefer_not_to_disclose"].includes(payload.health_status)){
      return json({error:"Seleccioná una opción de la declaración de salud."},400,corsInfo.headers);
    }
    const healthText=Object.values(payload.health_details).join(" ").trim();
    if(payload.health_status==="conditions_reported" && !healthText){
      return json({error:"Describí al menos un antecedente, lesión, tratamiento o restricción, o seleccioná «No tengo antecedentes conocidos»."},400,corsInfo.headers);
    }
    if(payload.health_status==="prefer_not_to_disclose"){
      payload.health_details={};
      payload.consent_for_ai_processing=false;
    } else if(!payload.consent_for_ai_processing){
      return json({error:"Para utilizar Coach IA debés autorizar por separado el tratamiento de los datos de salud que elegiste declarar. También podés no informarlos y solicitar una revisión humana."},400,corsInfo.headers);
    }

    const adminClient=createClient(url,serviceKey,{
      auth:{autoRefreshToken:false,persistSession:false}
    });
    const {data:membershipRows,error:membershipError}=await adminClient
      .from("organization_memberships").select("user_id").eq("user_id",user.id).limit(1);
    if(membershipError) throw membershipError;
    if((membershipRows||[]).length){
      return json({error:"Una cuenta de coach o administración no puede enviar una evaluación como atleta."},403,corsInfo.headers);
    }
    const {data:account,error:accountError}=await adminClient
      .from("athlete_accounts").select("athlete_id,organization_id,account_status")
      .eq("user_id",user.id).eq("account_status","active").maybeSingle();
    if(accountError) throw accountError;
    if(!account){
      return json({error:"No encontramos una ficha de atleta activa asociada a tu cuenta."},403,corsInfo.headers);
    }
    const {data:assignment,error:assignmentError}=await adminClient
      .from("athlete_ai_coach_assignments").select("id,status")
      .eq("user_id",user.id).eq("athlete_id",account.athlete_id)
      .eq("organization_id",account.organization_id).eq("status","active").maybeSingle();
    if(assignmentError) throw assignmentError;
    if(!assignment){
      return json({error:"Tu cuenta todavía no está vinculada a HF Coach IA."},403,corsInfo.headers);
    }

    const hashBuffer=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(DECLARATION_TEXT));
    const declarationHash=Array.from(new Uint8Array(hashBuffer))
      .map(value=>value.toString(16).padStart(2,"0")).join("");

    const {data:result,error:rpcError}=await adminClient.rpc("submit_athlete_ai_onboarding_atomic",{
      p_user_id:user.id,
      p_payload:payload,
      p_declaration_text:DECLARATION_TEXT,
      p_declaration_hash:declarationHash,
      p_declaration_version:DECLARATION_VERSION,
      p_health_consent_version:HEALTH_CONSENT_VERSION
    });
    if(rpcError) throw rpcError;
    if(!result?.ok) throw new Error("La base no confirmó el registro de la evaluación inicial.");

    return json({
      ok:true,
      athlete_id:result.athlete_id,
      profile_status:result.profile_status,
      level_status:result.level_status,
      health_status:result.health_status,
      declaration_version:DECLARATION_VERSION,
      declaration_accepted_at:new Date().toISOString(),
      message:result.message
    },200,corsInfo.headers);
  } catch(error) {
    console.error("HF athlete AI onboarding failed:",error);
    return json({error:error instanceof Error?error.message:"No se pudo guardar la evaluación inicial."},400,corsInfo.headers);
  }
});
