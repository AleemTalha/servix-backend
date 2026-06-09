const router = require("express").Router();
const Ad = require("../../models/advertisement.models");

router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const ads = await Ad.find(filter)
      .populate("user", "firstName lastName email profileImage")
      .sort({ createdAt: -1 });

    res.json({ success: true, ads });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.patch("/:id/approve", async (req, res) => {
  try {
    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    );
    if (!ad) return res.status(404).json({ success: false, message: "Ad not found" });
    res.json({ success: true, message: "Ad approved", ad });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.patch("/:id/reject", async (req, res) => {
  try {
    const ad = await Ad.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    );
    if (!ad) return res.status(404).json({ success: false, message: "Ad not found" });
    res.json({ success: true, message: "Ad rejected", ad });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
