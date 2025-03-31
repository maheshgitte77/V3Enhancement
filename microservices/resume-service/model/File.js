const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    name: {
      type: String,
    },
    key: {
      type: String,
      required: true,
      index: true,
    },
    size: Number,
    extension: String,
    meta: Map,
    module: String,
  },
  {
    strict: false,
    timestamps: true,
  }
);

module.exports = mongoose.model("File", FileSchema);
