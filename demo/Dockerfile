FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html app.js styles.css sw.js manifest.webmanifest bandwagon-logo.svg icon.svg /usr/share/nginx/html/
COPY icons /usr/share/nginx/html/icons
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
