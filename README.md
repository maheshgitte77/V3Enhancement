# HireCorrect Microservices

A microservices-based hiring solution with candidate response analysis, resume analysis, and AI-powered candidate screening.

## Architecture

This project consists of three main microservices:

- **Response Analysis Service** (Port 7010) - Processes candidate responses (video, audio, subjective) using Google Gemini AI
- **Resume Service** (Port 5010) - Analyzes resumes with AI and generates reports
- **AI Service** (Port 6001) - Handles general AI operations and screening questions

The architecture uses **Kafka** for inter-service communication, **MongoDB** for data storage, and **Google Cloud services** for AI processing.

## Prerequisites

- **Docker** and **Docker Compose**
- **Node.js** (v16 or higher) - for local development
- **PowerShell** - for testing scripts
- **Google Cloud Platform** account (for Gemini AI)
- **AWS S3** account (for file storage in resume service)
- **MongoDB** instance

## Quick Start with Docker

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd hirecorrecto-microservices
   ```

2. **Start all services**

   ```bash
   cd docker
   docker-compose up -d
   ```

3. **Access services**
   - Response Analysis Service: `http://localhost:7010`
   - Resume Service: `http://localhost:5010`
   - AI Service: `http://localhost:6001`

## Response Analysis Service API Versioning 🚀

The response analysis service uses **route-based API versioning** instead of environment variables, allowing you to test multiple versions simultaneously without service restarts.

### Available API Versions

- **V0 (Default)** - Original implementation using `responseWorker.js`
- **V1** - Enhanced version using `responseWorkerV1.js`
- **V2** - Advanced version using `responseWorkerV2.js`

### API Endpoints

#### 📚 Video Response Analysis

Analyze video responses with different algorithm versions:

**V0 (Default):**

```bash
POST http://localhost:7010/api/response/analyzeMediaResponse
```

**V1 (Conservative):**

```bash
POST http://localhost:7010/api/response/analyzeMediaResponse/v1
```

**V2 (Balanced):**

```bash
POST http://localhost:7010/api/response/analyzeMediaResponse/v2
```

#### Subjective Analysis Endpoints

```bash
# Default V0 version
POST http://localhost:7010/api/response/analyzeSubjective

# Version 1
POST http://localhost:7010/api/response/analyzeSubjective/v1

# Version 2
POST http://localhost:7010/api/response/analyzeSubjective/v2
```

#### Screening Endpoint (All Versions)

```bash
POST http://localhost:7010/api/response/analyzeScreening
```

### Key Benefits of Route-Based Versioning

🚀 **No Service Restarts** - Test all versions simultaneously  
🚀 **Better API Versioning** - Industry standard approach  
🚀 **Easier Testing** - Compare versions side-by-side  
🚀 **Gradual Rollout** - Deploy new versions incrementally  
🚀 **Simplified Architecture** - No environment variable complexity

### Testing Framework

#### Quick Setup

```powershell
# Build and start the service (all versions available)
.\test-version.ps1
```

#### Test All API Endpoints

```powershell
# Test all available endpoints
.\test-api-versions.ps1
```

This script will:

- Test all `/analyzeMediaResponse` endpoints (V0, V1, V2)
- Test all `/analyzeSubjective` endpoints (V0, V1, V2)
- Test the `/analyzeScreening` endpoint
- Show API usage examples

#### Expected Output

When service starts successfully, you'll see:

```
🔄 Initializing Response Analysis Workers:
   ✅ V0 (Default) - responseWorker.js
   ✅ V1 - responseWorkerV1.js
   ✅ V2 - responseWorkerV2.js
🚀 Response Analysis Service running on port 7010
📋 Available endpoints:
   • /api/response/analyzeMediaResponse (V0 - Default)
   • /api/response/analyzeMediaResponse/v1 (V1)
   • /api/response/analyzeMediaResponse/v2 (V2)
   • /api/response/analyzeSubjective (V0 - Default)
   • /api/response/analyzeSubjective/v1 (V1)
   • /api/response/analyzeSubjective/v2 (V2)
```

### Testing Different Versions

1. **Start the service once**

   ```powershell
   .\test-version.ps1
   ```

2. **Test V0 (baseline)**

   ```bash
   POST http://localhost:7010/api/response/analyzeMediaResponse
   # Include your test data
   ```

3. **Test V1 without restarting**

   ```bash
   POST http://localhost:7010/api/response/analyzeMediaResponse/v1
   # Same test data for comparison
   ```

4. **Test V2 without restarting**

   ```bash
   POST http://localhost:7010/api/response/analyzeMediaResponse/v2
   # Same test data for comparison
   ```

