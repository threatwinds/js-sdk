# CLAUDE.md - JavaScript/TypeScript SDK

This file provides guidance to Claude Code (claude.ai/code) when working with the ThreatWinds JavaScript/TypeScript SDK.

## SDK Overview

The ThreatWinds JavaScript/TypeScript SDK is a client library for interacting with the ThreatWinds threat intelligence API from JavaScript/TypeScript applications (Node.js, browsers, React, Vue, Angular, etc.).

**Language**: JavaScript/TypeScript

**Package**: `@threatwinds/sdk` (planned)

**Status**: NOT YET IMPLEMENTED - Placeholder repository only

## Current Status

**THIS SDK IS PENDING DEVELOPMENT**

The repository currently contains only:
- LICENSE file
- Minimal README.md with title only

**No implementation exists yet.**

## Planned Features

When implemented, this SDK should provide:

### Core Functionality
- **Authentication**: Session creation, verification, API key management
- **Search**: Simple and advanced threat intelligence search
- **Analytics**: Entity details, relationships, and graph queries
- **Feeds**: Threat feed subscription and management
- **Ingest**: Submit new threat intelligence data
- **Error Handling**: Comprehensive exception hierarchy

### Platform Support
- **Node.js**: Server-side applications (v16+)
- **Browsers**: Modern browsers (ES2020+)
- **React**: React hooks and components
- **Vue**: Vue 3 composables
- **Angular**: Angular services
- **TypeScript**: Full type definitions

## Planned Installation

```bash
# NPM
npm install @threatwinds/sdk

# Yarn
yarn add @threatwinds/sdk

# PNPM
pnpm add @threatwinds/sdk
```

## Planned Architecture

The SDK should follow modern JavaScript/TypeScript patterns:

```
src/
├── core/
│   ├── client.ts              # Base HTTP client
│   ├── config.ts              # Configuration management
│   ├── exceptions.ts          # Error classes
│   └── types.ts               # Shared TypeScript types
├── auth/
│   ├── auth-client.ts         # Authentication operations
│   └── auth-types.ts          # Auth-specific types
├── search/
│   ├── search-client.ts       # Search operations
│   └── search-types.ts        # Search-specific types
├── analytics/
│   ├── analytics-client.ts    # Analytics operations
│   └── analytics-types.ts     # Analytics-specific types
├── feeds/
│   ├── feeds-client.ts        # Feed operations
│   └── feeds-types.ts         # Feed-specific types
├── ingest/
│   ├── ingest-client.ts       # Ingest operations
│   └── ingest-types.ts        # Ingest-specific types
├── frameworks/
│   ├── react/                 # React hooks
│   ├── vue/                   # Vue composables
│   └── angular/               # Angular services
└── index.ts                   # Main exports
```

## Planned Authentication

### Session-based (for web applications)
```typescript
import { ThreatWindsClient, AuthClient } from '@threatwinds/sdk';

// Create client
const config = {
  baseUrl: 'https://intelligence.threatwinds.com/api',
};

const client = new ThreatWindsClient(config);
const authClient = new AuthClient(client);

// Create session
const session = await authClient.createSession('user@example.com');
console.log('Verification code ID:', session.verificationCodeId);

// Verify with code from email
const verified = await authClient.verifySession({
  verificationCodeId: session.verificationCodeId,
  code: '123456',
});

// Update client with bearer token
client.setBearerToken(session.bearer);
```

### API Key Authentication (for backend services)
```typescript
import { ThreatWindsClient } from '@threatwinds/sdk';

const client = new ThreatWindsClient({
  baseUrl: 'https://intelligence.threatwinds.com/api',
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
});
```

## Planned Usage Examples

### TypeScript with Full Types

```typescript
import {
  ThreatWindsClient,
  SearchClient,
  SearchResponse,
  Entity
} from '@threatwinds/sdk';

const client = new ThreatWindsClient({
  baseUrl: 'https://intelligence.threatwinds.com/api',
  apiKey: process.env.TW_API_KEY,
  apiSecret: process.env.TW_API_SECRET,
});

const searchClient = new SearchClient(client);

// Simple search with type safety
const response: SearchResponse = await searchClient.simpleSearch({
  query: '8.8.8.8',
  accuracy: 1,
  reputation: -2,
  includes: ['id', 'type', 'attributes.value', 'reputation'],
  limit: 10,
  page: 1,
});

console.log(`Found ${response.total} entities`);
response.entities.forEach((entity: Entity) => {
  console.log(`${entity.type}: ${entity.id}`);
});
```

