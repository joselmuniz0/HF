# HF Coach — expansión multiplataforma y videoanálisis basado en trayectoria de barra

**Estado:** decisión de arquitectura y plan de ejecución  
**Rama de trabajo:** `feature/multiplatform-ios-barpath-v2`  
**Alcance:** etapa 1 (Android + iOS + web) y definición técnica de etapa 2 (videoanálisis bar-first)  
**Regla de producto:** una única plataforma y una única fuente de verdad; el coach humano conserva la validación técnica.

## 1. Decisiones acordadas

1. HF Coach debe estar disponible en **Android, iOS y web**.
2. Las tres superficies deben trabajar sobre el mismo backend, identidad, organización, atletas, evaluaciones, planificación y permisos. No se crearán bases de datos independientes por plataforma.
3. La experiencia web debe funcionar en escritorio y móvil. Android e iOS serán aplicaciones móviles empaquetadas con Capacitor cuando las capacidades del proyecto actual lo permitan.
4. En la etapa 2, el objeto primario de seguimiento será **la barra**, no la muñeca ni un punto corporal utilizado como sustituto.
5. La trayectoria, altura, desplazamiento horizontal, velocidad y cambios de aceleración de la barra serán la señal principal para ordenar las fases. Los puntos corporales serán una señal complementaria para contextualizar, confirmar y evaluar posiciones.
6. La segmentación automática será revisable y corregible por el coach. No habrá umbrales universales ni una puntuación técnica global sin validación.

## 2. Diagnóstico del punto de partida

El README del repositorio indica que la aplicación móvil existente se empaqueta para Android con Capacitor y que conserva un motor de videoanálisis basado en MediaPipe. HF Central publica un panel web separado que consulta Supabase.

En Supabase ya existen las tablas de organización, membresías, atletas, asignaciones, perfiles, mediciones, marcas personales, planificación, sesiones, evaluaciones, intervenciones, multimedia y consentimientos. El proyecto tiene RLS y funciones de servidor para las operaciones administrativas y de acceso.

El despliegue productivo de HF Central revisado durante esta definición figura como READY. Esto confirma el estado del despliegue, no la prueba funcional de todos los recorridos de usuario.

No se encontró evidencia documental de un proyecto iOS ya agregado al repositorio. Antes de crear el target iOS se debe inspeccionar el manifiesto y la versión exacta de Capacitor dentro de `HF-Coach-Android-Source.zip`, además de identificar los plugins nativos utilizados. No se debe actualizar de versión mayor a ciegas.

### Limitaciones que deben conservarse explícitas

- El motor web actual estima puntos corporales con MediaPipe.
- La métrica etiquetada como distancia barra-cadera usa la muñeca como aproximación; no es una medición real de trayectoria de barra.
- El procesamiento actual muestrea aproximadamente 15 cuadros/s.
- El módulo distingue arranque y cargada, pero no tiene una segmentación dedicada del jerk.
- El catálogo de ejercicios aún no está cargado y no hay intervenciones correctivas registradas en la base.

Por tanto, la versión actual puede conservarse como referencia de interfaz y flujo de guardado, pero no debe utilizarse como base de verdad biomecánica para el nuevo análisis.

## 3. Etapa 1 — una plataforma en Android, iOS y web

### Arquitectura objetivo

- **Cliente web compartido:** interfaz responsive y lógica de dominio común.
- **Android:** aplicación Capacitor existente, alineada con el cliente compartido.
- **iOS:** nuevo target Capacitor a partir del mismo cliente compartido.
- **Web:** acceso mediante navegador, sin requerir instalación.
- **Backend único:** Supabase Auth, PostgreSQL, Storage, RLS y Edge Functions.
- **Datos únicos:** atleta, coach, evaluación, video, sesión y planificación mantienen los mismos identificadores y relaciones sin importar el dispositivo.

No se implementarán reglas de permisos en forma independiente para cada app. La autoridad permanece en Supabase. La interfaz puede adaptar navegación y controles, pero la autorización real se sigue resolviendo en el backend.

### Capacidades que deben tener paridad

