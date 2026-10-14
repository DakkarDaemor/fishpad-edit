// Web Share Target: importato dal service worker generato da vite-plugin-pwa (vite.config.ts → workbox.importScripts).
// Riceve il POST di "Condividi → Fishpad", mette testo e file nella cache e riapre l'app con ?share-target
// (src/share.ts li legge da lì).
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share-target')) return
  event.respondWith(
    (async () => {
      const scope = self.registration.scope
      const form = await event.request.formData()
      await caches.delete('fishpad-share')
      const cache = await caches.open('fishpad-share')
      const field = (name) => (typeof form.get(name) === 'string' ? form.get(name) : undefined)
      const meta = { title: field('title'), text: field('text'), url: field('url') }
      await cache.put(new URL('__share/meta', scope).href, new Response(JSON.stringify(meta)))
      let i = 0
      for (const file of form.getAll('files')) {
        if (typeof file === 'string') continue
        const headers = { 'Content-Type': file.type || 'text/plain', 'X-File-Name': encodeURIComponent(file.name) }
        await cache.put(new URL(`__share/file/${i++}`, scope).href, new Response(file, { headers }))
      }
      return Response.redirect(new URL('?share-target', scope).href, 303)
    })(),
  )
})