5. **Compare results** from all three versions simultaneously

### Version-Specific Response Format

Each version returns a response indicating which worker processed the request:

```json
{
  "message": "Response processing completed with V1 worker",
  "version": "v1",
  "analysis": {
    /* analysis results */
  }
}
```

### Monitoring

- **Live logs**: `docker-compose logs -f response-analysis-service`
- **Service status**: `docker-compose ps`
- **Stop service**: `docker-compose stop response-analysis-service`

## Environment Configuration

### Required Environment Variables

Each service requires specific environment variables. Key ones include:

- `KAFKA_BROKER` - Kafka broker connection string
- `GEMINI_API_KEY` - Google Gemini AI API key
- `DB_USERNAME`, `DB_PASSWORD` - MongoDB credentials
- `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` - AWS credentials

**Note**: `WORKER_VERSION` is no longer used - versions are now controlled via API routes.

### Docker Compose Configuration

The `docker-compose.yml` includes:

- Kafka cluster (3 brokers + Zookeeper)
- All microservices with proper networking
- Environment variable injection
- Port mappings

## Development

### Local Development

For local development without Docker:

1. **Install dependencies** for each service:

   ```bash
   cd microservices/response-analysis-service && npm install
   cd ../resume-service && npm install
   cd ../ai && npm install
   ```

2. **Set up environment files** (`.env`) in each service directory

3. **Start services** individually:
   ```bash
   npm run dev  # or npm start
   ```

### Adding New Worker Versions

1. **Create new worker file**: `responseWorkerV3.js`
2. **Add import** in `controllers/analyzeResponseControllers.js`
3. **Create version-specific controllers** using the existing pattern
4. **Add new routes** in `routes/analyzeResponseRoutes.js`
5. **Update index.js** to display new endpoints
6. **Test with new endpoint**: `/api/response/analyzeMediaResponse/v3`

## API Endpoints

### Response Analysis Service

- `POST /api/response/analyzeMediaResponse` - Analyze media content (V0 default)
- `POST /api/response/analyzeMediaResponse/v1` - Analyze media content (V1)
- `POST /api/response/analyzeMediaResponse/v2` - Analyze media content (V2)
- `POST /api/response/analyzeSubjective` - Analyze subjective content (V0 default)
- `POST /api/response/analyzeSubjective/v1` - Analyze subjective content (V1)
- `POST /api/response/analyzeSubjective/v2` - Analyze subjective content (V2)
- `POST /api/response/analyzeScreening` - Process candidate screening

### Resume Service

- `POST /api/resume/analyze` - Analyze resume content
- `GET /api/resume/results/:id` - Get analysis results

### AI Service

- `POST /api/ai/generate-questions` - Generate screening questions
- `POST /api/ai/evaluate` - Evaluate responses

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 5010, 6001, 7010, 9092-9094, 2181 are available
2. **Docker memory**: Kafka cluster requires sufficient Docker memory (8GB+ recommended)
3. **API keys**: Verify Google Gemini and AWS credentials are correct
4. **Worker initialization**: Check logs for all worker versions being loaded

### Debugging

```bash
# View all logs
docker-compose logs

# View specific service logs
docker-compose logs -f response-analysis-service

# Check service status
docker-compose ps

# Restart specific service
docker-compose restart response-analysis-service

# Test specific API version
curl -X POST http://localhost:7010/api/response/analyzeMediaResponse/v1
```

### Testing Specific Issues

```powershell
# Test all endpoints for availability
.\test-api-versions.ps1

# Check which endpoints are responding
curl -i http://localhost:7010/api/response/analyzeMediaResponse
curl -i http://localhost:7010/api/response/analyzeMediaResponse/v1
curl -i http://localhost:7010/api/response/analyzeMediaResponse/v2
```

## Contributing

1. **Create feature branch**
2. **Test with all video worker versions** using route-based endpoints
3. **Ensure Docker builds pass**
4. **Update API documentation** if adding new endpoints
5. **Submit pull request**

## Migration from Environment Variable Versioning

If upgrading from the previous environment variable approach:

### Before (Old Approach)

```powershell
# Required service restart for each version
.\test-version.ps1 V1  # Restart with V1
.\test-version.ps1 V2  # Restart with V2
```

### After (New Approach)

```bash
# Start once, test all versions
.\test-version.ps1

# Test all versions without restart
POST /api/response/analyzeMediaResponse      # V0
POST /api/response/analyzeMediaResponse/v1   # V1
POST /api/response/analyzeMediaResponse/v2   # V2
```

## License

[Add your license information here]
