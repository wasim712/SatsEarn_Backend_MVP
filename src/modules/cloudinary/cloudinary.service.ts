import { v2 as cloudinary } from 'cloudinary';
import streamifier from 'streamifier';
import 'dotenv/config';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export class CloudinaryService {
  /**
   * Uploads an image buffer directly to Cloudinary and returns the secure URL.
   */
  static async uploadImageBuffer(fileBuffer: Buffer, folderName: string = "task_proofs"): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: folderName,
          format: 'jpg', // Force format to save space
          quality: 'auto', // Cloudinary automatically compresses it without losing visual quality
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error("Cloudinary returned no result."));
          
          // This is the URL that gets passed to OpenAI and saved in Prisma!
          resolve(result.secure_url); 
        }
      );

      // Pipe the buffer to Cloudinary
      streamifier.createReadStream(fileBuffer).pipe(uploadStream);
    });
  }
}