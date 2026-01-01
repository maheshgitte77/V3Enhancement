/**
 * S3 Path Resolver Utility
 * Centralized utility for generating structured S3 paths following the architecture:
 * - All paths start with clientId/
 * - Uses IDs (not names) for jobId, screeningId, assessmentId, candidateId, interviewId
 * - Separates creation, submissions, and additional_data
 */

const { buildNameIdSegment } = require("./slugifyName");

class S3PathResolver {
    /**
     * Resolves S3 path based on context
     * @param {Object} context - Context object containing path parameters
     * @param {string} context.clientId - Required: Client ID
     * @param {string} context.moduleType - Required: Type of module (profile_photo, resume, etc.)
     * @param {string} [context.jobId] - Optional: Job ID
     * @param {string} [context.screeningId] - Optional: Screening ID
     * @param {string} [context.assessmentId] - Optional: Assessment ID
     * @param {string} [context.candidateId] - Optional: Candidate ID
     * @param {string} [context.interviewId] - Optional: Interview ID
     * @param {string} [context.templateType] - Optional: Template type (job, screening, assessment)
     * @param {string} [context.legacyModule] - Optional: Legacy module string for backward compatibility
     * @returns {string} Resolved S3 path prefix
     */
    resolveS3Path(context) {
        const { clientId, moduleType,  legacyModule} = context;

        // Always try to get clientId - it should always exist
        let resolvedClientId = clientId;

        // If clientId not provided, try to parse from legacy module string
        if (!resolvedClientId && legacyModule) {
            const parsed = this.parseLegacyModule(legacyModule);
            if (parsed.clientId) {
                resolvedClientId = parsed.clientId;
            }
        }

        // If still no clientId, try to extract from module string pattern
        if (!resolvedClientId && legacyModule) {
            const clientIdMatch = legacyModule.match(/^([^/]+)\//);
            if (clientIdMatch && clientIdMatch[1] !== "clientId") {
                resolvedClientId = clientIdMatch[1];
            }
        }

        // If legacy module is provided, try to extract context from it
        if (legacyModule && !moduleType) {
            const parsed = this.parseLegacyModule(legacyModule);
            return this.buildPath({
                ...context,
                ...parsed,
                clientId: resolvedClientId || parsed.clientId || clientId,
                legacyModule
            });
        }

        // Ensure clientId is always set
        if (!resolvedClientId) {
            throw new Error("clientId is required for S3 path resolution");
        }

        return this.buildPath({ ...context, clientId: resolvedClientId, legacyModule});
    }

    /**
     * Builds the S3 path based on module type and context
     * @private
     */
    buildPath({ clientId, moduleType, jobId, clientName, jobName }) {
        // Ensure clientId is at the start
        if (!clientId) {
            throw new Error("clientId is required");
        }

        const clientSegment = buildNameIdSegment(clientName, clientId);
        const basePath = `${clientSegment}/`;
        const jobSegment = buildNameIdSegment(jobName, jobId);

        switch (moduleType) {

            case "job_description":
                if (!jobId) throw new Error("jobId is required for job_description");
                return `${basePath}jobs/${jobSegment || jobId}/job_description/`;

            case "resume":
                if (!jobId) throw new Error("jobId is required for resume");
                return `${basePath}jobs/${jobSegment || jobId}/job_applications/resumes/`;

            default:
                // Fallback: if moduleType is not recognized, try to use it as-is (backward compatibility)
                if (moduleType && moduleType.includes("/")) {
                    // If it looks like a path, ensure it starts with clientId/
                    return moduleType.startsWith(`${clientId}/`) ? `${moduleType}/` : `${basePath}${moduleType}/`;
                }
                throw new Error(`Unknown moduleType: ${moduleType}`);
        }
    }

    /**
     * Parses legacy module strings to extract context
     * Handles patterns like "clientId/job_title_jobId/assessments/name_assessmentId/submission"
     * @private
     */
    parseLegacyModule(legacyModule) {
        if (!legacyModule || typeof legacyModule !== "string") {
            return {};
        }

        const result = {};

        // Extract clientId if present
        const clientIdMatch = legacyModule.match(/^([^/]+)\//);
        if (clientIdMatch) {
            result.clientId = clientIdMatch[1];
        }

        // Determine module type from path structure
        if (legacyModule.includes("/job_description")) {
            result.moduleType = "job_description";
            // Try to extract jobId
            const jobIdMatch = legacyModule.match(/jobs\/([^/]+)\/job_description/);
            if (jobIdMatch) {
                result.jobId = jobIdMatch[1];
            }
        } else if (legacyModule.includes("/job_applications/resumes")) {
            result.moduleType = "resume";
            const jobIdMatch = legacyModule.match(/jobs\/([^/]+)\/job_applications/);
            if (jobIdMatch) {
                result.jobId = jobIdMatch[1];
            }
        }
        return result;
    }

    /**
     * Infers module type from legacy module string
     * @param {string} legacyModule - Legacy module string
     * @returns {string} Inferred module type
     */
    inferModuleType(legacyModule) {
        const parsed = this.parseLegacyModule(legacyModule);
        return parsed.moduleType || "additional_data";
    }
}

module.exports = new S3PathResolver();

