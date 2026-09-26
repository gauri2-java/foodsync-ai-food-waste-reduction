const multer = require('multer');

// Images are held in memory for analysis, then written to disk by the service.
module.exports = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
