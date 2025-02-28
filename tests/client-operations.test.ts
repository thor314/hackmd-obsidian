import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HackMDClient } from '../src/client';
import { MockObsidianService } from './mocks/obsidian-service.mock';
import { HackMDErrorType } from '../src/types';

describe('HackMDClient Operations', () => {
  // Common configuration
  let mockObsidianService: MockObsidianService;

  // Test fixtures
  const validUserResponse = {
    id: 'user-id',
    name: 'Test User',
    userPath: 'test-path',
  };

  const mockNote = {
    id: 'note-id',
    title: 'Test Note',
    content: '# Test Content',
    createdAt: new Date().toISOString(),
  };

  /**
   * Helper to create an authenticated client instance for testing
   */
  async function createAuthenticatedClient(
    token = 'test-token'
  ): Promise<HackMDClient> {
    mockObsidianService.mockSuccessfulApiResponse(validUserResponse);
    const client = await HackMDClient.getInstance(token, mockObsidianService);
    mockObsidianService.requestUrl.mockReset();
    return client;
  }

  beforeEach(async () => {
    // Create a new mock service instance
    mockObsidianService = new MockObsidianService();

    // Explicitly reset the HackMDClient singleton
    HackMDClient.resetInstance();

    // Reset all mocks
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    vi.resetAllMocks();
  });

  describe('getNote', () => {
    it('should retrieve note details', async () => {
      // GIVEN - a preconfigured client
      const client = await createAuthenticatedClient();
      mockObsidianService.mockSuccessfulApiResponse(mockNote);

      // WHEN - retrieving a note
      const note = await client.getNote('note-id');

      // THEN - the note data should match
      expect(note).toEqual(mockNote);
    });

    it('should throw error when note not found', async () => {
      // GIVEN - a preconfigured client
      const client = await createAuthenticatedClient();

      // Use the helper method
      mockObsidianService.mockFailedApiResponse(404, 'Note not found');

      // WHEN/THEN - operation should fail with proper error details
      await expect(client.getNote('non-existent-note')).rejects.toMatchObject({
        type: HackMDErrorType.NOTE_NOT_FOUND,
        message: expect.stringContaining('no longer exists'),
        statusCode: 404,
        originalError: expect.objectContaining({
          status: 404,
          message: 'Note not found',
        }),
      });
    });

    it('should convert network errors or HTTP status to HackMDError', async () => {
      // GIVEN - a configured client
      const client = await createAuthenticatedClient();

      // Test network error scenario
      mockObsidianService.mockFailedApiResponse(
        undefined as unknown as number,
        'Network error'
      );

      // WHEN/THEN - operation should fail with connectivity error
      await expect(client.getNote('note-id')).rejects.toMatchObject({
        type: HackMDErrorType.CONNECTION_FAILED,
        message: expect.stringContaining('Unable to connect'),
        statusCode: 0,
        originalError: expect.objectContaining({
          message: 'Network error',
        }),
      });
    });

    it('should throw error when note data is missing', async () => {
      // GIVEN - a preconfigured client
      const client = await createAuthenticatedClient();

      // Mock successful response but with EMPTY data
      mockObsidianService.requestUrl.mockResolvedValueOnce({
        status: 200,
        json: null,
        text: 'null',
      });

      // WHEN/THEN - operation should fail with proper error
      await expect(client.getNote('empty-note')).rejects.toMatchObject({
        type: HackMDErrorType.NOTE_NOT_FOUND,
        message: expect.stringContaining('Note empty-note not found'),
      });
    });
  });

  describe('createNote', () => {
    it('should create a note with provided options', async () => {
      // GIVEN - a preconfigured client
      const client = await createAuthenticatedClient();

      // Mock response for creating a note
      const createdNote = {
        ...mockNote,
        id: 'new-note-id',
      };
      mockObsidianService.mockSuccessfulApiResponse(createdNote);

      // WHEN - creating a new note
      const result = await client.createNote({
        title: 'New Note',
        content: '# New Content',
      });

      // THEN - the created note should match the mock
      expect(result).toEqual(createdNote);
    });

    it('should convert network errors or HTTP status to HackMDError', async () => {
      // GIVEN - a preconfigured client
      const client = await createAuthenticatedClient();
      mockObsidianService.mockFailedApiResponse(500, 'Server error');

      // WHEN/THEN - operation should fail with proper error details
      await expect(client.createNote({ title: 'Test' })).rejects.toMatchObject({
        type: HackMDErrorType.SERVER_ERROR,
        message: expect.stringContaining('server encountered an error'),
        statusCode: 500,
        originalError: expect.objectContaining({
          status: 500,
          message: 'Server error',
        }),
      });
    });

    it('should throw error when response data is invalid', async () => {
      // GIVEN - a preconfigured client
      const client = await createAuthenticatedClient();

      // Mock null response
      mockObsidianService.mockSuccessfulApiResponse(null);

      // WHEN/THEN - operation should fail with proper error
      await expect(client.createNote({ title: 'Test' })).rejects.toMatchObject({
        type: HackMDErrorType.UNKNOWN,
        message: expect.stringContaining('Failed to create note'),
      });
    });
  });

  describe('updateNote', () => {
    it('should update an existing note', async () => {
      // GIVEN - a preconfigured client
      const client = await createAuthenticatedClient();

      // Mock response for updating a note
      const updatedNote = {
        ...mockNote,
        title: 'Updated Title',
        content: '# Updated Content',
      };
      mockObsidianService.mockSuccessfulApiResponse(updatedNote);

      // WHEN - updating the note
      const result = await client.updateNote('note-id', {
        title: 'Updated Title',
        content: '# Updated Content',
      });

      // THEN - the updated note should match the mock
      expect(result).toEqual(updatedNote);
    });

    it('should handle 202 status (delayed update)', async () => {
      // GIVEN - a preconfigured client
      const client = await createAuthenticatedClient();

      // Mock a 202 response (accepted but processing) followed by successful get
      mockObsidianService.requestUrl
        .mockResolvedValueOnce({
          status: 202,
          text: '',
        })
        .mockResolvedValueOnce({
          status: 200,
          json: {
            ...mockNote,
            title: 'Delayed Update',
          },
          text: JSON.stringify({
            ...mockNote,
            title: 'Delayed Update',
          }),
        });

      // WHEN - updating the note
      const result = await client.updateNote('note-id', {
        title: 'Delayed Update',
      });

      // THEN - the note should eventually be updated via getNote
      expect(result.title).toBe('Delayed Update');
    });

    it('should throw error when update data is invalid', async () => {
      // GIVEN - a preconfigured client
      const client = await createAuthenticatedClient();

      // Mock null response (not 202)
      mockObsidianService.mockSuccessfulApiResponse(null);

      // WHEN/THEN - operation should fail with proper error
      await expect(
        client.updateNote('note-id', { title: 'Test' })
      ).rejects.toMatchObject({
        type: HackMDErrorType.UNKNOWN,
        message: expect.stringContaining('Failed to update note'),
      });
    });
  });

  describe('deleteNote', () => {
    it('should return true when note is deleted with 204 status', async () => {
      // GIVEN - a preconfigured client
      const client = await createAuthenticatedClient();

      // Mock successful deletion (204 No Content)
      mockObsidianService.requestUrl.mockResolvedValueOnce({
        status: 204,
        text: '',
      });

      // WHEN - deleting a note
      const result = await client.deleteNote('note-id');

      // THEN - the operation should be successful
      expect(result).toBe(true);
    });

    it('should return true when note was already deleted', async () => {
      // GIVEN - a preconfigured client
      const client = await createAuthenticatedClient();

      // Mock 404 response for already deleted note
      mockObsidianService.requestUrl.mockRejectedValueOnce({
        status: 404,
        message: 'Note not found',
      });

      // WHEN - trying to delete a non-existent note
      const result = await client.deleteNote('deleted-note-id');

      // THEN - should still return success
      expect(result).toBe(true);
    });
  });
});