| Capacidad | Android | iOS | Web |
|---|---|---|---|
| Inicio de sesión y recuperación | Obligatorio | Obligatorio | Obligatorio |
| Roles admin / coach / atleta | Obligatorio | Obligatorio | Obligatorio |
| Alta y vinculación de atleta | Obligatorio | Obligatorio | Obligatorio |
| Invitación y administración de coaches | Según rol | Según rol | Según rol |
| Planificación y sesiones | Obligatorio | Obligatorio | Obligatorio |
| Mediciones, marcas y diario | Obligatorio | Obligatorio | Obligatorio |
| Carga, reproducción y asociación de videos | Obligatorio | Obligatorio | Obligatorio |
| Evaluación y revisión del coach | Obligatorio | Obligatorio | Obligatorio |
| Historial y sincronización | Obligatorio | Obligatorio | Obligatorio |
| Biblioteca de ejercicios | Obligatorio | Obligatorio | Obligatorio |

La tabla representa paridad funcional objetivo; no supone que todos esos recorridos ya estén validados hoy.

### Adaptaciones nativas

- Selector de fotos y videos del sistema operativo.
- Permisos y mensajes de privacidad para cámara, micrófono y biblioteca multimedia, solicitados solo cuando sean necesarios.
- Reproducción de video, orientación de pantalla y manejo de archivos grandes.
- Almacenamiento seguro de sesión y credenciales mediante las capacidades nativas adecuadas.
- Enlaces profundos para invitaciones y navegación hacia fichas o evaluaciones.
- Gestión controlada de conectividad y estados de sincronización. El modo sin conexión solo se incorporará donde se definan reglas claras de conflicto y sincronización.

### Secuencia de implementación

**1A — Inventario técnico**
- Extraer e inspeccionar el ZIP fuente.
- Identificar versión de Capacitor, plugins, estructura web, dependencias y comandos de build.
- Identificar qué módulos están en el cliente Android original y cuáles se agregaron en HF Central.
- Elaborar matriz de funcionalidades reales por plataforma y detectar duplicaciones.

**1B — Núcleo compartido**
- Separar lógica de dominio, autenticación, acceso a Supabase, almacenamiento y navegación de los adaptadores de plataforma.
- Eliminar divergencias de reglas entre Android y web.
- Definir una sola configuración de entornos y una sola fuente versionada de tipos y contratos.

**1C — iOS**
- Agregar `@capacitor/ios` en la misma versión compatible con el core y Android.
- Crear el target iOS y configurar identificador de aplicación, permisos, iconos, orientación y manejo de enlaces.
- Comprobar carga/selección/reproducción de videos y persistencia de sesión.
- Mantener la aplicación web accesible por Safari, además del contenedor iOS.

**1D — pruebas de paridad**
- Ejecutar la misma batería funcional con cuentas admin, coach y atleta en Android, iOS y web.
- Validar aislamiento entre coaches y entre atletas.
- Verificar que un registro creado en una plataforma aparece en las otras.
- Verificar videos, permisos, enlaces de invitación y revisión de evaluaciones.
- Automatizar compilación Android y web; incorporar compilación iOS en runner macOS.

### Condiciones para dar por cerrada la etapa 1

- Una única identidad funciona en Android, iOS y web.
- Los datos se comparten en las tres superficies y no se duplican.
- RLS mantiene los límites de admin, coach y atleta en cada canal.
- Los flujos prioritarios de registro, invitación, asignación, planificación, carga y revisión de videos superan las pruebas funcionales.
- Existe una compilación iOS reproducible y un procedimiento de distribución de prueba.
- Se documentan las limitaciones conocidas y el estado real de cada caso de prueba.

### Requisitos externos de iOS

Capacitor documenta soporte de iOS y creación de la plataforma con `@capacitor/ios`. La compilación y la depuración local de iOS requieren macOS y Xcode. La versión mínima exacta debe respetar la versión de Capacitor que finalmente mantengamos.

Referencias:
- https://capacitorjs.com/docs
- https://capacitorjs.com/docs/ios
- https://capacitorjs.com/docs/getting-started/environment-setup
- https://developer.apple.com/xcode/

