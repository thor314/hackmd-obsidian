import { describe, it, expect } from 'vitest';
import { getIdFromUrl, getUrlFromId } from '../src/client';

describe('getIdFromUrl', () => {
  it('should extract identifier from standard URL', () => {
    expect(getIdFromUrl('https://hackmd.io/abcd1234')).toBe('abcd1234');
  });

  it('should extract identifier from URL with user path', () => {
    expect(getIdFromUrl('https://hackmd.io/@user/abcd1234')).toBe('abcd1234');
  });

  it('should extract identifier from URL with team subdomain', () => {
    expect(getIdFromUrl('https://team.hackmd.io/abcd1234')).toBe('abcd1234');
  });

  it('should extract identifier from URL with query parameters', () => {
    expect(getIdFromUrl('https://hackmd.io/abcd1234?view=edit')).toBe(
      'abcd1234'
    );
  });

  it('should return undefined for non-HackMD URLs', () => {
    expect(getIdFromUrl('https://example.com/some-page')).toBeUndefined();
  });

  it('should handle empty string input', () => {
    expect(getIdFromUrl('')).toBeUndefined();
  });

  it('should handle undefined input', () => {
    expect(getIdFromUrl(undefined as any)).toBeUndefined();
  });

  it('should handle null input', () => {
    expect(getIdFromUrl(null as any)).toBeUndefined();
  });
});

describe('getUrlFromId', () => {
  it('should generate URL from alphanumeric ID', () => {
    expect(getUrlFromId('abcd1234')).toBe('https://hackmd.io/abcd1234');
  });
});
