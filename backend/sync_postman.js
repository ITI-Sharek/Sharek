const fs = require('fs');
const https = require('https');

const collectionPath = '/home/abdullah/sha-rek/Backend/postman/sharek-backend.postman_collection.json';
const collectionData = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));

// Check if Google already exists
let googleGroup = collectionData.item.find(i => i.name === 'Google');
if (!googleGroup) {
  googleGroup = {
    name: 'Google',
    item: [
      {
        name: 'Start Google OAuth',
        request: {
          method: 'GET',
          header: [],
          url: {
            raw: '{{baseUrl}}/auth/google/start?role=contributor',
            host: ['{{baseUrl}}'],
            path: ['auth', 'google', 'start'],
            query: [
              { key: 'role', value: 'contributor' }
            ]
          }
        }
      },
      {
        name: 'Google OAuth Callback Redirect',
        request: {
          method: 'GET',
          header: [],
          url: {
            raw: '{{baseUrl}}/auth/google/callback?code={{googleCode}}&state={{googleState}}',
            host: ['{{baseUrl}}'],
            path: ['auth', 'google', 'callback'],
            query: [
              { key: 'code', value: '{{googleCode}}' },
              { key: 'state', value: '{{googleState}}' }
            ]
          }
        }
      },
      {
        name: 'Google OAuth Callback from Frontend',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: {
            mode: 'raw',
            raw: '{\n  "code": "{{googleCode}}",\n  "state": "{{googleState}}"\n}'
          },
          url: {
            raw: '{{baseUrl}}/auth/google/callback',
            host: ['{{baseUrl}}'],
            path: ['auth', 'google', 'callback']
          }
        }
      }
    ]
  };

  // Add Google variables if they don't exist
  const vars = collectionData.variable;
  if (!vars.find(v => v.key === 'googleCode')) {
    vars.push({ key: 'googleCode', value: 'replace-with-google-code' });
    vars.push({ key: 'googleState', value: 'replace-with-oauth-state' });
  }

  collectionData.item.push(googleGroup);
  fs.writeFileSync(collectionPath, JSON.stringify(collectionData, null, 4));
}

// Read API Key
const apiKeyFile = '/home/abdullah/sha-rek/Backend/API-Key.txt';
const apiKeyContent = fs.readFileSync(apiKeyFile, 'utf8');
const apiKeyMatch = apiKeyContent.match(/PMAK-[a-zA-Z0-9\-]+/);
const collectionIdMatch = apiKeyContent.match(/collections\/([a-zA-Z0-9\-]+)/);

if (!apiKeyMatch || !collectionIdMatch) {
  console.error("Could not find API key or collection ID");
  process.exit(1);
}

const apiKey = apiKeyMatch[0];
const collectionId = collectionIdMatch[1];

// Upload to Postman
const payload = JSON.stringify({ collection: collectionData });

const options = {
  hostname: 'api.postman.com',
  path: `/collections/${collectionId}`,
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey,
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log("Successfully updated Postman collection!");
    } else {
      console.error(`Error updating collection: ${res.statusCode}`);
      console.error(data);
    }
  });
});

req.on('error', e => {
  console.error(`Request error: ${e.message}`);
});

req.write(payload);
req.end();
