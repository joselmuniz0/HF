# HF Coach — Laboratorio de trayectoria de barra

**Estado:** prototipo aislado para revisión técnica. No reemplaza el videoanálisis vigente.

## Qué implementa

1. Carga local de un video lateral MP4, MOV o WEBM (máximo 20 segundos / 250 MB).
2. Marcación manual inicial del centro visible del disco del extremo cercano de la barra.
3. Seguimiento entre cuadros mediante correlación cruzada normalizada (NCC) sobre una plantilla visual.
4. Pérdida de seguimiento explícita cuando la correlación cae por debajo del umbral; el sistema no rellena automáticamente los cuadros perdidos.
5. Corrección manual del punto en cualquier cuadro y recálculo del seguimiento hacia adelante.
6. Calibración en metros usando una longitud conocida coplanar, por defecto 0,45 m para el diámetro reglamentario del disco.
7. Trayectoria XY, desplazamiento relativo, velocidad y aceleración estimadas.
8. Candidatos automáticos de eventos basados en la señal vertical de la barra y marcas de fase revisables por el coach.
9. Exportación de la serie a CSV y del análisis completo a JSON para contrastar con Kinovea.

## Uso

1. Abrí **Laboratorio de trayectoria de barra** desde la Central HF Coach.
2. Seleccioná un video que muestre un intento completo desde una cámara fija lateral. Recortá a 20 segundos como máximo.
3. Elegí el levantamiento y una frecuencia de análisis. 50 cuadros/s es el valor inicial recomendado.
4. En el primer cuadro, seleccioná el modo **Marcar punto inicial** y hacé clic en el centro de un disco visible de la barra.
5. Opcionalmente seleccioná **Calibrar con una longitud conocida** y marcá los extremos de un diámetro o referencia cuyo tamaño conozcas. La referencia debe estar en el mismo plano que el movimiento.
6. Pulsá **Iniciar seguimiento**. Revisá la trayectoria y el porcentaje de cuadros válidos.
7. Mové el control de cuadros. Cuando haya oclusión o error, usá **Corregir el punto** y marcá de nuevo el centro del disco. El sistema recalcula desde ese cuadro hacia adelante.
8. Revisá los candidatos automáticos. Agregá y corregí límites de fase con las marcas del coach.
9. Exportá CSV y JSON y compará tiempos, posiciones y eventos con Kinovea.

## Datos y privacidad

- El video se procesa en el navegador del dispositivo.
- No se transmite a Supabase ni a ningún servidor desde este laboratorio.
- No se guarda el video, la trayectoria ni las marcas en una cuenta; la exportación es local.
- No incluyas videos de atletas menores sin las autorizaciones correspondientes.
- Para guardar análisis en perfiles de atletas habrá que definir y validar un contrato de datos, una tabla de tracking y sus políticas RLS en una fase posterior.

## Método y límites

- El punto de seguimiento es una característica visual seleccionada manualmente en el disco. La plantilla usa un parche de luminancia y NCC con una búsqueda local alrededor de la posición predicha.
- NCC es una similitud visual entre -1 y 1, no una probabilidad.
- La plantilla puede confundirse ante oclusión, rotación fuerte, reflejos, blur, cambio de escala o de iluminación.
- El punto del disco no es el centro de masa de la barra. La medición es 2D y depende de una toma lateral fija.
- La frecuencia configurada es la frecuencia solicitada de muestreo. El navegador no expone de forma fiable el FPS original de todos los formatos; debe confirmarse con metadatos o Kinovea.
- La velocidad y la aceleración son derivadas numéricas estimadas. Son sensibles a ruido, frecuencia y seguimiento; no son fuerza ni potencia.
- Los candidatos automáticos solo sugieren eventos de la trayectoria. No determinan por sí solos la entrada del atleta, la recepción, el split, el rack ni la estabilización.
- No hay una trayectoria universal objetivo. La interpretación y cualquier corrección técnica corresponden al coach.

## Pruebas

Desde la raíz del repositorio:

```bash
node --test tests/bar-path-core.test.mjs
node --check prototypes/bar-path/bar-path-app.mjs
```

Los tests cubren extracción de plantilla, correlación NCC, localización de un parche traducido, seguimiento de un cuadro, derivadas y conservación de cuadros perdidos.
