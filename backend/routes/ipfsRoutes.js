const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads/ipfs');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Route for uploading files
router.post('/upload-to-ipfs', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        // For now, we'll just return the file path as a hash
        // In a real implementation, you would upload to IPFS here
        const fileHash = req.file.filename;

        res.status(200).json({
            success: true,
            hash: fileHash,
            message: 'File uploaded successfully'
        });
    } catch (error) {
        console.error('IPFS upload error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload file'
        });
    }
});

module.exports = router; 