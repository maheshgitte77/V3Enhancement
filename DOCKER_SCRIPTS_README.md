# Docker Deployment Scripts

This directory contains scripts to easily deploy and manage the HireCorrect Microservices project using Docker Compose.

## Scripts Overview

### 🚀 `run-project.ps1` (Windows PowerShell)

Main deployment script for Windows users that:

- Checks Docker prerequisites
- Stops existing containers to avoid conflicts
- Removes old images to ensure fresh builds
- Builds services with latest changes (no cache)
- Starts all services in detached mode
- Displays service status and endpoints

### 🚀 `run-project.sh` (Bash - Linux/macOS)

Same functionality as the PowerShell script but for Unix-based systems.

### 🔧 `manage-services.ps1` (Windows PowerShell)

Management script for common operations:

- View service status
- Check logs (all services or specific service)
- Stop/restart services
- Rebuild with latest changes
- Clean up containers and images

## Quick Start

### Windows (PowerShell)

```powershell
# Deploy the entire stack
.\run-project.ps1

# View service status
.\manage-services.ps1 -Action status

# View logs for a specific service
.\manage-services.ps1 -Action logs -Service response-analysis-service

# Restart a specific service
.\manage-services.ps1 -Action restart -Service resume-service

# Stop all services
.\manage-services.ps1 -Action stop
```

### Linux/macOS (Bash)

```bash
# Make script executable (first time only)
chmod +x run-project.sh

# Deploy the entire stack
./run-project.sh

# Manual management (use docker-compose commands)
cd docker
docker-compose ps                    # View status
docker-compose logs -f response-analysis-service # View logs
docker-compose restart resume-service # Restart service
docker-compose down                  # Stop all services
```

## Service Endpoints

After successful deployment, services will be available at:

- **Response Analysis Service**: http://localhost:7010
- **Resume Service**: http://localhost:5010
- **AI Service**: http://localhost:6001
- **Kafka Brokers**:
  - Kafka1: localhost:9092
  - Kafka2: localhost:9093
  - Kafka3: localhost:9094
- **Zookeeper**: localhost:2181

## Features

### ✅ Conflict Resolution

- Automatically stops existing containers
- Removes old Docker images
- Prevents port conflicts

### ✅ Latest Changes

- Builds with `--no-cache` flag
- Ensures latest code changes are included
- Rebuilds all service images

### ✅ Error Handling

- Checks Docker prerequisites
- Validates Docker Compose availability
- Provides clear error messages
- Graceful failure handling

### ✅ User-Friendly Output

- Colored output for better readability
- Progress indicators
- Service status display
- Helpful command suggestions

## Troubleshooting

### Docker Not Running

```
❌ Docker is not running. Please start Docker Desktop and try again.
```

**Solution**: Start Docker Desktop and wait for it to fully initialize.

### Build Failures

```
❌ Build failed!
```

**Solution**: Check the specific error in the output and ensure:

- All Dockerfiles are present in microservice directories
- Dependencies are properly defined in package.json files
- No syntax errors in source code

### Port Conflicts

The scripts automatically handle port conflicts by stopping existing containers, but if you have other applications using these ports:

- Response Analysis Service: 7010
- Resume Service: 5010
- AI Service: 6001
- Kafka: 9092, 9093, 9094
- Zookeeper: 2181

### Memory Issues

If you encounter memory issues, try:

1. Increase Docker Desktop memory allocation
2. Close other applications
3. Run services individually rather than all at once

## Manual Commands

If you prefer manual control:

```powershell
# Windows
cd docker
docker-compose down --remove-orphans
docker-compose build --no-cache
docker-compose up -d
```

```bash
# Linux/macOS
cd docker
docker-compose down --remove-orphans
docker-compose build --no-cache
docker-compose up -d
```

## Environment Variables

The services use environment variables defined in the `docker-compose.yml` file. Key variables include:

- `KAFKA_BROKER`: Kafka connection string
- `GEMINI_API_KEY`: Google Gemini AI API key
- `DB_USERNAME`/`DB_PASSWORD`: MongoDB credentials
- `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`: AWS S3 credentials

Make sure these are properly configured in your `docker/docker-compose.yml` file.