### React Hooks (Planned)

```typescript
import { useThreatWinds, useSearch } from '@threatwinds/sdk/react';

function ThreatSearch() {
  const { isAuthenticated } = useThreatWinds();
  const { search, loading, error, results } = useSearch();

  const handleSearch = async (query: string) => {
    await search({ query, limit: 10 });
  };

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div>
      <SearchInput onSearch={handleSearch} />
      {loading && <Spinner />}
      {error && <ErrorMessage error={error} />}
      {results && <ResultsList entities={results.entities} />}
    </div>
  );
}
```

### Vue 3 Composables (Planned)

```typescript
import { useThreatWinds } from '@threatwinds/sdk/vue';

export default {
  setup() {
    const { search, loading, error, results } = useThreatWinds();

    const handleSearch = async (query: string) => {
      await search({ query, limit: 10 });
    };

    return {
      handleSearch,
      loading,
      error,
      results,
    };
  },
};
```

### Node.js Backend (Planned)

```typescript
import { ThreatWindsClient, SearchClient, IngestClient } from '@threatwinds/sdk';

// Initialize client
const client = new ThreatWindsClient({
  baseUrl: process.env.TW_API_URL,
  apiKey: process.env.TW_API_KEY,
  apiSecret: process.env.TW_API_SECRET,
});

const searchClient = new SearchClient(client);
const ingestClient = new IngestClient(client);

// Search for threats
const threats = await searchClient.simpleSearch({
  query: maliciousIp,
  reputation: -2,
});

// Submit new threat
if (threats.total === 0) {
  await ingestClient.submitEntity({
    type: 'ip',
    attributes: {
      ip: maliciousIp,
      text: 'Detected in firewall logs',
    },
    reputation: -1,
    tags: ['firewall', 'blocked'],
  });
}
```

## Planned Error Handling

```typescript
import {
  ThreatWindsException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  RateLimitExceededException
} from '@threatwinds/sdk';

try {
  const result = await searchClient.simpleSearch({ query: '8.8.8.8' });
  console.log(result);
} catch (error) {
  if (error instanceof UnauthorizedException) {
    console.error('Authentication failed:', error.message);
    // Redirect to login
  } else if (error instanceof BadRequestException) {
    console.error('Invalid request:', error.message, error.details);
  } else if (error instanceof NotFoundException) {
    console.error('Entity not found:', error.message);
  } else if (error instanceof RateLimitExceededException) {
    console.error('Rate limit exceeded, retry after:', error.retryAfter);
  } else if (error instanceof ThreatWindsException) {
    console.error('API error:', error.statusCode, error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Planned Development Setup

```bash
# Clone repository
git clone https://github.com/threatwinds/js-sdk.git
cd js-sdk

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Type check
npm run type-check

# Format code
npm run format

