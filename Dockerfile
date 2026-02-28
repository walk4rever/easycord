FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
# 创建子目录以匹配 base path
RUN mkdir -p /usr/share/nginx/html/easycord
# 将打包内容拷贝到子目录
COPY --from=builder /app/dist /usr/share/nginx/html/easycord

# 添加 Nginx 配置以支持单页应用路由（可选但推荐）
RUN echo 'server { \
    listen 80; \
    location /easycord/ { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /easycord/index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx","-g","daemon off;"]
