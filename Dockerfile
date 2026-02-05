# FROM node:22-alpine

# WORKDIR /app

# COPY package*.json .

# RUN npm install

# COPY . .

# EXPOSE 8000

# CMD [ "node", "index.js" ]


# --- Stage 1: Build ---
FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

COPY package*.json ./

RUN npm install

COPY prisma ./prisma/
RUN npx prisma generate 

COPY . .


# --- Stage 2: Runner ---
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl ca-certificates
WORKDIR /app

# COPY package*.json ./
# RUN npm install --omit=dev


# COPY --from=builder /app/lib/generated/prisma ./lib/generated/prisma

COPY --from=builder /app .

EXPOSE 8000
CMD ["sh", "-c", "npx prisma db push && node index.js"]