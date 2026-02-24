const CACHE_NAME = 'bmessage-cache-v1';
const API_CACHE = 'bmessage-api-cache';

// Устанавливаем Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker установлен');
  self.skipWaiting();
});

// Активируем
self.addEventListener('activate', (event) => {
  console.log('Service Worker активирован');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE) {
            console.log('Удаляем старый кэш:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Перехватываем запросы к файлам
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Кэшируем только файлы из uploads
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          // Если есть в кэше - возвращаем
          if (cachedResponse) {
            console.log('Из кэша:', url.pathname);
            return cachedResponse;
          }
          
          // Если нет - загружаем с сервера и кэшируем
          console.log('Загружаем с сервера:', url.pathname);
          return fetch(event.request).then((networkResponse) => {
            // Кэшируем только успешные ответы
            if (networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
  }
});

// Слушаем сообщения от страницы
self.addEventListener('message', (event) => {
  if (event.data === 'clear-cache') {
    console.log('Очищаем кэш по запросу');
    
    // Удаляем весь кэш
    caches.delete(CACHE_NAME).then(() => {
      console.log('Кэш очищен');
      
      // Сообщаем всем клиентам
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage('cache-cleared');
        });
      });
    });
  }
});
