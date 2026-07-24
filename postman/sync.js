const fs = require('fs');
const https = require('https');

const apiKey = 'PMAK-69e4cb756f0bc80001eb26dc-6df7f4ada17288e92e06e3aabbdd4acb2c';
const collectionId = '49916304-ce4a4ce2-a944-4d26-93ca-c2cbd75fd14f';
const environmentId = '49916304-3364e9e1-739b-4f1e-a5d6-aac3d8ede7a3';

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
                resolve();
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
