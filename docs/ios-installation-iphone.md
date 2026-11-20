# HF Coach — instalación de prueba en un iPhone

## Punto importante

La compilación destinada a iOS Simulator no se puede instalar en un iPhone físico. El simulador utiliza un binario diferente. Para instalar HF Coach en un iPhone necesitamos una compilación de dispositivo firmada y un método de distribución.

## Método recomendado: TestFlight

Es el método adecuado para una prueba piloto con actualizaciones y feedback, sin conectar el teléfono a una computadora cada vez.

### Requisitos previos

1. Una cuenta activa del Apple Developer Program.
2. Acceso a App Store Connect.
3. Un registro de aplicación HF Coach con un Bundle ID único y definitivo.
4. Firma de distribución y perfil de aprovisionamiento válidos.
5. Para automatizar la carga desde GitHub Actions, certificados y una clave de App Store Connect guardados como secretos cifrados del repositorio. Nunca se guardan en Git.

El proyecto iOS debe compilarse en modo Release para dispositivo iOS, firmarse y cargarse a App Store Connect. Apple procesa la compilación antes de habilitarla en TestFlight.

### Pasos en el iPhone

1. Abrir App Store en el iPhone.
2. Instalar **TestFlight** (la aplicación oficial de Apple).
3. Abrir la invitación que se recibirá por correo o enlace.
4. Aceptar la invitación en TestFlight.
5. Pulsar **Instalar** junto a HF Coach.
6. Abrir HF Coach e iniciar sesión con la cuenta de prueba de HF Coach.
7. Autorizar cámara, fotos o videos solo cuando se soliciten para una función que los necesite.
8. Informar errores indicando modelo de iPhone, versión de iOS, pantalla y paso en el que ocurrió.

Apple permite hasta 100 testers internos que sean usuarios de App Store Connect. Para testers externos permite invitación por correo o enlace público; el primer build externo debe pasar por revisión de TestFlight antes de comenzar a probar.

Referencias oficiales:
- https://developer.apple.com/testflight/
- https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/
- https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/
- https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/
- https://support.apple.com/en-us/102654

## Alternativa: instalación directa de desarrollo

Se puede instalar desde Xcode conectando el iPhone a un Mac o mediante un dispositivo emparejado. Xcode debe firmar la app con un equipo Apple y un perfil que permita instalarla en ese iPhone. Es una alternativa válida para desarrollo, pero no es el método recomendado para distribuir actualizaciones al grupo piloto.

## Alternativa provisoria: acceso web desde la pantalla de inicio

Mientras preparamos una compilación iOS firmada, se puede abrir la versión web de HF Coach en Safari y usar **Compartir → Añadir a pantalla de inicio**. Esto crea un acceso directo web. No equivale a instalar la aplicación nativa y no valida la integración de los plugins de iOS.

URL del panel web:
- https://hf-coach-central.vercel.app/

Antes de usar esta alternativa, verificar que la cuenta tenga el rol y los permisos correctos y que la interfaz web tenga las funciones que se desean probar.

## Pruebas que haremos en el dispositivo físico

- Inicio/cierre de sesión y persistencia de la sesión.
- Acceso según rol: administrador, coach o atleta.
- Alta, visualización y asignación de atletas.
- Invitaciones de coach y apertura de enlaces desde Mail/WhatsApp.
- Carga de un video desde Fotos/Archivos y reproducción dentro de HF Coach.
- Subida de video a almacenamiento privado y asociación con la evaluación correcta.
- Sincronización entre iPhone, Android y web.
- Comportamiento con Wi-Fi, datos móviles, pérdida de conexión y reintento.
- Orientación, controles, teclado, safe areas y navegación hacia atrás.

No se deben utilizar videos ni datos de atletas menores de edad sin los consentimientos correspondientes.

## Estado actual

- Existe un workflow de GitHub Actions que prepara y prueba una compilación de iOS Simulator sobre macOS.
- El resultado de esa ejecución debe confirmarse en docs/ios-simulator-validation.md y mediante el artefacto HFCoach-iOS-Simulator.
- Todavía no se ha creado ni distribuido una compilación firmada para un iPhone físico.
- La instalación por TestFlight depende de configurar el Apple Developer Program, App Store Connect, Bundle ID y firma.
