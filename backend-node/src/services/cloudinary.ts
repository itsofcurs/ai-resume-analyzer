import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

import fs from 'fs';
import path from 'path';

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const parts = file.originalname.split('.');
    const ext = parts.length > 1 ? '.' + parts.pop() : '';
    const nameWithoutExt = parts.join('.');
    const publicId = `${Date.now()}-${nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`;
    cb(null, publicId);
  }
});

export const uploadCloudinary = multer({ storage: storage });
export { cloudinary };
