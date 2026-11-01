# Lucky — تصویر داکر برای اجرا روی سرور
# ساخت: docker build -t lucky .
# اجرا:  docker run -d -p 3000:3000 -v lucky-data:/data --name lucky lucky

FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    LUCKY_DATA_DIR=/data

WORKDIR /app

# اول وابستگی‌ها تا لایهٔ کش داکر مؤثر باشد
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# بعد کد برنامه
COPY server ./server
COPY public ./public

# داده‌ها (db.json، PDFهای بارگذاری‌شده، متن استخراج‌شده، خروجی‌ها) اینجا می‌مانند
RUN mkdir -p /data/uploads /data/text /data/exports && chown -R node:node /data
VOLUME ["/data"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
