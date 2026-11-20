// Service Worker（T60）：重复访问提速 + 断网可玩
// 策略：导航请求 network-first（发版后首次重访即生效，离线回退缓存）；
// 同源 GET 资源 stale-while-revalidate（先回缓存秒开，后台拉新版下次生效——非哈希文件名
// 的素材（音频/webp）发版后第二次载入自动换新，无需手工版本纪律）；跨域与非 GET 不接管。
// 改本文件缓存策略需升 VERSION（activate 清旧缓存）
const VERSION = 'v1'
const CACHE = `lingzhiji-${VERSION}`

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // 跨域（词典语音等）不接管

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req)),
    )
    return
  }
  e.respondWith(
    caches.match(req).then((hit) => {
      const refresh = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => hit)
      return hit || refresh
    }),
  )
})
