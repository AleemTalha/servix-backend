const router = require("express").Router();
const protect = require("../middlewares/protect");
const isAdmin = require("../middlewares/admin");

router.use("/categories",   protect, isAdmin, require("./admin/categories.routes"));
router.use("/provider",     protect, isAdmin, require("./admin/provider.routes"));
router.use("/applications", protect, isAdmin, require("./admin/applications.routes"));
router.use("/users",        protect, isAdmin, require("./admin/users.routes"));
router.use("/auth",         require("./admin/auth.routes"));

module.exports = router;