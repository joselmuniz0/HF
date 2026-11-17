import fs from 'node:fs';
import path from 'node:path';

const supabaseUrl = (process.env.HF_SUPABASE_URL || '').trim();
const publishableKey = (process.env.HF_SUPABASE_PUBLISHABLE_KEY || '').trim();
if (!supabaseUrl.startsWith('https://') || !publishableKey) {
  throw new Error('Definí HF_SUPABASE_URL y HF_SUPABASE_PUBLISHABLE_KEY en las variables de entorno de Vercel.');
}
const outputDir = path.resolve('.hf-central/admin');
fs.mkdirSync(outputDir, { recursive: true });
const config = { supabaseUrl, supabasePublishableKey: publishableKey };
fs.writeFileSync(path.join(outputDir, 'config.js'), `window.HF_CENTRAL_CONFIG = Object.freeze(${JSON.stringify(config)});\n`, 'utf8');
console.log('Configuración pública de Supabase generada para HF Coach Central.');
