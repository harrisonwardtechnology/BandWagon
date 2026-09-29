FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html app.js styles.css sw.js manifest.webmanifest bandwagon-logo.svg icon.svg /usr/share/nginx/html/
COPY icons /usr/share/nginx/html/icons
# Stamp a content hash into the ?v= links and the service worker cache name,
# so any change to the demo files busts browser and Cloudflare caches automatically.
RUN cd /usr/share/nginx/html \
 && H=$(cat app.js styles.css bandwagon-logo.svg icon.svg manifest.webmanifest icons/* | md5sum | cut -c1-10) \
 && sed -i "s/?v=2/?v=$H/g" index.html sw.js manifest.webmanifest \
 && sed -i "s/demo-v2/demo-$H/" sw.js \
 && grep -q "v=$H" index.html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
