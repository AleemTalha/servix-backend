const router = require("express").Router();
const { getAllCategories } = require("../../controllers/user.category.controller");

router.get("/", getAllCategories);

module.exports = router;