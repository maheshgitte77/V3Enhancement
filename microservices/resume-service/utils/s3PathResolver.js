/**
 * S3 Path Resolver Utility
 * Centralized utility for generating structured S3 paths following the architecture:
 * - All paths start with clientId/
 * - Uses IDs (not names) for jobId, screeningId, assessmentId, candidateId, interviewId
 * - Separates creation, submissions, and additional_data
 */

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
        const { clientId, moduleType, jobId, screeningId, assessmentId, candidateId, interviewId, templateType, legacyModule } = context;

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

        return this.buildPath({ ...context, clientId: resolvedClientId, legacyModule });
    }

    /**
     * Builds the S3 path based on module type and context
     * @private
     */
    buildPath({ clientId, moduleType, jobId, screeningId, assessmentId, candidateId, interviewId, templateType, legacyModule }) {
        // Ensure clientId is at the start
        if (!clientId) {
            throw new Error("clientId is required");
        }

        const basePath = `${clientId}/`;

        switch (moduleType) {
            case "profile_photo":
                return `${basePath}users/profile_photo/`;

            case "organization_logo":
                return `${basePath}organization/logo/`;

            case "job_description":
                if (!jobId) throw new Error("jobId is required for job_description");
                return `${basePath}jobs/${jobId}/job_description/`;

            case "resume":
                if (!jobId) throw new Error("jobId is required for resume");
                return `${basePath}jobs/${jobId}/job_applications/resumes/`;

            case "certificate":
                if (!jobId) throw new Error("jobId is required for certificate");
                return `${basePath}jobs/${jobId}/job_applications/certificates/`;

            case "screening_creation":
                if (!jobId || !screeningId) {
                    throw new Error("jobId and screeningId are required for screening_creation");
                }
                return `${basePath}jobs/${jobId}/screenings/${screeningId}/creation/`;

            case "screening_submission":
                if (!jobId || !screeningId || !candidateId) {
                    throw new Error("jobId, screeningId, and candidateId are required for screening_submission");
                }
                return `${basePath}jobs/${jobId}/screenings/${screeningId}/submissions/${candidateId}/`;

            case "assessment_creation":
                if (!jobId || !assessmentId) {
                    throw new Error("jobId and assessmentId are required for assessment_creation");
                }
                return `${basePath}jobs/${jobId}/assessments/${assessmentId}/creation/`;

            case "assessment_submission":
                if (!jobId || !assessmentId || !candidateId) {
                    throw new Error("jobId, assessmentId, and candidateId are required for assessment_submission");
                }
                return `${basePath}jobs/${jobId}/assessments/${assessmentId}/submissions/${candidateId}/`;

            case "library_asset":
                return `${basePath}library/questions/assets/`;

            case "communication_attachment":
                return `${basePath}communication/attachments/`;

            case "interview_feedback":
                if (!jobId || !interviewId) {
                    throw new Error("jobId and interviewId are required for interview_feedback");
                }
                return `${basePath}jobs/${jobId}/interviews/${interviewId}/`;

            case "template_job":
                return `${basePath}templates/jobs/`;

            case "template_screening":
                return `${basePath}templates/screenings/`;

            case "template_assessment":
                return `${basePath}templates/assessments/`;

            case "additional_data":
                // Context-dependent: determine from jobId, screeningId, or assessmentId
                // Check if this is job creation (no jobId yet) by checking legacy module
                const isJobCreation = legacyModule && legacyModule.includes("/create_job/");

                if (isJobCreation) {
                    // Job creation - no jobId yet
                    return `${basePath}create_job/additional_data/`;
                } else if (assessmentId && jobId) {
                    return `${basePath}jobs/${jobId}/assessments/${assessmentId}/additional_data/`;
                } else if (screeningId && jobId) {
                    return `${basePath}jobs/${jobId}/screenings/${screeningId}/additional_data/`;
                } else if (jobId) {
                    // For job application additional data
                    if (candidateId) {
                        return `${basePath}jobs/${jobId}/job_applications/additional_data/`;
                    }
                    return `${basePath}jobs/${jobId}/create_job/additional_data/`;
                }
                // If no jobId and not job creation, check legacy module for create_job pattern
                if (legacyModule && legacyModule.includes("create_job")) {
                    return `${basePath}create_job/additional_data/`;
                }
                // Fallback: use create_job path if no jobId (assumes job creation)
                return `${basePath}create_job/additional_data/`;

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
        if (legacyModule.includes("/users/profile_photo")) {
            result.moduleType = "profile_photo";
        } else if (legacyModule.includes("/organization/logo") || legacyModule.includes("companyLogo")) {
            result.moduleType = "organization_logo";
        } else if (legacyModule.includes("/job_description")) {
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
        } else if (legacyModule.includes("/job_applications/certificates")) {
            result.moduleType = "certificate";
            const jobIdMatch = legacyModule.match(/jobs\/([^/]+)\/job_applications/);
            if (jobIdMatch) {
                result.jobId = jobIdMatch[1];
            }
        } else if (legacyModule.includes("/screenings/") && legacyModule.includes("/creation/")) {
            result.moduleType = "screening_creation";
            const screeningMatch = legacyModule.match(/screenings\/([^/]+)\/creation/);
            if (screeningMatch) {
                result.screeningId = screeningMatch[1];
            }
            const jobIdMatch = legacyModule.match(/jobs\/([^/]+)\/screenings/);
            if (jobIdMatch) {
                result.jobId = jobIdMatch[1];
            }
        } else if (legacyModule.includes("/screenings/") && legacyModule.includes("/submissions/")) {
            result.moduleType = "screening_submission";
            const candidateMatch = legacyModule.match(/submissions\/([^/]+)/);
            if (candidateMatch) {
                result.candidateId = candidateMatch[1];
            }
            const screeningMatch = legacyModule.match(/screenings\/([^/]+)\/submissions/);
            if (screeningMatch) {
                result.screeningId = screeningMatch[1];
            }
            const jobIdMatch = legacyModule.match(/jobs\/([^/]+)\/screenings/);
            if (jobIdMatch) {
                result.jobId = jobIdMatch[1];
            }
        } else if (legacyModule.includes("/assessments/") && legacyModule.includes("/creation/")) {
            result.moduleType = "assessment_creation";
            const assessmentMatch = legacyModule.match(/assessments\/([^/]+)\/creation/);
            if (assessmentMatch) {
                result.assessmentId = assessmentMatch[1];
            }
            const jobIdMatch = legacyModule.match(/jobs\/([^/]+)\/assessments/);
            if (jobIdMatch) {
                result.jobId = jobIdMatch[1];
            }
        } else if (legacyModule.includes("/assessments/") && (legacyModule.includes("/submission") || legacyModule.includes("/submissions/"))) {
            result.moduleType = "assessment_submission";
            const candidateMatch = legacyModule.match(/submissions\/([^/]+)/);
            if (candidateMatch) {
                result.candidateId = candidateMatch[1];
            }
            const assessmentMatch = legacyModule.match(/assessments\/([^/]+)\/(?:submission|submissions)/);
            if (assessmentMatch) {
                result.assessmentId = assessmentMatch[1];
            }
            const jobIdMatch = legacyModule.match(/jobs\/([^/]+)\/assessments/);
            if (jobIdMatch) {
                result.jobId = jobIdMatch[1];
            }
        } else if (legacyModule.includes("/library/questions/assets") || legacyModule.includes("editor-images")) {
            result.moduleType = "library_asset";
        } else if (legacyModule.includes("/communication/attachments")) {
            result.moduleType = "communication_attachment";
        } else if (legacyModule.includes("/interviews/")) {
            result.moduleType = "interview_feedback";
            const interviewMatch = legacyModule.match(/interviews\/([^/]+)/);
            if (interviewMatch) {
                result.interviewId = interviewMatch[1];
            }
            const jobIdMatch = legacyModule.match(/jobs\/([^/]+)\/interviews/);
            if (jobIdMatch) {
                result.jobId = jobIdMatch[1];
            }
        } else if (legacyModule.includes("/templates/jobs")) {
            result.moduleType = "template_job";
        } else if (legacyModule.includes("/templates/screenings")) {
            result.moduleType = "template_screening";
        } else if (legacyModule.includes("/templates/assessments")) {
            result.moduleType = "template_assessment";
        } else if (legacyModule.includes("/additional_data")) {
            result.moduleType = "additional_data";
            // Try to determine context
            if (legacyModule.includes("/assessments/")) {
                const assessmentMatch = legacyModule.match(/assessments\/([^/]+)\/additional_data/);
                if (assessmentMatch) {
                    result.assessmentId = assessmentMatch[1];
                }
            } else if (legacyModule.includes("/screenings/")) {
                const screeningMatch = legacyModule.match(/screenings\/([^/]+)\/additional_data/);
                if (screeningMatch) {
                    result.screeningId = screeningMatch[1];
                }
            }
            const jobIdMatch = legacyModule.match(/jobs\/([^/]+)/);
            if (jobIdMatch) {
                result.jobId = jobIdMatch[1];
            }
        } else if (legacyModule.includes("/create_job/additional_data")) {
            result.moduleType = "additional_data";
            // This is for job creation, no jobId yet
        } else if (legacyModule.includes("jobModule")) {
            // Generic job module - try to infer from context
            result.moduleType = "additional_data";
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

