#!/usr/bin/env pwsh

# HireCorrect Microservices Docker Deployment Script
# This script handles conflicts, rebuilds with latest changes, and starts all services

Write-Host "HireCorrect Microservices Deployment Script" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green

# Function to check if Docker is running
function Test-DockerRunning {
    try {
        docker version *>$null
        return $true
    }
    catch {
        return $false
    }
}

# Function to get Docker Compose command
function Get-DockerComposeCommand {
    try {
        docker-compose version *>$null
        return "docker-compose"
    }
    catch {
        try {
            docker compose version *>$null
            return "docker compose"
        }
        catch {
            Write-Host "[ERROR] Docker Compose not found!" -ForegroundColor Red
            exit 1
        }
    }
}

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

if (-not (Test-DockerRunning)) {
    Write-Host "[ERROR] Docker is not running. Please start Docker Desktop and try again." -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Docker is running" -ForegroundColor Green

$dockerComposeCmd = Get-DockerComposeCommand
Write-Host "[OK] Docker Compose is available: $dockerComposeCmd" -ForegroundColor Green

# Navigate to docker directory
$originalPath = Get-Location
try {
    Set-Location "docker"
    Write-Host "Changed to docker directory" -ForegroundColor Blue
    
    # Stop and remove existing containers to avoid conflicts
    Write-Host "Stopping existing containers..." -ForegroundColor Yellow
    if ($dockerComposeCmd -eq "docker-compose") {
        docker-compose down --remove-orphans 2>$null
    } else {
        docker compose down --remove-orphans 2>$null
    }
    Write-Host "[OK] Existing containers stopped" -ForegroundColor Green
    
    # Remove existing images to ensure latest builds
    Write-Host "Removing old service images..." -ForegroundColor Yellow
    docker image rm docker_resume-service docker_response-analysis-service docker_ai-service 2>$null
    Write-Host "[OK] Old images removed" -ForegroundColor Green
    
    # Build and start services with latest changes
    Write-Host "Building services with latest changes..." -ForegroundColor Yellow
    if ($dockerComposeCmd -eq "docker-compose") {
        docker-compose build --no-cache
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Build failed!" -ForegroundColor Red
            exit 1
        }
    } else {
        docker compose build --no-cache
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Build failed!" -ForegroundColor Red
            exit 1
        }
    }
    Write-Host "[OK] Services built successfully" -ForegroundColor Green
    
    # Start all services
    Write-Host "Starting all services..." -ForegroundColor Yellow
    if ($dockerComposeCmd -eq "docker-compose") {
        docker-compose up -d
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Failed to start services!" -ForegroundColor Red
            exit 1
        }
    } else {
        docker compose up -d
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Failed to start services!" -ForegroundColor Red
            exit 1
        }
    }
    
    Write-Host "[OK] All services started successfully!" -ForegroundColor Green
    Write-Host ""
    
    # Display service status
    Write-Host "Service Status:" -ForegroundColor Blue
    Write-Host "===============" -ForegroundColor Blue
    if ($dockerComposeCmd -eq "docker-compose") {
        docker-compose ps
    } else {
        docker compose ps
    }
    
    Write-Host ""
    Write-Host "Service Endpoints:" -ForegroundColor Blue
    Write-Host "==================" -ForegroundColor Blue
    Write-Host "* Response Analysis Service:  http://localhost:7010" -ForegroundColor Cyan
    Write-Host "* Resume Service: http://localhost:5010" -ForegroundColor Cyan
    Write-Host "* AI Service:     http://localhost:6001" -ForegroundColor Cyan
    Write-Host "* Kafka Brokers:" -ForegroundColor Cyan
    Write-Host "  - Kafka1: localhost:9092" -ForegroundColor DarkCyan
    Write-Host "  - Kafka2: localhost:9093" -ForegroundColor DarkCyan
    Write-Host "  - Kafka3: localhost:9094" -ForegroundColor DarkCyan
    Write-Host "* Zookeeper:     localhost:2181" -ForegroundColor Cyan
    
    Write-Host ""
    Write-Host "Useful Commands:" -ForegroundColor Blue
    Write-Host "================" -ForegroundColor Blue
    Write-Host "* View logs: $dockerComposeCmd logs -f [service-name]" -ForegroundColor White
    Write-Host "* Stop all:  $dockerComposeCmd down" -ForegroundColor White
    Write-Host "* Restart:   $dockerComposeCmd restart [service-name]" -ForegroundColor White
    Write-Host "* Status:    $dockerComposeCmd ps" -ForegroundColor White
    
    Write-Host ""
    Write-Host "[SUCCESS] Deployment completed successfully!" -ForegroundColor Green
    Write-Host "Services are running in detached mode." -ForegroundColor Green
    Write-Host "Use '$dockerComposeCmd logs -f' to view real-time logs." -ForegroundColor Green
    
} catch {
    Write-Host "[ERROR] An error occurred: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    Set-Location $originalPath
} 