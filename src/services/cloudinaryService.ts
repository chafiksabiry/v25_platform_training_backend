import { v2 as cloudinary } from 'cloudinary';

class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
  }

  async uploadImage(
    file: Express.Multer.File,
    folder: string = 'training-images'
  ): Promise<{ url: string; publicId: string }> {
    const result = await cloudinary.uploader.upload(file.path, {
      folder,
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp']
    });

    return {
      url: result.secure_url,
      publicId: result.public_id
    };
  }

  async uploadDocument(
    file: Express.Multer.File,
    folder: string = 'training-content'
  ): Promise<{ url: string; publicId: string }> {
    const result = await cloudinary.uploader.upload(file.path, {
      folder,
      resource_type: 'raw',
      allowed_formats: ['pdf', 'doc', 'docx', 'ppt', 'pptx']
    });

    return {
      url: result.secure_url,
      publicId: result.public_id
    };
  }

  async uploadVideo(
    file: Express.Multer.File,
    folder: string = 'training-videos'
  ): Promise<{ url: string; publicId: string }> {
    const result = await cloudinary.uploader.upload(file.path, {
      folder,
      resource_type: 'video',
      allowed_formats: ['mp4', 'avi', 'mov', 'wmv']
    });

    return {
      url: result.secure_url,
      publicId: result.public_id
    };
  }

  async deleteFile(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }
}

export default new CloudinaryService();