No se deben incorporar certificados, perfiles de distribución ni secretos de firma al repositorio. La distribución a testers y App Store se planificará cuando exista un equipo Apple Developer y se haya probado el flujo en dispositivos reales.

## 4. Etapa 2 — análisis cuya señal primaria es la trayectoria de la barra

### Principio de medición

El sistema detecta y sigue un punto físico visible de la barra —preferentemente el centro del disco del extremo cercano en una toma lateral— a lo largo de los cuadros del video. El resultado inicial es una serie temporal:

`(t, x, y)`

Luego de calibrar escala y tiempo, se calculan:

- desplazamiento horizontal y vertical;
- altura máxima y mínima;
- velocidad horizontal y vertical;
- aceleración estimada;
- puntos de inversión, mínimos, máximos y cambios de pendiente;
- duración entre eventos y duración de fases.

La trayectoria debe conservarse como dato bruto y como dato procesado. Los parámetros de suavizado y el método usado para derivar velocidad y aceleración deben persistirse para poder reproducir el análisis.

### Captura y calibración

- Vista lateral fija y perpendicular al plano principal del levantamiento.
- Cuerpo, barra y discos completos dentro de la imagen.
- 50–60 cuadros/s como objetivo para el análisis temporal; frecuencias menores solo para feedback visual cualitativo.
- Cámara estable, sin paneo ni zoom durante el intento.
- Calibración con diámetro conocido del disco o una referencia de longitud en el mismo plano de movimiento.
- Guardar resolución, FPS, duración, escala, lado filmado y calidad de seguimiento.
- Vista frontal puede añadirse luego para análisis de simetría; no reemplaza la vista lateral principal de la trayectoria.

### Seguimiento visual de la barra

Se evaluarán dos familias de métodos en un prototipo controlado:

1. Detección del disco/barra por visión por computadora y seguimiento temporal del objeto.
2. Seguimiento de características del extremo de la barra mediante flujo óptico/KLT, con reidentificación cuando el objeto se ocluya o pierda.

La implementación final podrá combinar detección y tracking. El seguimiento no debe depender de la posición de las muñecas. Cada cuadro debe guardar coordenadas, confianza y estado del tracker; las pérdidas u oclusiones no deben interpolarse silenciosamente como si fueran mediciones reales.

### Segmentación inicial de fases desde la señal de barra

**Arranque (snatch)**
1. Inicio y despegue: barra en reposo y comienzo del desplazamiento vertical.
2. Primer tirón: despegue hasta el primer evento de referencia de velocidad/posición y configuración corporal.
3. Transición: zona de reducción o cambio de velocidad entre los dos impulsos; se contrasta con la relación barra-rodilla/cadera.
4. Segundo tirón: nueva aceleración hasta el máximo de velocidad vertical.
5. Elevación y altura máxima: fase de velocidad vertical descendente hacia cero.
6. Entrada/recambio: descenso de la barra y movimiento del atleta debajo de ella.
7. Recepción y estabilización: posición capturada de la barra sobre la base de apoyo, con confirmación corporal.

**Cargada (clean)**
- Comparte los eventos del primer tirón, transición, segundo tirón y altura máxima.
- La recepción se valida en la posición de rack y la posterior recuperación.
- No debe confundirse la recepción de cargada con la recepción del arranque; cambian el punto de apoyo y las referencias corporales.

**Envión (jerk)**
1. Preparación y pausa posterior a la cargada.
2. Dip: desplazamiento descendente de la barra.
3. Cambio de dirección e inicio del drive.
4. Drive: desplazamiento ascendente y aceleración de la barra.
5. Máxima velocidad y desplazamiento debajo de la barra.
6. Recepción: barra estabilizada arriba; se confirma con extensión de brazos y posición de pies/split.
7. Estabilización y recuperación de los pies.

La barra ordena la secuencia temporal, pero no identifica por sí sola todos los eventos corporales. En particular, la entrada del atleta, la recepción en split y la estabilización del jerk requieren señales corporales complementarias y/o confirmación del coach.

