// Cámara propia de la app. Las fotos nunca pasan por la galería del teléfono.
let stream = null;
let track = null;

export async function startCamera(video) {
  stopCamera();
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 4032 },
      height: { ideal: 3024 },
    },
  });
  track = stream.getVideoTracks()[0];
  video.srcObject = stream;
  await video.play();
}

export function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  track = null;
}

export function hasTorch() {
  return !!track?.getCapabilities?.().torch;
}

export async function setTorch(on) {
  if (hasTorch()) await track.applyConstraints({ advanced: [{ torch: on }] });
}

// Devuelve algo dibujable en un canvas. En Android (Chrome) ImageCapture da la
// resolución completa del sensor; en iPhone se usa el fotograma del vídeo.
export async function grabFrame(video) {
  if (track && "ImageCapture" in window) {
    try {
      const blob = await new ImageCapture(track).takePhoto();
      const bmp = await createImageBitmap(blob);
      // Algunos Android devuelven la foto girada respecto a la vista previa:
      // si no coincide la forma (vertical/horizontal), se usa el fotograma.
      if (!video.videoWidth || bmp.width > bmp.height === video.videoWidth > video.videoHeight) return bmp;
      bmp.close();
    } catch {
      // Algunos dispositivos lo anuncian pero fallan: se usa el fotograma.
    }
  }
  if (!video.videoWidth) throw new Error("La cámara todavía no está lista");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  return canvas;
}
