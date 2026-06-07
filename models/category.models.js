const mongoose = require("mongoose");
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String },
    image: {
      url: { type: String },
      publicId: { type: String },
    },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    providerCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const Category = mongoose.model("serviceCategory", categorySchema);

module.exports = Category;