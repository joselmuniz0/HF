# HF Coach Android — Auditoría de trazabilidad del selector Jerk

**Rama:** `fix/android-lift-selector`  
**Base auditada:** `main` @ `d96c2037acb3111b5857cd2d6909986ee2af1d36`  
**Fecha:** 2026-11-26  
**Alcance:** pipeline de generación de APK, selector de levantamiento, validaciones, versionado y estrategia de caché.  
**Estado:** auditoría estática inicial; no se ejecutó Actions ni se compiló/instaló una APK.

## Resumen ejecutivo

La evidencia disponible indica que el workflow valida el selector Jerk en una etapa temprana, pero no vuelve a comprobar el HTML después de los parches posteriores ni en el artefacto final que Capacitor copia a Android. Por lo tanto, un workflow verde no demuestra que el APK contenga el selector esperado.

## Hallazgos

### AUD-01 — Validación del selector ocurre antes de los parches posteriores (ALTO)
El workflow ejecuta `patch-android-jerk-analysis.mjs` y luego valida presencia de tres cadenas con `html.includes()`. Después aplica reconstrucción de overlay, cambios de carga de video, acceso a Central, cache-busting, registro de atletas, runtime quality y planificación. No hay una comprobación equivalente al final de la cadena.

**Riesgo:** un parche posterior puede eliminar, alterar o duplicar el selector sin que CI lo detecte.

**Corrección propuesta:** validar el DOM/HTML después de todos los parches, luego del build de Vite y nuevamente en `android/app/src/main/assets/public/index.html` después de `cap sync`.

### AUD-02 — La validación actual es superficial (ALTO)
El control busca texto suelto (`Split Jerk`, `Push Jerk`, `Clean & Jerk`) en todo el documento. No verifica que los textos pertenezcan a `select#lift`, que haya exactamente cinco opciones, que los values sean correctos ni que existan duplicados.

**Corrección propuesta:** parsear el selector y comparar la lista exacta de values y labels; fallar ante cualquier diferencia.

### AUD-03 — Label de la quinta opción no coincide con el requerimiento (MEDIO)
El patch actual introduce `Cargada + Envión (análisis del Jerk)`. El requerimiento es `Cargada + Envión — Clean & Jerk`.

**Corrección propuesta:** modificar el patch y la prueba para usar el label exacto requerido.

### AUD-04 — No existe evidencia visible de identidad del artefacto en la UI local (ALTO)
El workflow establece `versionCode` a `GITHUB_RUN_NUMBER` y `versionName` a `1.0.<run>`, pero la auditoría estática no identifica un indicador en la pantalla local de Videoanálisis que exponga build y commit.

**Riesgo:** el usuario no puede distinguir visualmente la APK esperada de una instalación anterior.

**Corrección propuesta:** incluir una marca discreta de build/commit en la app local y validar que el valor inyectado coincida con el entorno de CI.

### AUD-05 — Cache-busting de Central no equivale a actualizar el HTML local (MEDIO)
`patch-android-central-cache.mjs` versiona/recarga el iframe de HF Central con `apkBuild` y un parámetro de refresh. Esto no prueba ni controla la política de caché del HTML local de la app.

**Corrección propuesta:** auditar el service worker local; aplicar Network First solo al documento principal (`index.html`), mantener recursos estáticos versionados/cache-first y un fallback offline.

### AUD-06 — No hay gate de validación post-Capacitor (ALTO)
El pipeline hace Vite build, `cap add android` y `cap sync android`, pero el workflow mostrado no valida el selector dentro del asset Android que será empaquetado.

**Corrección propuesta:** comprobar explícitamente `android/app/src/main/assets/public/index.html` después de sync y antes de Gradle.

### AUD-07 — La identificación del APK se basa en versionCode/run number, sin manifestar el commit en la UI (MEDIO)
El workflow usa el número de run para la versión. La trazabilidad completa requiere que el APK muestre también el SHA del commit y que el artefacto/metadata de CI incluya ambos.

**Corrección propuesta:** inyectar SHA corto y run number en la UI y generar un archivo de metadata de build como artefacto.

## Selector esperado (contrato)

| Value | Label |
|---|---|
| `Snatch` | `Arranque (Snatch)` |
| `Clean` | `Cargada (Clean)` |
| `Split Jerk` | `Envión — Split Jerk` |
| `Push Jerk` | `Envión — Push Jerk` |
| `Clean & Jerk` | `Cargada + Envión — Clean & Jerk` |

La prueba debe exigir que estas cinco opciones existan una sola vez y en este orden dentro de `select#lift`.

## Plan de remediación

1. Corregir el label de la opción 5 en el patch de Jerk.
2. Crear una validación reutilizable (script) para el selector exacto.
3. Ejecutarla después de la cadena completa de parches.
4. Ejecutarla sobre `www/index.html` luego de Vite.
5. Ejecutarla sobre el asset Android luego de `cap sync`.
6. Añadir build/run y commit corto a una marca visible de la app.
7. Auditar y ajustar el service worker local para Network First en `index.html`.
8. Agregar metadata de build al artefacto.
9. Ejecutar pruebas locales disponibles y el workflow en la rama.
10. Inspeccionar logs y APK final; no declarar cierre hasta que el APK real haya sido comprobado.

## Limitaciones de esta auditoría

- No se ejecutó GitHub Actions.
- No se compiló APK.
- No se instaló ni inspeccionó un dispositivo.
- No se verificó runtime WebView/service worker.
- El análisis de código es estático y debe completarse con pruebas sobre artefactos generados.
