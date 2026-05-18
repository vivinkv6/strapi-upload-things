# @vivinkv28/strapi-provider-uploadthing

UploadThing provider for Strapi uploads.

This provider stores Strapi Media Library files in UploadThing, offering high-performance, seamless media uploads for Strapi v5 applications.

---

## Requirements

- Node.js `>= 20.0.0`
- Strapi v5

---

## Installation

Install the provider in your Strapi project:

```bash
npm install @vivinkv28/strapi-provider-uploadthing
```

---

## Setup & Configuration

### 1. Environment Variables
Add your UploadThing token and optional configuration variables to your Strapi project's `.env` file:

```env
# UploadThing Token (Required)
UPLOADTHING_TOKEN=your_uploadthing_token

# Optional Configurations
UPLOADTHING_ACL=public-read
UPLOADTHING_PRIVATE_FILES=false
UPLOADTHING_CONTENT_DISPOSITION=inline
UPLOADTHING_SIGNED_URL_EXPIRES_IN=3600
UPLOADTHING_UPLOAD_CONCURRENCY=1
UPLOADTHING_UPLOAD_RETRIES=2
UPLOADTHING_USE_CUSTOM_ID=true
UPLOADTHING_LOG_LEVEL=Info
```

### 2. Configure Plugin (`./config/plugins.ts`)
Enable and configure the upload provider in your plugins configuration file:

```typescript
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

### 3. Configure Content Security Policy (`./config/middlewares.ts`)
To allow UploadThing-hosted media and images to render inside the Strapi Admin Panel and Media Library, update the `contentSecurityPolicy` directives in your security middleware:

```typescript
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

---

## Learn More

- [UploadThing](https://uploadthing.com/)
