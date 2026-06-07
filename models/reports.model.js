const mongoose = require("mongoose");

const reportsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  title: {
    type: string,
    required: true,
  },
  description: {
    type: String,
    default: "No Description ...",
  },
  links: [
    {
      type: String,
      default: null,
    },
  ],
});

const Report = mongoose.model("Report", reportsSchema);
module.exports = Reports;
