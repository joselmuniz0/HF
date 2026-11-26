# HF Coach — Dashboard funcional (rama UI Argentina)

## Alcance de esta etapa
El parche `scripts/patch-android-real-dashboard.mjs` incorpora un panel de acceso al dashboard en Android/WebView, con:
- Lanzador persistente “Inicio · Dashboard”.
- Panel responsive y modal.
- Conteo de atletas basado en elementos visibles de `#athletesList` (sin métricas inventadas).
- Accesos a Atletas, Planificación, Videoanálisis y Biblioteca; cada acceso intenta activar la pestaña o control existente por texto.
- Si una sección no se localiza, informa el problema sin simular navegación.

## Límites conocidos
Este es el primer dashboard funcional/integrador. No reemplaza todavía el home nativo de la aplicación ni incorpora KPIs de entrenamiento desde Supabase. Para conectar métricas reales se requiere mapear y validar las consultas/tablas del modelo de datos y el estado de autorización.

## Validación requerida
- Confirmar launcher visible en Android.
- Abrir/cerrar modal y comprobar navegación.
- Confirmar conteo de atletas (incluyendo estado vacío).
- Probar los cuatro accesos.
- Verificar adaptación en pantallas pequeñas.
