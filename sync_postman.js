const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const repositoryRoot = __dirname;
const uploadRequested = process.argv.includes('--upload');

async function main() {
  await import('./scripts/validate-postman-coverage.mjs');

  if (!uploadRequested) {
    console.log(
      'Local Postman validation complete. Nothing was uploaded; pass --upload explicitly to enable remote updates.',
    );
    return;
  }

  const apiKey = process.env.POSTMAN_API_KEY;
  const collectionId = process.env.POSTMAN_COLLECTION_ID;
  const environmentId = process.env.POSTMAN_ENVIRONMENT_ID;
  if (!apiKey || !collectionId) {
    throw new Error(
      'POSTMAN_API_KEY and POSTMAN_COLLECTION_ID are required for explicit upload.',
    );
  }

  await upload(
    'collection',
    collectionId,
    path.join(repositoryRoot, 'postman/sharek-backend.postman_collection.json'),
    apiKey,
  );
  if (environmentId) {
    await upload(
      'environment',
      environmentId,
      path.join(repositoryRoot, 'postman/sharek-backend.postman_environment.json'),
      apiKey,
    );
  }
}

function upload(type, id, filePath, apiKey) {
  const payload = JSON.stringify({
    [type]: JSON.parse(fs.readFileSync(filePath, 'utf8')),
  });
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: 'api.postman.com',
        path: `/${type}s/${encodeURIComponent(id)}`,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            console.log(`Uploaded Postman ${type} ${id}.`);
            resolve();
            return;
          }
          reject(
            new Error(
              `Postman ${type} upload failed (${response.statusCode}): ${body}`,
            ),
          );
        });
      },
    );
    request.on('error', reject);
    request.end(payload);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
