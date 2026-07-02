FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 4000

# Run DB setup then start the server
CMD ["sh", "-c", "node db/setup.js && node src/index.js"]
