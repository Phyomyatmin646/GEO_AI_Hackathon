FROM node:22-slim

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Expose port 3000
EXPOSE 3000

# Docker forwards traffic to the container's network interface, so the
# development server must not bind only to its internal loopback interface.
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
