import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';

import { LocalMaterialStorage } from './local-material-storage';

/** Real files in a temporary root: mocking fs here would test nothing. */
describe('LocalMaterialStorage', () => {
  let root: string;
  let storage: LocalMaterialStorage;

  const config = (value: string) =>
    ({
      get: (key: string, fallback: unknown) =>
        key === 'MATERIAL_STORAGE_ROOT' ? value : fallback,
    }) as unknown as ConfigService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'material-storage-'));
    storage = new LocalMaterialStorage(config(root));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function read(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  it('stores bytes under the given key and reports their digest', async () => {
    const content = Buffer.from('a project brief');
    const key = LocalMaterialStorage.buildStorageKey(randomUUID(), 1);

    const stored = await storage.put(key, content);

    expect(stored).toEqual({
      storageKey: key,
      byteSize: content.byteLength,
      contentHash: createHash('sha256').update(content).digest('hex'),
    });
    expect(await readFile(join(root, key))).toEqual(content);
    expect(await read(await storage.getStream(key))).toEqual(content);
  });

  it('refuses to overwrite an existing object', async () => {
    // Versions are immutable, so a key collision is a bug rather than an
    // update. Failing loudly beats silently replacing someone's file.
    const key = LocalMaterialStorage.buildStorageKey(randomUUID(), 1);
    await storage.put(key, Buffer.from('first'));

    await expect(storage.put(key, Buffer.from('second'))).rejects.toThrow();
    expect(await readFile(join(root, key), 'utf8')).toBe('first');
  });

  it('generates a distinct key per version, and never from the filename', async () => {
    const materialId = randomUUID();
    const first = LocalMaterialStorage.buildStorageKey(materialId, 1);
    const second = LocalMaterialStorage.buildStorageKey(materialId, 2);
    const alsoFirst = LocalMaterialStorage.buildStorageKey(materialId, 1);

    expect(first).not.toBe(second);
    // Even the same version twice gets a distinct key: a caller retrying an
    // upload must never land on a path that already holds bytes.
    expect(first).not.toBe(alsoFirst);
  });

  it('treats deleting a missing object as done, so purge can be repeated', async () => {
    const key = LocalMaterialStorage.buildStorageKey(randomUUID(), 1);
    await storage.put(key, Buffer.from('content'));

    await storage.delete(key);
    await expect(storage.delete(key)).resolves.toBeUndefined();
    expect(await storage.exists(key)).toBe(false);
  });

  it('reports absence rather than throwing', async () => {
    expect(await storage.exists('does/not/exist')).toBe(false);
  });

  it.each([
    ['../escaped', 'parent traversal'],
    ['nested/../../escaped', 'traversal after a valid segment'],
    ['/etc/passwd', 'absolute path'],
  ])('refuses a key that escapes the storage root (%s)', async (key) => {
    // Keys are generated rather than user-supplied, so this is defence in
    // depth -- but a traversal here would read or delete arbitrary files.
    await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow('escapes');
    await expect(storage.delete(key)).rejects.toThrow('escapes');
    await expect(storage.exists(key)).rejects.toThrow('escapes');
  });
});