### Datos a producir por intento

- video original y metadatos de captura;
- trayectoria x/y con tiempo, escala, confianza y método;
- curva de altura, desplazamiento horizontal, velocidad y aceleración;
- eventos y límites de fase, automáticos y corregibles;
- fotogramas representativos de cada fase;
- puntos corporales complementarios y ángulos seleccionados;
- anotaciones del coach: observado, confirmado, descartado, corrección y ejercicio asignado;
- versión del algoritmo para reproducir comparaciones.

### Validación antes de declarar métricas

Se construirá un conjunto piloto de videos reales con diferentes cargas, niveles, intentos exitosos y fallidos. Cada video tendrá una trayectoria y eventos de referencia revisados manualmente con una herramienta como Kinovea.

Se compararán al menos:
- error de localización de barra en píxeles y unidades calibradas;
- porcentaje de cuadros con tracking válido;
- error temporal de cada evento y límite de fase;
- estabilidad del resultado ante cambios razonables de iluminación, ropa, fondo y carga;
- capacidad de detectar o declarar explícitamente una oclusión.

Los umbrales de aceptación se establecerán con el conjunto piloto; no deben inventarse antes de conocer la calidad de las filmaciones de HF Coach.

### Limitaciones y controles

- El análisis lateral es 2D y no mide rotaciones fuera del plano.
- La trayectoria no mide fuerzas ni potencia real por sí sola.
- No hay una única trayectoria ideal universal para todos los atletas y cargas.
- Las comparaciones longitudinales deben priorizar al mismo atleta y condiciones de captura comparables.
- Las detecciones automáticas son hipótesis sujetas a validación del entrenador.
- El atleta no debe recibir como diagnóstico una inferencia automática ni una predicción de lesión.

## 5. Prototipo de etapa 2: alcance mínimo

No reemplazar el motor actual de inmediato. Construir un prototipo aislado que:

1. reciba un video de arranque lateral;
2. identifique el disco del extremo de la barra;
3. genere y dibuje la trayectoria sobre el video;
4. permita corregir manualmente el punto si pierde seguimiento;
5. calcule desplazamiento, velocidad y aceleración vertical;
6. marque primer pico de velocidad, mínimo de transición, máximo de velocidad y altura máxima;
7. permita al coach corregir inicio, final y límites de fases;
8. exporte la serie y los eventos para compararlos con Kinovea.

Una vez validado el arranque, extender el método a cargada y después al jerk, cuyos eventos de recepción requieren una combinación explícita con el análisis corporal.

## 6. Referencias técnicas de base

- Nagao & Yamashita (2022), validación de seguimiento automático markerless del extremo de la barra con KLT durante el arranque, comparado con captura 3D: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0263224
- Sandau & Granacher (2020), análisis de aceleración de la barra y división de primer tirón, transición y segundo tirón con video a 50 FPS: https://pmc.ncbi.nlm.nih.gov/articles/PMC7281229/
- Comparación biomecánica de intentos exitosos y fallidos, con fases de arranque definidas a partir de la trayectoria de la barra: https://pmc.ncbi.nlm.nih.gov/articles/PMC6628121/
- Análisis biomecánico de jerk y sus fases: https://onlinelibrary.wiley.com/doi/pdf/10.1002/eng2.13042

## 7. Orden de trabajo propuesto

1. Terminar el inventario de código y dependencias del ZIP fuente actual.
2. Construir la matriz de paridad de Android, iOS y web y corregir primero los recorridos de identidad, roles y datos.
3. Crear el target iOS y su canal de compilación en macOS, sin desplegar cambios no probados a producción.
4. Ejecutar la batería de paridad con las cuentas de piloto.
5. En paralelo, preparar el conjunto de videos de referencia y construir el prototipo de tracking de barra para arranque.
6. Aprobar el motor de barra con evidencia de precisión antes de sustituir el módulo actual.

**Criterio de salida:** no se promociona una nueva versión a producción ni se etiqueta un indicador como medición de barra hasta que exista una prueba reproducible y una validación documentada.
