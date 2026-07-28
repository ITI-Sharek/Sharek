const fs = require('fs');
const https = require('https');
const path = require('path');

const credentialsPath = path.resolve(__dirname, '..', 'API-Key.txt');
const credentials = fs.readFileSync(credentialsPath, 'utf8');
const apiKey =
    process.env.POSTMAN_API_KEY || credentials.match(/PMAK-[A-Za-z0-9-]+/)?.[0];
const collectionId =
    process.env.POSTMAN_COLLECTION_ID ||
    credentials.match(/api\.postman\.com\/collections\/([A-Za-z0-9-]+)/i)?.[1];
const environmentId =
    process.env.POSTMAN_ENVIRONMENT_ID ||
    '49916304-3364e9e1-739b-4f1e-a5d6-aac3d8ede7a3';

if (!apiKey || !collectionId) {
    throw new Error(
        'API-Key.txt must contain a Postman API key and collection URL',
    );
}

const updatePostman = (type, id, filePath) => {
    return new Promise((resolve, reject) => {
        const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const payload = JSON.stringify({ [type]: fileData });

        const options = {
            hostname: 'api.postman.com',
            path: `/${type}s/${id}`,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey,
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log(`Updated ${type}:`, res.statusCode, data);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve();
                    return;
                }
                reject(new Error(`Postman ${type} update failed (${res.statusCode})`));
            });
        });

        req.on('error', (e) => {
            console.error(`Error updating ${type}:`, e);
            reject(e);
        });

        req.write(payload);
        req.end();
    });
};

async function main() {
    try {
        await updatePostman('collection', collectionId, './sharek-backend.postman_collection.json');
        await updatePostman('environment', environmentId, './sharek-backend.postman_environment.json');
        console.log('Sync complete');
    } catch (e) {
        console.error(e);
    }
}

main();
