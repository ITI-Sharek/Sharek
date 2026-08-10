import fs from 'node:fs';
import path from 'node:path';

import { extractControllerRoutes } from './lib/http-route-inventory.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const outputPath = path.join(
  repositoryRoot,
  'postman/controller-route-inventory.json',
);
const routes = extractControllerRoutes(repositoryRoot);

fs.writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      generatedFrom: 'src/**/*.ts files containing @Controller',
      routeCount: routes.length,
      routes,
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote ${routes.length} controller routes to ${outputPath}.`);
