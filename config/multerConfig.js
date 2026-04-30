const multer = require("multer");

// Store uploaded images in memory (Buffer) — no disk cleanup needed.
const storage = multer.memoryStorage();

// Only allow common image formats relevant to crop disease photos.
const ALLOWED_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
];

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

function fileFilter(_req, file, cb) {
	if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
		return cb(null, true);
	}

	const error = new Error(
		`Unsupported file type: ${file.mimetype}. Allowed types: JPEG, PNG, WebP.`
	);
	error.code = "UNSUPPORTED_FILE_TYPE";
	return cb(error, false);
}

const upload = multer({
	storage,
	fileFilter,
	limits: {
		fileSize: MAX_FILE_SIZE_BYTES,
	},
});

module.exports = upload;
