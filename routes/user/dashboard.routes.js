const router = require("express").Router();
const Ad = require("../../models/advertisement.models");
const User = require("../../models/user.models");
const Category = require("../../models/category.models");

router.get("/home", async (req, res) => {
  try {
    const ads = await Ad.find({ status: "approved", isActive: true })
      .populate("user", "firstName lastName profileImage")
      .sort({ createdAt: -1 })
      .limit(5);

    const providers = await User.find({ role: "provider" })
      .select("firstName lastName profileImage providerProfile")
      .sort({ "providerProfile.totalRating": -1 })
      .limit(10);

    const categories = await Category.find({ isActive: true })
      .sort({ name: 1 });

    res.json({
      success: true,
      ads,
      providers: providers.map((p) => ({
        _id: p._id,
        firstName: p.firstName,
        lastName: p.lastName,
        profileImage: p.profileImage,
        bio: p.providerProfile?.bio || "",
        rating: p.providerProfile?.totalRating || 0,
        reviews: p.providerProfile?.totalReviews || 0,
        hourlyRate: p.providerProfile?.hourlyRate || 0,
      })),
      categoriesCount: categories.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