# Generate documentation
npm run docs
```

## Planned Project Structure

```
js-sdk/
├── src/                       # Source code
│   ├── core/                 # Core functionality
│   ├── auth/                 # Authentication
│   ├── search/               # Search
│   ├── analytics/            # Analytics
│   ├── feeds/                # Feeds
│   ├── ingest/               # Ingest
│   ├── frameworks/           # Framework integrations
│   └── index.ts             # Main exports
├── tests/                     # Test files
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── e2e/                  # End-to-end tests
├── examples/                  # Usage examples
│   ├── node/                 # Node.js examples
│   ├── react/                # React examples
│   ├── vue/                  # Vue examples
│   └── angular/              # Angular examples
├── docs/                      # Documentation
├── package.json              # Package configuration
├── tsconfig.json             # TypeScript configuration
├── jest.config.js            # Jest configuration
├── .eslintrc.js              # ESLint configuration
├── .prettierrc               # Prettier configuration
└── README.md                 # Documentation
```

## Planned Package Configuration

```json
{
  "name": "@threatwinds/sdk",
  "version": "0.1.0",
  "description": "JavaScript/TypeScript SDK for ThreatWinds API",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./react": {
      "import": "./dist/react/index.mjs",
      "require": "./dist/react/index.js",
      "types": "./dist/react/index.d.ts"
    },
    "./vue": {
      "import": "./dist/vue/index.mjs",
      "require": "./dist/vue/index.js",
      "types": "./dist/vue/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "lint": "eslint src --ext .ts",
    "type-check": "tsc --noEmit",
    "format": "prettier --write \"src/**/*.ts\"",
    "docs": "typedoc"
  },
  "dependencies": {
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/node": "^20.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.0.0",
    "jest": "^29.0.0",
    "prettier": "^3.0.0",
    "ts-jest": "^29.0.0",
    "tsup": "^8.0.0",
    "typedoc": "^0.25.0",
    "typescript": "^5.0.0"
  },
  "engines": {
    "node": ">=16.0.0"
  },
  "keywords": [
    "threatwinds",
    "threat-intelligence",
    "security",
    "cybersecurity",
    "sdk",
    "api-client"
  ]
}
```

## Reference Implementation

The Dart/Flutter SDK serves as the reference implementation:
- **Location**: `/Users/osmany/Projects/github.com/threatwinds/dart-sdk`
- **Documentation**: `/Users/osmany/Projects/github.com/threatwinds/dart-sdk/CLAUDE.md`
- **Architecture**: Module-based with client classes per API domain
- **Features**: Full API coverage including auth, search, analytics, feeds, ingest

## Implementation Priorities

When starting development, prioritize in this order:

1. **Core Infrastructure** (Week 1-2):
   - Base HTTP client with error handling
   - Configuration management
   - Exception hierarchy
   - TypeScript type definitions

2. **Authentication** (Week 2):
   - Session creation and verification
   - API key authentication
   - Token management

3. **Essential APIs** (Week 3-4):
   - Search client (simple and advanced)
   - Analytics client (entity details, relations)
   - Ingest client (submit entities)

4. **Additional Features** (Week 5-6):
   - Feeds client
   - Pagination helpers
   - Rate limiting
   - Retry logic

5. **Framework Integrations** (Week 7-8):
   - React hooks
   - Vue composables
   - Documentation and examples

## Technology Stack Recommendations

- **Build Tool**: tsup (fast TypeScript bundler)
- **Testing**: Jest with ts-jest
- **HTTP Client**: axios (widely used, good browser support)
- **Linting**: ESLint with TypeScript plugin
- **Formatting**: Prettier
- **Documentation**: TypeDoc
- **CI/CD**: GitHub Actions
- **Package Registry**: npm/yarn registry

## Future Work

To implement this SDK:

1. **Initialize Project**:
   ```bash
   npm init -y
   npm install -D typescript tsup jest @types/jest ts-jest
   npm install axios
   npx tsc --init
   ```

2. **Copy Architecture** from dart-sdk:
   - Core client pattern
   - Module separation (auth, search, analytics, feeds, ingest)
   - Error handling approach
   - Request/response models

3. **Implement Core Features**:
   - HTTP client with interceptors
   - Authentication flows
   - All API endpoints
   - Type-safe models

4. **Add Framework Support**:
   - React hooks using React Context
   - Vue 3 composables using Composition API
   - Angular services using Dependency Injection

5. **Documentation & Testing**:
   - Comprehensive JSDoc/TSDoc comments
   - Unit tests for all modules
   - Integration tests with real API
   - Usage examples for each framework

6. **Publish to npm**:
   - Configure package.json exports
   - Generate declaration files
   - Create README and CHANGELOG
   - Publish to npm registry

## Related Files

- Main README: `/Users/osmany/Projects/github.com/threatwinds/js-sdk/README.md`
- Root CLAUDE.md: `/Users/osmany/Projects/github.com/threatwinds/CLAUDE.md`
- Reference SDK: `/Users/osmany/Projects/github.com/threatwinds/dart-sdk/CLAUDE.md`
- API Documentation: `/Users/osmany/Projects/github.com/threatwinds/api-docs`

## License

This project will be under a private license.
