FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Don't copy models here, mount them as a volume
# COPY models ./models 

EXPOSE 8000

CMD ["npm", "start"]
