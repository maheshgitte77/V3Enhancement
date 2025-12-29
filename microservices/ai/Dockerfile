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
EXPOSE 6001

# Note: Environment variables are provided via docker-compose.yml
# Default values can be set here if needed for local development

# Start the application
CMD ["node", "index.js"]