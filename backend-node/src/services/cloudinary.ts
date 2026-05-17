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

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'talent_resumes',
    // We want to allow raw files (PDFs, DOCX, TXT)
    resource_type: 'raw',
    format: async (req, file) => {
        const ext = file.originalname.split('.').pop();
        return ext || 'raw';
    },
    public_id: (req, file) => `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`,
  } as any,
});

export const uploadCloudinary = multer({ storage: storage });
export { cloudinary };
