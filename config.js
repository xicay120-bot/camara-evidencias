// Configuración de la app. Los valores de Entra los entrega el departamento de TI
// después de registrar la aplicación (ver README.md).
export const CONFIG = {
  // "ID de aplicación (cliente)" del registro en Microsoft Entra.
  // Si se deja vacío, la app funciona en modo demostración: toma y guarda fotos
  // en el teléfono, pero no las sube.
  clientId: "",

  // "ID de directorio (inquilino)" de la empresa. "organizations" acepta
  // cualquier cuenta de trabajo, pero es mejor poner el ID concreto.
  tenantId: "organizations",

  // "path": las fotos van a OneDrive/<folderName>/AAAA-MM/ (permiso Files.ReadWrite).
  // "approot": las fotos van a la carpeta de aplicación (permiso Files.ReadWrite.AppFolder).
  //   Solo usarlo si TI confirma que funciona en vuestro inquilino.
  folderMode: "path",
  folderName: "Fotos Evidencias",

  // Días que se conserva la copia en el teléfono después de confirmar la subida.
  keepUploadedDays: 7,

  // Calidad JPEG (0-1) y lado máximo de la imagen en píxeles.
  jpegQuality: 0.92,
  maxSide: 4096,
};
