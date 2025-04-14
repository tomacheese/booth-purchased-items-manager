import fs, { Dirent } from 'node:fs';
import { PageCache } from './pagecache';

jest.mock('node:fs');

// Mock Environment.getPath
jest.mock('./environment', () => ({
  Environment: {
    getPath: jest.fn((key: string, filename: string) => `${key}/${filename}`),
  },
}));

describe('PageCache', () => {
  let pageCache: PageCache;

  beforeEach(() => {
    pageCache = new PageCache();
    jest.clearAllMocks();
  });

  describe('save', () => {
    it('should save data and update metrics', () => {
      const writeFileSyncMock = jest.spyOn(fs, 'writeFileSync');
      const makeDirMock = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      pageCache.save('testType', 'testId', 'testData');

      expect(makeDirMock).toHaveBeenCalledWith('CACHE_DIR/testType', { recursive: true });
      expect(writeFileSyncMock).toHaveBeenCalledWith('CACHE_DIR/testType/testId.html', 'testData');
      expect(writeFileSyncMock).toHaveBeenCalledWith('CACHE_DIR/testType/testId.html.savedAt', expect.any(String), 'utf8');
      expect(pageCache.getMetrics().saved).toBe(1);
    });

    it('should not save if data is null or undefined', () => {
      const writeFileSyncMock = jest.spyOn(fs, 'writeFileSync');

      pageCache.save('testType', 'testId', null);

      expect(writeFileSyncMock).not.toHaveBeenCalled();
    });

    it('should handle saving large data correctly', () => {
      const largeData = 'x'.repeat(10 * 1024 * 1024); // 10MB data
      const writeFileSyncMock = jest.spyOn(fs, 'writeFileSync');

      pageCache.save('testType', 'largeTestId', largeData);

      expect(writeFileSyncMock).toHaveBeenCalledWith(
        'CACHE_DIR/testType/largeTestId.html',
        largeData
      );
    });
  });

  describe('checkItemExistence', () => {
    it('should return 0 if file does not exist', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = pageCache.checkItemExistence('testType', 'testId', null);

      expect(result).toBe(0);
    });

    it('should return -1 if file is expired', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString());

      const result = pageCache.checkItemExistence('testType', 'testId', 1);

      expect(result).toBe(-1);
    });

    it('should return 1 if file exists and is not expired', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(new Date().toISOString());

      const result = pageCache.checkItemExistence('testType', 'testId', 1);

      expect(result).toBe(1);
    });
  });

  describe('load', () => {
    it('should return null and increment miss if file does not exist', () => {
      jest.spyOn(pageCache, 'checkItemExistence').mockReturnValue(0);

      const result = pageCache.load('testType', 'testId', null);

      expect(result).toBeNull();
      expect(pageCache.getMetrics().miss).toBe(1);
    });

    it('should delete expired file and increment expired', () => {
      jest.spyOn(pageCache, 'checkItemExistence').mockReturnValue(-1);
      const unlinkSyncMock = jest.spyOn(fs, 'unlinkSync');

      const result = pageCache.load('testType', 'testId', null);

      expect(result).toBeNull();
      expect(unlinkSyncMock).toHaveBeenCalledWith('CACHE_DIR/testType/testId.html');
      expect(unlinkSyncMock).toHaveBeenCalledWith('CACHE_DIR/testType/testId.html.savedAt');
      expect(pageCache.getMetrics().expired).toBe(1);
    });

    it('should return file content and increment hit if file exists and is valid', () => {
      jest.spyOn(pageCache, 'checkItemExistence').mockReturnValue(1);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('fileContent'));

      const result = pageCache.load('testType', 'testId', null);

      expect(result?.toString()).toBe('fileContent');
      expect(pageCache.getMetrics().hit).toBe(1);
    });

    it('should handle corrupted savedAt file gracefully', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockImplementation((path: fs.PathOrFileDescriptor) => {
        if (typeof path === 'string' && path.endsWith('.savedAt')) {
          return Buffer.from('invalid-date');
        }
        return Buffer.from('fileContent');
      });

      jest.spyOn(pageCache, 'checkItemExistence').mockReturnValue(-1);

      const result = pageCache.load('testType', 'corruptedSavedAt', 1);

      expect(result).toBeNull();
      expect(pageCache.getMetrics().expired).toBe(1);
    });
  });

  describe('loadOrFetch', () => {
    it('should return cached data if available', async () => {
      jest.spyOn(pageCache, 'load').mockReturnValue(Buffer.from('cachedData'));

      const result = await pageCache.loadOrFetch('testType', 'testId', null, jest.fn());

      expect((result as Buffer).toString()).toBe('cachedData');
    });

    it('should fetch, save, and return new data if not cached', async () => {
      jest.spyOn(pageCache, 'load').mockReturnValue(null);
      const saveMock = jest.spyOn(pageCache, 'save');
      const fetchFunc = jest.fn().mockResolvedValue(Buffer.from('fetchedData'));

      const result = await pageCache.loadOrFetch('testType', 'testId', null, fetchFunc);

      expect((result as Buffer).toString()).toBe('fetchedData');
      expect(saveMock).toHaveBeenCalledWith('testType', 'testId', Buffer.from('fetchedData'));
    });
  });

  describe('list', () => {
    it('should return an empty array if directory does not exist', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = pageCache.list('testType');

      expect(result).toEqual([]);
    });

    it('should return a list of cached items', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        { name: 'item1.html', isFile: () => true } as Dirent,
        { name: 'item2.html', isFile: () => true } as Dirent,
      ]);

      const result = pageCache.list('testType');

      expect(result).toEqual(['item1', 'item2']);
    });

    it('should handle directories with mixed file types', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        { name: 'item1.html', isFile: () => true } as Dirent,
        { name: 'item2.txt', isFile: () => true } as Dirent,
        { name: 'subdir', isFile: () => false } as Dirent,
      ]);

      const result = pageCache.list('testType');

      expect(result).toEqual(['item1']);
    });
  });

  describe('getMetrics', () => {
    it('should return the current metrics', () => {
      const metrics = pageCache.getMetrics();

      expect(metrics).toEqual({ hit: 0, miss: 0, expired: 0, saved: 0 });
    });
  });
});