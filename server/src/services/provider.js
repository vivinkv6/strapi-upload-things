import crypto from 'crypto';
import { UTApi, UTFile } from 'uploadthing/server';

const DEFAULT_CONTENT_DISPOSITION = 'inline';
const DEFAULT_SIGNED_URL_TTL = 60 * 60;
const DEFAULT_UPLOAD_CONCURRENCY = 1;
const DEFAULT_UPLOAD_RETRIES = 2;

const toPositiveInteger = (value, fallback) => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
};

const buildCustomId = (file) => {
  if (file?.provider_metadata?.uploadthing?.customId) {
    return file.provider_metadata.uploadthing.customId;
  }

  return `${file.hash}${file.ext || ''}`;
};

const buildUniqueCustomId = (file) => {
  const extension = file.ext || '';
  const base = file.hash || crypto.randomUUID();
  const suffix = crypto.randomBytes(4).toString('hex');

  return `${base}-${suffix}${extension}`;
};

const getStoredKey = (file) => file?.provider_metadata?.uploadthing?.fileKey;

const getStoredCustomId = (file) => file?.provider_metadata?.uploadthing?.customId;

const normalizeUploadResult = (result) => {
  if (!result) {
    throw new Error('UploadThing returned an empty upload response.');
  }

  if (result.error) {
    throw new Error(`UploadThing upload failed: ${result.error.message}`);
  }

  if (!result.data?.key || !result.data?.ufsUrl) {
    throw new Error('UploadThing upload response is missing the file key or a usable URL.');
  }

  return result.data;
};

const streamToBuffer = async (stream) => {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
};

const isCustomIdConflictError = (error) => {
  const message = `${error?.message || ''}`.toLowerCase();

  if (!message) {
    return false;
  }

  return (
    (message.includes('customid') || message.includes('custom id')) &&
    (message.includes('exist') ||
      message.includes('duplicate') ||
      message.includes('already') ||
      message.includes('conflict') ||
      message.includes('taken'))
  );
};

const isMissingFileError = (error) => {
  const message = `${error?.message || ''}`.toLowerCase();

  if (!message) {
    return false;
  }

  return (
    message.includes('not found') ||
    message.includes('no such file') ||
    message.includes('file does not exist') ||
    message.includes('unable to find') ||
    message.includes('unknown file')
  );
};

const isRetryableUploadError = (error) => {
  const message = `${error?.message || ''}`.toLowerCase();

  if (!message) {
    return false;
  }

  return (
    message.includes('failed to upload file') ||
    message.includes('transport error') ||
    message.includes('fetch failed') ||
    message.includes('socket') ||
    message.includes('other side closed') ||
    message.includes('econnreset') ||
    message.includes('timeout')
  );
};

