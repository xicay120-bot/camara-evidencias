# Cámara Evidencias (prototipo 0.1)

Web app instalable (PWA) para Android e iPhone que:

- Usa **su propia cámara**: las fotos no pasan por la galería del teléfono.
- Graba dentro de la imagen **fecha, hora, zona horaria, GPS (con precisión) y usuario**.
- Calcula una **huella SHA-256** de cada foto y la guarda en un `.json` junto a ella.
- Guarda las fotos en una **cola local** y las sube a **OneDrive/Fotos Evidencias/AAAA-MM/** cuando hay conexión.
- Conserva una **copia en el teléfono** durante 7 días después de confirmar la subida (botón *Exportar*).

## Qué se sube por cada foto

```
OneDrive/Fotos Evidencias/2026-10/
  EVID_20261023_143012_7F3A9C21.jpg   foto con marca de agua
  EVID_20261023_143012_7F3A9C21.json  metadatos: sha256, hora, GPS, usuario,
                                       hora registrada por OneDrive al subir
```

Para comprobar que una foto no se modificó, se calcula su SHA-256 y se compara con el del `.json`:
- Windows: `certutil -hashfile foto.jpg SHA256`
- Mac/Linux: `shasum -a 256 foto.jpg`

## Cómo se verifica la hora

- **Con conexión**: la app lee la hora del servidor donde está alojada (cabecera `Date` de `time.txt`) y la usa en lugar del reloj del teléfono. Si alguien atrasa o adelanta el reloj, la foto lleva la hora correcta y el `.json` registra el desfase.
- **Sin conexión**: la hora verificada sigue siendo válida hasta 30 minutos después de la última sincronización, siempre que el teléfono no se haya suspendido ni se haya cambiado la hora. Pasado ese plazo, la marca dice **"hora del teléfono, no verificada"**.
- Además, el `.json` guarda la hora en que OneDrive recibió el archivo, que el usuario no puede alterar.

Limitaciones: esto es un **indicio sólido, no una prueba certificada**. El GPS se puede falsear con apps de ubicación simulada. El usuario puede borrar sus archivos de su propio OneDrive (la papelera de OneDrive los guarda unos 93 días).

---

## Paso 1 – Registro en Microsoft Entra (lo hace TI)

1. Entra en <https://entra.microsoft.com> → **Aplicaciones → Registros de aplicaciones → Nuevo registro**.
   - Nombre: `Cámara Evidencias`
   - Tipos de cuenta: **Solo cuentas de este directorio organizativo**.
2. **Autenticación → Agregar una plataforma → Aplicación de página única (SPA)**.
   - URI de redirección: la dirección exacta donde se publique la app, **terminada en `/`**.
     Ejemplo: `https://empresa.github.io/camara-evidencias/`
3. **Permisos de API → Agregar → Microsoft Graph → Permisos delegados**:
   - `User.Read`
   - `Files.ReadWrite`
   - Pulsar **Conceder consentimiento de administrador**.
4. Copiar el **ID de aplicación (cliente)** y el **ID de directorio (inquilino)** en `config.js`:

```js
clientId: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
tenantId: "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
```

> **Sobre el permiso**: `Files.ReadWrite` técnicamente da acceso a todo el OneDrive del usuario, aunque el código solo escribe en `Fotos Evidencias`.
> Existe `Files.ReadWrite.AppFolder`, que limita el acceso a una carpeta propia de la app (`folderMode: "approot"` en `config.js`). Pero la documentación de Microsoft se contradice sobre si funciona en cuentas de empresa. Si TI prefiere ese permiso, hay que probarlo primero en vuestro inquilino.

## Paso 2 – Publicar la app (requiere HTTPS)

La cámara y el GPS solo funcionan en páginas HTTPS. Son archivos estáticos, así que vale cualquier alojamiento:

- **Azure Static Web Apps** (plan gratuito, queda dentro de Microsoft; suele ser lo que TI prefiere).
- **GitHub Pages**: también vale y es lo más rápido para probar.
- **SharePoint no sirve** para alojarla: no entrega bien los archivos de una PWA.

Hay que subir la carpeta completa tal cual. La URL publicada debe coincidir con la URI de redirección del paso 1.

**Al publicar una nueva versión**, cambiar `VERSION` en `sw.js`. Si no, los teléfonos seguirán usando la copia antigua guardada.

## Paso 3 – Instalar en el teléfono

- **iPhone (Safari)**: abrir la URL → botón Compartir → **Añadir a pantalla de inicio**.
- **Android (Chrome)**: abrir la URL → menú ⋮ → **Instalar aplicación**.

La primera vez pedirá permiso de cámara y ubicación, y habrá que iniciar sesión con la cuenta de trabajo **con conexión**. Después puede usarse sin conexión.

## Comportamiento sin conexión

- Las fotos quedan en la cola y el contador amarillo muestra cuántas faltan por subir.
- Se suben solas al recuperar la conexión **con la app abierta**. En iPhone no se suben con la app cerrada; basta con abrirla.
- **No desinstalar la app ni borrar los datos del navegador con fotos pendientes**: se perderían. Ante la duda, usar *Exportar*.

## Probar sin registro en Entra (modo demostración)

Con `clientId` vacío, la app toma fotos, las estampa y las guarda en el teléfono, pero no las sube. Sirve para probar cámara, GPS y marca de agua mientras TI hace el registro.

Prueba local en el ordenador:

```
python3 -m http.server 8080
```

y abrir `http://localhost:8080`. `localhost` cuenta como seguro, así que la cámara funciona. Para el teléfono hace falta HTTPS.

## Estructura

| Archivo | Función |
|---|---|
| `config.js` | IDs de Entra, carpeta, días de copia local |
| `js/camera.js` | cámara propia (resolución completa en Android con ImageCapture) |
| `js/watermark.js` | marca de agua, miniatura, SHA-256 |
| `js/clock.js` | hora verificada contra el servidor |
| `js/geo.js` | GPS continuo |
| `js/db.js` | cola local (IndexedDB) |
| `js/auth.js` | inicio de sesión (MSAL 4.30, en `vendor/`) |
| `js/graph.js` | subida a OneDrive (simple ≤4 MB, por partes si es mayor) |
| `js/sync.js` | vacía la cola, sin duplicados si se corta una subida |
| `sw.js` | funcionamiento sin conexión |

## Pendiente de probar en dispositivos reales

- Inicio de sesión real con vuestra cuenta (requiere el paso 1).
- Calidad de cámara en iPhone (usa el fotograma del vídeo, sin control de flash).
- Comportamiento del GPS en interiores.
