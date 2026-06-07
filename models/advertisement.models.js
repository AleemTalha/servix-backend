const mongoose = require("mongoose");

const adSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true, maxlength: 250 },
  image: {
    url: { type: String },
    publicId: { type: String },
  },
  imagePosition: {
    enum: ["left", "right"],
    default: "right",
  },
  link: { type: String },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
});

const Ad = mongoose.model("Ad", adsSchema);
module.exports = Ad;