const router = require("express").Router();

router.post("/request", async (req, res) => {
  try {
    const {
      title,
      description,
      image,
      imagePosition = "left",
      link,
    } = req.body;
    if (!title || !description) {
      return res
        .status(400)
        .json({ message: "Title and description are required" });
    }

    

  } catch (err) {
    console.log("Internal Server Error");
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
