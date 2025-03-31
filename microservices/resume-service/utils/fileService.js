const AWS = require("aws-sdk");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const File = require("../model/File"); // Assuming File model is properly set up

// AWS S3 Configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  region: process.env.S3_REGION,
  signatureVersion: "v4",
});

const signedUrlExpireSeconds = 60 * 60 * 24; // 24 hours

const fileService = {
  /**
   * Generate a signed URL for uploading a file.
   * @param {Object} options
   * @param {String} options.userId - ID of the user uploading the file
   * @param {String} options.name - File name
   * @param {String} options.extension - File extension (pdf, png, jpg, etc.)
   * @param {String} options.module - Module associated with the file
   * @param {Number} options.size - File size in bytes
   * @returns {Promise<Object>} - Signed upload URL and file metadata
   */
  async generateUploadUrl({ userId, name, extension, module, size }) {
    try {
      const key = `${uuidv4()}.${extension}`;

      const uploadUrl = s3.getSignedUrl("putObject", {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
        ACL: "public-read",
        Expires: 60 * 60 * 24 || signedUrlExpireSeconds,
      });

      const file = new File({ userId, name, key, size, extension, module });
      await file.save();

      return { uploadUrl, fileId: file._id, key };
    } catch (error) {
      console.error("Error generating upload URL:", error);
      throw error;
    }
  },

  /**
   * Fetch file metadata and generate a signed URL for downloading.
   * @param {Object} options
   * @param {String} options.fileId - MongoDB File ID
   * @param {Boolean} options.generateURL - Whether to generate a signed URL
   * @param {Number} [options.time] - Expiry time for signed URL in seconds
   * @returns {Promise<String|Object>} - Signed URL or file data
   */
  async getUrlById({
    fileId,
    generateURL = false,
    time = signedUrlExpireSeconds,
  }) {
    try {
      if (!mongoose.Types.ObjectId.isValid(fileId)) {
        throw new Error("Invalid file ID");
      }

      const file = await File.findById(fileId);
      if (!file) {
        throw new Error("File not found");
      }

      if (generateURL) {
        return s3.getSignedUrl("getObject", {
          Bucket: process.env.S3_BUCKET_NAME,
          Key: file.key,
          Expires: time,
        });
      }

      return file;
    } catch (error) {
      console.error("Error fetching file or generating URL:", error);
      throw error;
    }
  },
};

module.exports = fileService;
