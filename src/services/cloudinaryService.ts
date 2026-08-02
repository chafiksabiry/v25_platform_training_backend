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

  async uploadRemoteImage(
    imageUrl: string,
    folder: string = 'training-images'
  ): Promise<{ url: string; publicId: string }> {
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder,
      resource_type: 'image'
    });

    return {
      url: result.secure_url,
      publicId: result.public_id
    };
  }

  async uploadImageBuffer(
    buffer: Buffer,
    folder: string = 'training-images',
    format?: 'png' | 'jpg' | 'webp' | 'svg'
  ): Promise<{ url: string; publicId: string }> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          ...(format ? { format } : {})
        },
        (error, result) => {
          if (error || !result) return reject(error || new Error('Cloudinary upload failed'));
          resolve({
            url: result.secure_url,
            publicId: result.public_id
          });
        }
      );
      stream.end(buffer);
    });
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

  async uploadRemoteVideo(
    videoUrl: string,
    folder: string = 'training-videos'
  ): Promise<{ url: string; publicId: string }> {
    const result = await cloudinary.uploader.upload(videoUrl, {
      folder,
      resource_type: 'video'
    });

    return {
      url: result.secure_url,
      publicId: result.public_id
    };
  }

  async uploadAudioBuffer(
    buffer: Buffer,
    fileName: string,
    folder: string = 'training-podcasts/audio'
  ): Promise<{ url: string; publicId: string }> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'video',
          public_id: fileName,
          format: 'mp3'
        },
        (error, result) => {
          if (error || !result) return reject(error || new Error('Cloudinary audio upload failed'));
          resolve({
            url: result.secure_url,
            publicId: result.public_id
          });
        }
      );
      stream.end(buffer);
    });
  }

  async deleteFile(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
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
