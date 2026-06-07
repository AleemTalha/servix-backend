const Category = require("../models/category.models");

/**
 * Get all active categories for users
 * @route GET /api/user/categories
 */
exports.getAllCategories = async (req, res) => {
  try {
    // Fetch only active and not deleted categories
    const categories = await Category.find({
      isActive: true,
      isDeleted: false,
    }).select("name description image providerCount").sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Categories retrieved successfully",
      count: categories.length,
      data: categories,
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching categories",
      error: error.message,
    });
  }
};
