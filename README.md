# @vivinkv28/strapi-upload-things

UploadThing provider for the Strapi Upload plugin.

This package lets Strapi store Media Library assets in UploadThing while keeping file metadata inside Strapi. It supports regular uploads, stream uploads, private files, signed URLs, remote cleanup on delete, and safer media replacement flows.

## Features

- Upload Strapi media files to UploadThing
- Store UploadThing file metadata in `provider_metadata`
- Use UploadThing `ufsUrl` as the Strapi asset URL
- Support `upload` and `uploadStream`
- Support private files with signed URL generation
- Delete remote files when media is removed from Strapi
- Keep predictable custom IDs by default
- Retry transient UploadThing ingest failures automatically
- Improve replace-media reliability with conflict fallback handling

## Installation

Install the provider in your Strapi project:

```bash
npm install @vivinkv28/strapi-upload-things uploadthing
```

## Requirements

- Node.js `>= 20.0.0`
- Strapi v5

## Environment Variables

Add your UploadThing token to your Strapi `.env` file:

```env
UPLOADTHING_TOKEN=your_uploadthing_token
```

Example:

```env
UPLOADTHING_TOKEN=your_uploadthing_token
UPLOADTHING_ACL=public-read
UPLOADTHING_PRIVATE_FILES=false
UPLOADTHING_CONTENT_DISPOSITION=inline
UPLOADTHING_SIGNED_URL_EXPIRES_IN=3600
UPLOADTHING_UPLOAD_CONCURRENCY=1
UPLOADTHING_UPLOAD_RETRIES=2
UPLOADTHING_USE_CUSTOM_ID=true
UPLOADTHING_LOG_LEVEL=Info
```

## Strapi Configuration

Create or update `./config/plugins.ts`:

```ts
export default ({ env }) => ({
  upload: {
    config: {
      provider: '@vivinkv28/strapi-upload-things',
      providerOptions: {
        token: env('UPLOADTHING_TOKEN'),
        acl: env('UPLOADTHING_ACL', 'public-read'),
        privateFiles: env.bool('UPLOADTHING_PRIVATE_FILES', false),
        contentDisposition: env('UPLOADTHING_CONTENT_DISPOSITION', 'inline'),
        signedUrlExpiresIn: env.int('UPLOADTHING_SIGNED_URL_EXPIRES_IN', 3600),
        uploadConcurrency: env.int('UPLOADTHING_UPLOAD_CONCURRENCY', 1),
        uploadRetries: env.int('UPLOADTHING_UPLOAD_RETRIES', 2),
        useCustomId: env.bool('UPLOADTHING_USE_CUSTOM_ID', true),
        logLevel: env('UPLOADTHING_LOG_LEVEL', 'Info'),
      },
      actionOptions: {
        upload: {},
        uploadStream: {},
        delete: {},
      },
    },
  },
});
```

## Provider Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `token` | `string` | `process.env.UPLOADTHING_TOKEN` | UploadThing token used to initialize `UTApi`. |
| `acl` | `string` | `undefined` | ACL passed to UploadThing during upload. |
| `privateFiles` | `boolean` | `false` | Marks files as private and enables signed URL resolution. |
| `contentDisposition` | `string` | `'inline'` | Content disposition used during upload. |
| `signedUrlExpiresIn` | `number` | `3600` | Signed URL expiration time in seconds. |
| `uploadConcurrency` | `number` | `1` | Maximum concurrent uploads handled by the provider. Values above `25` are capped. |
| `uploadRetries` | `number` | `2` | Number of retry attempts for transient UploadThing upload failures. |
| `useCustomId` | `boolean` | `true` | Uses a deterministic UploadThing `customId` based on Strapi file hash and extension. |
| `apiUrl` | `string` | `undefined` | Optional custom UploadThing API URL. |
| `ingestUrl` | `string` | `undefined` | Optional custom UploadThing ingest URL. |
| `logLevel` | `string` | `undefined` | Optional UploadThing log level. |
| `logFormat` | `string` | `undefined` | Optional UploadThing log format. |
| `isDev` | `boolean` | `undefined` | Optional UploadThing development mode flag. |

## How It Works

When Strapi uploads a file:

1. The provider sends the file to UploadThing using `UTApi`.
2. The returned `ufsUrl` is stored as `url` and `previewUrl`.
3. UploadThing metadata is stored in `file.provider_metadata.uploadthing`.
4. On delete, the provider removes the remote UploadThing file using the stored `customId` or `fileKey`.

Stored metadata includes:

- `fileKey`
- `customId`
- `url`
- `ufsUrl`
- `name`
- `size`

## Private Files

If `privateFiles` is enabled, the provider reports files as private and asks UploadThing for a signed URL when Strapi serves them.

Example:

```env
UPLOADTHING_PRIVATE_FILES=true
UPLOADTHING_SIGNED_URL_EXPIRES_IN=3600
```

## Replace Media Behavior

This provider is designed to work better with Strapi's Replace Media flow:

- it keeps deterministic custom IDs by default
- if UploadThing rejects a replacement because the old custom ID is still in use, it retries with a fresh unique custom ID
- if UploadThing reports a transient network or ingest failure, it retries automatically
- if the old remote file is already missing during delete, the provider ignores that condition and continues

These safeguards help reduce `500` errors during replace operations, especially when responsive image formats are being uploaded.

## Notes

- Public files use UploadThing's returned `ufsUrl` so Media Library previews work correctly.
- If `useCustomId` is enabled, the provider uses the Strapi file hash and extension as the preferred UploadThing custom ID.
- For image-heavy projects, keeping `uploadConcurrency` at `1` is the safest default.
- If you use a strict Content Security Policy, allow your UploadThing asset host for image and media previews.

## License

MIT
