const express = require("express");
const upload = require("../config/multerConfig");
const { handleImageQuery } = require("../controllers/imageController");

const router = express.Router();

// POST /api/image-query
// Expects multipart/form-data with field name "image"
router.post("/", upload.single("image"), handleImageQuery);

module.exports = router;
