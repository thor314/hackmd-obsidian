import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HackMDClient } from '../src/client';
import { MockObsidianService } from './mocks/obsidian-service.mock';
import { HackMDErrorType } from '../src/types';

describe('HackMDClient Error Handling', () => {
  // Avant chaque test, nous allons réinitialiser l'instance singleton pour éviter la contamination entre tests
  beforeEach(() => {
    // Force reset of client instance to avoid test pollution
    // @ts-ignore - Access static method even if private
    HackMDClient.resetInstance();
    vi.resetAllMocks();
  });

  describe('HTTP error status handling', () => {
    // Success response mock for authentication
    const successGetMeResponse = {
      status: 200,
      json: {
        id: 'user-id',
        name: 'Test User',
        userPath: 'test-path',
      },
      text: JSON.stringify({
        id: 'user-id',
        name: 'Test User',
        userPath: 'test-path',
      }),
    };

    // Test cases for HTTP error handling
    it.each([
      {
        status: 401,
        message: 'Unauthorized',
        expectedType: HackMDErrorType.AUTH_INVALID,
      },
      {
        status: 403,
        message: 'Forbidden',
        expectedType: HackMDErrorType.PERMISSION_DENIED,
      },
      {
        status: 404,
        message: 'Not Found',
        expectedType: HackMDErrorType.NOTE_NOT_FOUND,
      },
      {
        status: 429,
        message: 'Too Many Requests',
        expectedType: HackMDErrorType.RATE_LIMITED,
      },
      {
        status: 500,
        message: 'Internal Server Error',
        expectedType: HackMDErrorType.SERVER_ERROR,
      },
      {
        status: undefined,
        message: 'Network failure',
        expectedType: HackMDErrorType.CONNECTION_FAILED,
        expectedStatusCode: 0,
      },
      {
        status: 418,
        message: "I'm a teapot",
        expectedType: HackMDErrorType.UNKNOWN,
      },
    ])(
      'should handle $status $message as $expectedType',
      async ({ status, message, expectedType, expectedStatusCode }) => {
        // Create a fresh mock for this test
        const mockObsidianService = new MockObsidianService();

        // Configure mock to return success and then error
        mockObsidianService.requestUrl
          .mockResolvedValueOnce(successGetMeResponse)
          .mockRejectedValueOnce({
            status,
            message,
          });

        // Create client & test
        const client = await HackMDClient.getInstance(
          'test-token',
          mockObsidianService
        );

        await expect(
          client.request('GET', '/api/endpoint')
        ).rejects.toMatchObject({
          type: expectedType,
          statusCode:
            expectedStatusCode !== undefined ? expectedStatusCode : status,
        });
      }
    );
  });
});
