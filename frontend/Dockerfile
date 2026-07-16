# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Serve stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Custom Nginx configuration could be copied if SPA client-side routing is used
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
