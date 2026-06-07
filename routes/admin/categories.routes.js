const router = require("express").Router();
const { upload, handleMulterError } = require("../../config/multer");
const {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  toggleCategoryStatus,
} = require("../../controllers/admin.category.controller");

router.post(
  "/",
  upload.single("image"),
  (err, req, res, next) => handleMulterError(err, req, res, next),
  createCategory
);

router.get("/", getAllCategories);

router.get("/:id", getCategoryById);

router.put(
  "/:id",
  upload.single("image"),
  (err, req, res, next) => handleMulterError(err, req, res, next),
  updateCategory
);

router.delete("/:id", deleteCategory);

router.patch("/:id/toggle-status", toggleCategoryStatus);

module.exports = router;