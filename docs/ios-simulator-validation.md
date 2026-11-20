# HF Coach — validación del simulador iOS

## Estado actual: RETRY PENDIENTE

La primera ejecución de GitHub Actions utilizó un runner macOS 26 e identificó correctamente el proyecto Capacitor 7.6.10. La creación del target iOS se completó, pero la sincronización no pudo continuar porque todavía no existía el directorio web indicado por Capacitor (`www/index.html`).

**Resultado de la primera ejecución**
- Workflow: https://github.com/joselmuniz0/HF/actions/runs/44655843462
- Capacitor core: 7.6.10
- Capacitor CLI: 7.6.10
- Creación de target iOS: completada
- Sincronización de assets: falló por ausencia de www/index.html
- Build Xcode: no ejecutado
- Instalación y arranque en Simulator: no ejecutados

## Corrección incorporada

El workflow ahora ejecuta el build web de Vite antes de la sincronización de Capacitor, detecta el directorio de salida y lo alinea con webDir cuando hace falta. También se configuró la validación en los eventos de push y pull request.

Commit de corrección:
https://github.com/joselmuniz0/HF/commit/f0c068218d0559876ececbee4b1050edd66a476d

Commit de actualización del disparador:
https://github.com/joselmuniz0/HF/commit/10a2143bce848a94c99fddb52e104b78459e4bb3

**No hay todavía un resultado exitoso de compilación, instalación o lanzamiento del simulador.** La validación física en iPhone sigue pendiente.

## Alcance de la prueba una vez completada

La prueba automatizada debe:
1. Compilar los assets web.
2. Sincronizar Capacitor iOS.
3. Construir el target iOS Simulator con Xcode.
4. Arrancar un simulador de iPhone.
5. Instalar y lanzar HF Coach.
6. Guardar una captura y el bundle .app de Simulator como artefactos.

El bundle de Simulator no se puede instalar en un iPhone físico. Para el dispositivo se requiere una compilación firmada para iOS y distribución con TestFlight o instalación de desarrollo/ad hoc.
