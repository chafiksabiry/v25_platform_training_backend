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

  /** Upload image bytes (PNG/JPEG/WebP) — utilisé après génération IA (DALL·E, nanobanana, etc.) */
  async uploadImageBuffer(
    buffer: Buffer,
    folder: string = 'training-slide-illustrations',
    publicId?: string
  ): Promise<{ url: string; publicId: string }> {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_SECRET) {
      throw new Error('Cloudinary is not configured (CLOUDINARY_* env vars)');
    }
    return new Promise((resolve, reject) => {
      const opts: Record<string, string> = { folder, resource_type: 'image' };
      if (publicId) opts.public_id = publicId;
      const stream = cloudinary.uploader.upload_stream(opts, (error, result) => {
        if (error) return reject(error);
        if (!result?.secure_url) return reject(new Error('Cloudinary: missing secure_url'));
        resolve({ url: result.secure_url, publicId: result.public_id });
      });
      stream.end(buffer);
    });
  }

  /** Upload depuis une data-URL ou chaîne base64 brute (sans préfixe) */
  async uploadImageBase64(
    base64OrDataUrl: string,
    folder: string = 'training-slide-illustrations',
    publicId?: string
  ): Promise<{ url: string; publicId: string }> {
    const payload = base64OrDataUrl.startsWith('data:')
      ? base64OrDataUrl
      : `data:image/png;base64,${base64OrDataUrl}`;
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_SECRET) {
      throw new Error('Cloudinary is not configured (CLOUDINARY_* env vars)');
    }
    const opts: Record<string, string> = { folder, resource_type: 'image' };
    if (publicId) opts.public_id = publicId;
    const result = await cloudinary.uploader.upload(payload, opts);
    return { url: result.secure_url, publicId: result.public_id };
  }

  async uploadJsonData(
    data: any,
    fileName: string,
    folder: string = 'training-presentations'
  ): Promise<{ url: string; publicId: string }> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'raw',
          public_id: fileName,
          format: 'json'
        },
        (error, result) => {
          if (error) return reject(error);
          resolve({
            url: result!.secure_url,
            publicId: result!.public_id
          });
        }
      );
      uploadStream.end(JSON.stringify(data));
    });
  }
}

export default new CloudinaryService();
