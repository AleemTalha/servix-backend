const router = require("express").Router();
const protect = require("../middlewares/protect");
const Ad = require("../models/advertisement.models");

router.post("/request", protect, async (req, res) => {
  try {
    const { title, description, image, link } = req.body;
    if (!title || !description) {
      return res.status(400).json({ success: false, message: "Title and description are required" });
    }

    const ad = await Ad.create({
      title,
      description,
      image: image || {},
      link: link || "",
      user: req.user.id,
      status: "pending",
    });

    res.status(201).json({ success: true, message: "Ad request submitted", ad });
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

router.get("/approved", async (req, res) => {
  try {
    const ads = await Ad.find({ status: "approved", isActive: true })
      .populate("user", "firstName lastName profileImage")
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({ success: true, ads });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/my", protect, async (req, res) => {
  try {
    const ads = await Ad.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, ads });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
