# Use the official Node.js image as the base image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy the rest of the application files
COPY . .

# Expose the port the app runs on
EXPOSE 7010

# Note: Environment variables are provided via docker-compose.yml
# Note: WORKER_VERSION removed - now using route-based versioning

# Start the application
CMD ["node", "index.js"]