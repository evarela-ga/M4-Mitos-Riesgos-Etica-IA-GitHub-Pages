# M4 - Mitos, riesgos y ética de la IA

Mini sitio estático de la serie **IA Estratégica para Líderes**, diseñado para publicarse directamente en GitHub Pages.

## Contenido del proyecto

- `index.html`: interfaz principal.
- `styles.css`: sistema visual oscuro inspirado en plataformas de audio, responsive.
- `content.js`: narración completa de aproximadamente 30 minutos.
- `app.js`: motor de voz, progreso navegable, capítulos, resaltado sincronizado y compartir.
- `.nojekyll`: evita procesamiento innecesario de Jekyll en GitHub Pages.

## Funciones

- Reproducción mediante Web Speech API del navegador.
- Prioridad para voces `es-AR`; si no existen, utiliza otras voces en español disponibles.
- Play / pausa y reinicio.
- Avance y retroceso de 30 segundos.
- Barra de progreso interactiva para saltar a cualquier punto.
- Capítulos navegables.
- Texto sincronizado con resaltado amarillo de la frase activa.
- Selección de voz y velocidad.
- Botón Compartir mediante Web Share API o portapapeles.
- Diseño responsive para escritorio y dispositivos móviles.

## Publicar en GitHub Pages

1. Crear un repositorio nuevo en GitHub.
2. Subir **todos los archivos de esta carpeta a la raíz del repositorio**.
3. Ir a `Settings` → `Pages`.
4. En `Build and deployment`, seleccionar `Deploy from a branch`.
5. Seleccionar la rama `main` y la carpeta `/(root)`.
6. Guardar los cambios.
7. GitHub mostrará la URL pública cuando el sitio haya sido publicado.

## Nota sobre la voz

El proyecto no incluye un MP3 pregrabado. Utiliza las voces instaladas en el sistema operativo o expuestas por el navegador mediante `speechSynthesis`. Por eso la voz exacta puede variar entre Windows, macOS, Android, iOS, Chrome, Edge y Safari.

Para una experiencia homogénea en todos los dispositivos, una evolución futura puede reemplazar `speechSynthesis` por una locución neuronal MP3 y conservar esta misma interfaz.

## Compatibilidad recomendada

Para la mejor experiencia, utilizar versiones actuales de Chrome, Edge o Safari y abrir el sitio mediante HTTP/HTTPS, como ocurre automáticamente en GitHub Pages.