export default (providerOptions = {}) => {
  const {
    token = process.env.UPLOADTHING_TOKEN,
    acl,
    apiUrl,
    ingestUrl,
    logLevel,
    logFormat,
    isDev,
    contentDisposition = DEFAULT_CONTENT_DISPOSITION,
    signedUrlExpiresIn = DEFAULT_SIGNED_URL_TTL,
    uploadConcurrency = DEFAULT_UPLOAD_CONCURRENCY,
    uploadRetries = DEFAULT_UPLOAD_RETRIES,
    privateFiles = false,
    useCustomId = true,
  } = providerOptions;

  if (!token) {
    throw new Error(
      'Missing UploadThing token. Set `providerOptions.token` or the `UPLOADTHING_TOKEN` environment variable.'
    );
  }

  const utapi = new UTApi({
    token,
    apiUrl,
    ingestUrl,
    logLevel,
    logFormat,
    isDev,
    defaultKeyType: useCustomId ? 'customId' : 'fileKey',
  });

  const resolvedSignedUrlTtl = signedUrlExpiresIn;
  const resolvedUploadConcurrency = Math.min(
    25,
    toPositiveInteger(uploadConcurrency, DEFAULT_UPLOAD_CONCURRENCY)
  );
  const resolvedUploadRetries = Math.max(0, toPositiveInteger(uploadRetries, DEFAULT_UPLOAD_RETRIES));
  let activeUploads = 0;
  const queuedUploads = [];

  const runWithUploadSlot = async (task) => {
    if (activeUploads >= resolvedUploadConcurrency) {
      await new Promise((resolve) => {
        queuedUploads.push(resolve);
      });
    }

    activeUploads += 1;

    try {
      return await task();
    } finally {
      activeUploads -= 1;
      const next = queuedUploads.shift();

      if (next) {
        next();
      }
    }
  };

  const assignUploadDataToFile = (file, uploaded, customId) => {
    const publicUrl = uploaded.ufsUrl;

    file.url = publicUrl;
    file.previewUrl = publicUrl;
    file.provider_metadata = {
      ...(file.provider_metadata || {}),
      uploadthing: {
        fileKey: uploaded.key,
        customId,
        url: publicUrl,
        ufsUrl: uploaded.ufsUrl,
        name: uploaded.name,
        size: uploaded.size,
      },
    };
  };

  const performUpload = async (file, buffer, customId) => {
    const uploadFile = new UTFile([buffer], file.name || `${file.hash}${file.ext || ''}`, {
      customId,
      type: file.mime,
    });

    let lastError;

    for (let attempt = 0; attempt <= resolvedUploadRetries; attempt += 1) {
      try {
        const result = await utapi.uploadFiles(uploadFile, {
          acl,
          contentDisposition,
          concurrency: 1,
          metadata: {
            source: 'strapi',
            hash: file.hash,
            ext: file.ext,
            mime: file.mime,
          },
        });

        const uploaded = normalizeUploadResult(result);
        assignUploadDataToFile(file, uploaded, customId);
        return;
      } catch (error) {
        lastError = error;

        if (attempt >= resolvedUploadRetries || !isRetryableUploadError(error)) {
          throw error;
        }
      }
    }

    throw lastError;
  };

  const uploadBuffer = async (file, buffer) => {
    const preferredCustomId = useCustomId ? buildCustomId(file) : undefined;

    await runWithUploadSlot(async () => {
      try {
        await performUpload(file, buffer, preferredCustomId);
      } catch (error) {
        if (!useCustomId || !preferredCustomId) {
          throw error;
        }

        const fallbackCustomId = buildUniqueCustomId(file);

        if (!isCustomIdConflictError(error)) {
          try {
            await performUpload(file, buffer, fallbackCustomId);
            return;
          } catch (retryError) {
            throw error;
          }
        }

        await performUpload(file, buffer, fallbackCustomId);
      }
    });
  };

  return {
    async isPrivate() {
      return privateFiles || acl === 'private';
    },

    async getSignedUrl(file) {
      const keyType = useCustomId && getStoredCustomId(file) ? 'customId' : 'fileKey';
      const key = keyType === 'customId' ? getStoredCustomId(file) : getStoredKey(file);

      if (!key) {
        return file;
      }

      const signed = await utapi.generateSignedURL(key, {
        expiresIn: resolvedSignedUrlTtl,
        keyType,
      });

      return {
        url: signed.ufsUrl,
      };
    },

    async uploadStream(file) {
      if (!file.stream) {
        throw new Error('Missing file stream');
      }

      const buffer = await streamToBuffer(file.stream);
      await uploadBuffer(file, buffer);
    },

    async upload(file) {
      if (!file.buffer) {
        throw new Error('Missing file buffer');
      }

      await uploadBuffer(file, file.buffer);
    },

    async delete(file) {
      const keyType = useCustomId && getStoredCustomId(file) ? 'customId' : 'fileKey';
      const key = keyType === 'customId' ? getStoredCustomId(file) : getStoredKey(file);

      if (!key) {
        return;
      }

      try {
        await utapi.deleteFiles(key, { keyType });
      } catch (error) {
        if (isMissingFileError(error)) {
          return;
        }

        throw error;
      }
    },
  };
};
