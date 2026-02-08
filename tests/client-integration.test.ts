import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HackMDClient } from '../src/client';
import { MockObsidianService } from './mocks/obsidian-service.mock';
import { HackMDNote } from '../src/types';

/**
 * Style: Integration tests with fixtures
 * Technique: toMatchSnapshot to validate complex structures
 */
describe('HackMDClient Integration', () => {
  // Fixture - reusable test data
  const fixtures = {
    user: {
      id: 'test-user-id',
      name: 'Test User',
      userPath: 'test-user',
    },
    notes: [
      {
        id: 'note-1',
        title: 'First Test Note',
        content: '# First Note\nThis is a test note.',
        createdAt: '2023-01-01T00:00:00Z',
      },
      {
        id: 'note-2',
        title: 'Second Test Note',
        content: '# Second Note\nThis is another test note.',
        createdAt: '2023-01-02T00:00:00Z',
        lastChangedAt: '2023-01-03T00:00:00Z',
        teamPath: 'team/path',
      },
    ] as HackMDNote[],
  };

  let mockObsidianService: MockObsidianService;
  let client: HackMDClient;

  beforeEach(async () => {
    // Constant date for snapshots
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-01-15T12:00:00Z'));

    mockObsidianService = new MockObsidianService();

    // Configure getMe
    mockObsidianService.mockSuccessfulApiResponse(fixtures.user);

    client = await HackMDClient.getInstance('test-token', mockObsidianService);
    mockObsidianService.requestUrl.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle a complete workflow of creating and updating notes', async () => {
    // GIVEN - configuration for different API operations

    // Config for createNote
    mockObsidianService.mockSuccessfulApiResponse(fixtures.notes[0]);

    // WHEN - creating a note
    const newNote = await client.createNote({
      title: 'New Test Note',
      content: '# New Note Content',
    });

    // THEN - the note is created correctly
    expect(newNote).toEqual(fixtures.notes[0]);

    // AND - verify the create behavior: API was called once
    expect(mockObsidianService.requestUrl).toHaveBeenCalledTimes(1);

    // AND - verify the content was included in the request
    expect(mockObsidianService.requestUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('New Note Content'),
      })
    );

    // Reset the mock for the next operation
    mockObsidianService.requestUrl.mockReset();

    // Config for updateNote
    mockObsidianService.mockSuccessfulApiResponse(fixtures.notes[1]);

    // WHEN - updating the note
    const updatedNote = await client.updateNote(newNote.id, {
      content: '# Updated Content',
    });

    // THEN - result matches the fixture
    expect(updatedNote).toEqual(fixtures.notes[1]);

    // AND - verify the update behavior: API was called once
    expect(mockObsidianService.requestUrl).toHaveBeenCalledTimes(1);

    // AND - verify the updated content was included in the request
    expect(mockObsidianService.requestUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Updated Content'),
      })
    );
  });
});
