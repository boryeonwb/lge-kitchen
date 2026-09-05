# --- build stage ------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
RUN npm run build

# --- serve stage ------------------------------------------------------------
FROM nginx:1.27-alpine

# nginx 이미지의 기본 엔트리포인트가 /etc/nginx/templates/*.template 를
# envsubst 로 치환해 /etc/nginx/conf.d/ 에 놓는다. 실제 env 로 등록된 이름만
# 치환되므로 $uri · $host 같은 nginx 변수는 그대로 남는다.
ENV API_UPSTREAM=http://lge-billing-dashboard-backend:8000

COPY --from=build /app/dist /usr/share/nginx/html
COPY templates/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 3000
