const mongoose = require("mongoose");

const adSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true, maxlength: 250 },
  image: {
    url: { type: String },
    publicId: { type: String },
  },
  link: { type: String },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const Ad = mongoose.model("Ad", adSchema);
module.exports = Ad;