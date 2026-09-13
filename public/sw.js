// Service worker minimal — REQUIS pour rendre l'app installable (événement
// beforeinstallprompt sur Android / Chrome / Edge desktop). Volontairement en
// passthrough réseau : aucun cache agressif, donc jamais de contenu périmé après
// un déploiement (les assets Next sont déjà versionnés/hachés côté serveur).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request).catch(() => Response.error()))
})
