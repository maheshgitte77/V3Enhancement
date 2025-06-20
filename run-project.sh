#!/bin/bash

# HireCorrect Microservices Docker Deployment Script
# This script handles conflicts, rebuilds with latest changes, and starts all services

echo "🚀 HireCorrect Microservices Deployment Script"
echo "============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Function to check if Docker is running
check_docker() {
    if ! docker version &> /dev/null; then
        echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Docker is running${NC}"
}

# Function to get Docker Compose command
get_docker_compose_cmd() {
    if command -v docker-compose &> /dev/null; then
        echo "docker-compose"
    elif docker compose version &> /dev/null; then
        echo "docker compose"
    else
        echo -e "${RED}❌ Docker Compose not found!${NC}"
        exit 1
    fi
}

# Check prerequisites
echo -e "${YELLOW}🔍 Checking prerequisites...${NC}"

check_docker

DOCKER_COMPOSE_CMD=$(get_docker_compose_cmd)
echo -e "${GREEN}✅ Docker Compose is available: $DOCKER_COMPOSE_CMD${NC}"

# Navigate to docker directory
ORIGINAL_PATH=$(pwd)
cd docker || {
    echo -e "${RED}❌ Could not find docker directory!${NC}"
    exit 1
}
echo -e "${BLUE}📁 Changed to docker directory${NC}"

# Stop and remove existing containers to avoid conflicts
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
$DOCKER_COMPOSE_CMD down --remove-orphans &> /dev/null
echo -e "${GREEN}✅ Existing containers stopped${NC}"

# Remove existing images to ensure latest builds
echo -e "${YELLOW}🗑️ Removing old service images...${NC}"
docker image rm docker_resume-service docker_response-analysis-service docker_ai-service &> /dev/null || true
echo -e "${GREEN}✅ Old images removed${NC}"

# Build services with latest changes
echo -e "${YELLOW}🔨 Building services with latest changes...${NC}"
if ! $DOCKER_COMPOSE_CMD build --no-cache; then
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Services built successfully${NC}"

# Start all services
echo -e "${YELLOW}🚀 Starting all services...${NC}"
if ! $DOCKER_COMPOSE_CMD up -d; then
    echo -e "${RED}❌ Failed to start services!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All services started successfully!${NC}"
echo ""

# Display service status
echo -e "${BLUE}📊 Service Status:${NC}"
echo -e "${BLUE}=================${NC}"
$DOCKER_COMPOSE_CMD ps

echo ""
echo -e "${BLUE}🌐 Service Endpoints:${NC}"
echo -e "${BLUE}===================${NC}"
echo -e "${CYAN}• Response Analysis Service:  http://localhost:7010${NC}"
echo -e "${CYAN}• Resume Service: http://localhost:5010${NC}"
echo -e "${CYAN}• AI Service:     http://localhost:6001${NC}"
echo -e "${CYAN}• Kafka Brokers:${NC}"
echo -e "  ${CYAN}- Kafka1: localhost:9092${NC}"
echo -e "  ${CYAN}- Kafka2: localhost:9093${NC}"
echo -e "  ${CYAN}- Kafka3: localhost:9094${NC}"
echo -e "${CYAN}• Zookeeper:     localhost:2181${NC}"

echo ""
echo -e "${BLUE}🔧 Useful Commands:${NC}"
echo -e "${BLUE}==================${NC}"
echo -e "${WHITE}• View logs: $DOCKER_COMPOSE_CMD logs -f [service-name]${NC}"
echo -e "${WHITE}• Stop all:  $DOCKER_COMPOSE_CMD down${NC}"
echo -e "${WHITE}• Restart:   $DOCKER_COMPOSE_CMD restart [service-name]${NC}"
echo -e "${WHITE}• Status:    $DOCKER_COMPOSE_CMD ps${NC}"

echo ""
echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo -e "${GREEN}   Services are running in detached mode.${NC}"
echo -e "${GREEN}   Use '$DOCKER_COMPOSE_CMD logs -f' to view real-time logs.${NC}"

# Return to original directory
cd "$ORIGINAL_PATH" 