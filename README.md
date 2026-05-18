# @vivinkv28/strapi-provider-uploadthing

UploadThing provider for the Strapi Uploads

This provider stores Strapi Media Library files in UploadThing while keeping file records and metadata inside Strapi.

## What This Provider Does

- Uploads Strapi media files to UploadThing
- Stores UploadThing metadata in `provider_metadata.uploadthing`
- Uses the UploadThing file URL as the Strapi file URL
- Supports both `upload` and `uploadStream`
- Supports signed URLs for private files
- Deletes the remote file when the Strapi file is deleted
- Uses predictable `customId` values by default
- Retries transient upload failures automatically
- Handles replace-media conflicts more safely

## Requirements

- Node.js `>= 20.0.0`
- Strapi v5

## Installation

Install the provider in your Strapi project:

```bash
npm install @vivinkv28/strapi-provider-uploadthing
```

## Quick Start

1. Add your UploadThing token to `.env`.
2. Configure the upload provider in `config/plugins.ts`.
3. Update `config/middlewares.ts` so Strapi allows UploadThing media URLs in the admin.
4. Restart Strapi.

## Environment Variables

Minimum required:

```env
UPLOADTHING_TOKEN=your_uploadthing_token
```

Typical public-file setup:

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

Typical private-file setup:

```env
UPLOADTHING_TOKEN=your_uploadthing_token
UPLOADTHING_ACL=private
UPLOADTHING_PRIVATE_FILES=true
UPLOADTHING_SIGNED_URL_EXPIRES_IN=3600
```

## Strapi Configuration

Create or update `./config/plugins.ts`:

```ts
export default ({ env }) => ({
  upload: {
    config: {
      provider: '@vivinkv28/strapi-provider-uploadthing',
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

Update `./config/middlewares.ts` as well. This step is required so Strapi's Content Security Policy allows UploadThing-hosted images and media to load in the admin panel and Media Library:

```ts
import type { Core } from '@strapi/strapi';

const config: Core.Config.Middlewares = [
  'strapi::logger',
  'strapi::errors',
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'connect-src': ["'self'", 'https:'],
          'img-src': ["'self'", 'data:', 'blob:', 'https://*.ufs.sh', 'https://utfs.io'],
          'media-src': ["'self'", 'data:', 'blob:', 'https://*.ufs.sh', 'https://utfs.io'],
          upgradeInsecureRequests: null,
        },
      },
    },
  },
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
```

If you already have a `strapi::security` middleware entry, merge these UploadThing domains into your existing CSP directives instead of adding a second `strapi::security` entry.

## Public vs Private Files

This is the part most people get confused by:

- `acl` controls how the file is stored in UploadThing.
- `privateFiles` controls how Strapi serves the file.

Use this combination for public files:

```env
UPLOADTHING_ACL=public-read
UPLOADTHING_PRIVATE_FILES=false
```

Use this combination for private files:

```env
UPLOADTHING_ACL=private
UPLOADTHING_PRIVATE_FILES=true
```

If you set only `privateFiles=true`, Strapi will generate signed URLs, but the uploaded file may still be stored with a public ACL depending on your UploadThing configuration.

## How Private Files Work

When `privateFiles` is enabled:

1. The provider tells Strapi that files should be treated as private.
2. Strapi asks the provider for a signed URL whenever it needs to serve the file.
3. The provider requests a temporary signed URL from UploadThing using the stored `customId` or `fileKey`.
4. Strapi returns that temporary URL to the client.

The signed URL lifetime is controlled by `signedUrlExpiresIn`.

## Provider Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `token` | `string` | `process.env.UPLOADTHING_TOKEN` | UploadThing token used to initialize `UTApi`. |
| `acl` | `'public-read' \| 'private'` | `undefined` | ACL passed to UploadThing during upload. Use `'public-read'` for public files or `'private'` for storage-level private files. |
| `privateFiles` | `boolean` | `false` | Tells Strapi to treat files as private and request signed URLs when serving them. |
| `contentDisposition` | `'inline' \| 'attachment'` | `'inline'` | Content disposition sent to UploadThing during upload. |
| `signedUrlExpiresIn` | `number` | `3600` | Signed URL lifetime in seconds. Used when Strapi requests a private file URL. |
| `uploadConcurrency` | `number` | `1` | Maximum number of concurrent uploads handled by the provider. Values above `25` are capped to `25`. |
| `uploadRetries` | `number` | `2` | Number of retry attempts for transient UploadThing upload failures. |
| `useCustomId` | `boolean` | `true` | Uses a deterministic UploadThing `customId` based on the Strapi file hash and extension. |
| `apiUrl` | `string` | `undefined` | Optional custom UploadThing API URL. |
| `ingestUrl` | `string` | `undefined` | Optional custom UploadThing ingest URL. |
| `logLevel` | `string` | `undefined` | Optional UploadThing log level. |
| `logFormat` | `string` | `undefined` | Optional UploadThing log format. |
| `isDev` | `boolean` | `undefined` | Optional UploadThing development mode flag. |

## Stored Metadata

After upload, this provider stores UploadThing-specific metadata in:

```txt
provider_metadata.uploadthing
```

That metadata includes values such as:

- `fileKey`
- `customId`
- `url`
- `ufsUrl`
- `name`
- `size`

## Notes

- The provider uses UploadThing `ufsUrl` as the file URL stored in Strapi.
- If `useCustomId` is enabled, the provider prefers `customId` when generating signed URLs or deleting files.
- If a deterministic `customId` conflicts during replace-media flows, the provider falls back to a unique ID and retries the upload.

## Learn More

- [UploadThing](https://uploadthing.com/)
