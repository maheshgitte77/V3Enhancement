# Use the official Node.js image as the base image
FROM node:18-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy the rest of the application files
COPY . .

# Create Uploads directory
RUN mkdir -p Uploads/temp

# Expose the port the app runs on
EXPOSE 7010

# Note: Environment variables are provided via docker-compose.yml
# USE_KAFKA: Set to "true" to enable Kafka consumer
# WORKER_COUNT: Number of cluster workers (default: CPU count)

# Start the application using cluster.js for multi-process
CMD ["node", "cluster.js"]
