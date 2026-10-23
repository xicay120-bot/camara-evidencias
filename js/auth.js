// Inicio de sesión con la cuenta de trabajo de Microsoft (MSAL, flujo por redirección,
// que es el que funciona en una PWA instalada en iPhone).
import { CONFIG } from "../config.js";

export class NeedsLoginError extends Error {
  constructor() {
    super("Hay que iniciar sesión");
  }
}

let pca = null;
let account = null;

export function authEnabled() {
  return !!CONFIG.clientId;
}

export function scopes() {
  return CONFIG.folderMode === "approot"
    ? ["User.Read", "Files.ReadWrite.AppFolder"]
    : ["User.Read", "Files.ReadWrite"];
}

export async function initAuth() {
  if (!authEnabled()) return null;
  pca = new msal.PublicClientApplication({
    auth: {
      clientId: CONFIG.clientId,
      authority: `https://login.microsoftonline.com/${CONFIG.tenantId}`,
      redirectUri: new URL("./", location.href).href,
    },
    // localStorage para que la sesión sobreviva al cerrar la app.
    cache: { cacheLocation: "localStorage" },
  });
  await pca.initialize();
  const result = await pca.handleRedirectPromise();
  account = result?.account || pca.getActiveAccount() || pca.getAllAccounts()[0] || null;
  if (account) pca.setActiveAccount(account);
  return account;
}

export function currentUser() {
  return account ? { name: account.name || "", email: account.username || "" } : null;
}

export function login() {
  return pca.loginRedirect({ scopes: scopes(), prompt: "select_account" });
}

export function logout() {
  return pca.logoutRedirect({ account });
}

// Solo silencioso: nunca abre ventanas durante la subida automática.
export async function getToken() {
  if (!pca || !account) throw new NeedsLoginError();
  try {
    const res = await pca.acquireTokenSilent({ scopes: scopes(), account });
    return res.accessToken;
  } catch (e) {
    if (e instanceof msal.InteractionRequiredAuthError) throw new NeedsLoginError();
    throw e;
  }
}
