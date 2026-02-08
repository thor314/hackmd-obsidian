import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { HackMDClient } from '../src/client'
import { MockObsidianService } from './mocks/obsidian-service.mock'
import { HackMDErrorType } from '../src/types'

describe('HackMDClient Core', () => {
  // Common configuration
  let mockObsidianService: MockObsidianService

  // Test fixtures
  const validUserResponse = {
    id: 'user-id',
    name: 'Test User',
    userPath: 'test-path',
  }

  /**
   * Helper to create an authenticated client instance for testing
   */
  async function createAuthenticatedClient(
    token = 'test-token',
  ): Promise<HackMDClient> {
    mockObsidianService.mockSuccessfulApiResponse(validUserResponse)
    const client = await HackMDClient.getInstance(token, mockObsidianService)
    mockObsidianService.requestUrl.mockReset()
    return client
  }

  beforeEach(async () => {
    // Create a new mock service instance
    mockObsidianService = new MockObsidianService()

    // Explicitly reset the HackMDClient singleton
    HackMDClient.resetInstance()

    // Reset all mocks
    vi.resetAllMocks()
  })

  afterEach(() => {
    // Clean up after each test
    vi.resetAllMocks()
  })

  describe('getInstance', () => {
    it('should throw error when no access token is provided', async () => {
      await expect(
        HackMDClient.getInstance('', mockObsidianService),
      ).rejects.toMatchObject({
        type: HackMDErrorType.AUTH_REQUIRED,
        message: expect.stringContaining('access token is required'),
      })
    })

    it('should create a new instance with valid token', async () => {
      // GIVEN - a configuration to simulate a successful response
      mockObsidianService.mockSuccessfulApiResponse(validUserResponse)

      // WHEN - instantiating the client
      const client = await HackMDClient.getInstance(
        'test-token',
        mockObsidianService,
      )

      // THEN - a valid client instance is created
      expect(client).toBeInstanceOf(HackMDClient)

      // Verify behavior: client can be used to perform operations
      mockObsidianService.requestUrl.mockReset()
      mockObsidianService.mockSuccessfulApiResponse({ id: 'test-id' })
      await expect(client.getNote('test-id')).resolves.not.toThrow()
    })

    it('should reuse existing instance with same token', async () => {
      // GIVEN - an existing instance
      const instance1 = await createAuthenticatedClient('same-token')

      // WHEN - requesting a new instance with the same token
      const instance2 = await HackMDClient.getInstance(
        'same-token',
        mockObsidianService,
      )

      // THEN - the same instance is returned and API not called again
      expect(instance1).toBe(instance2)
      expect(mockObsidianService.requestUrl).not.toHaveBeenCalled()
    })

    it('should create a new instance when using a different valid token', async () => {
      // GIVEN - an existing instance with first token
      const instance1 = await createAuthenticatedClient('first-token')

      // AND - prepare successful response for the second request
      mockObsidianService.mockSuccessfulApiResponse(validUserResponse)

      // WHEN - requesting a new instance with a different token
      const instance2 = await HackMDClient.getInstance(
        'second-token',
        mockObsidianService,
      )

      // THEN - a new instance is created
      expect(instance2).toBeInstanceOf(HackMDClient)
      expect(instance1).not.toBe(instance2)
    })

    it('should throw auth error when API rejects', async () => {
      // GIVEN - a configuration to simulate an authentication error
      mockObsidianService.mockFailedApiResponse(401, 'Invalid token')

      // WHEN/THEN - creation should fail with the appropriate error details
      await expect(
        HackMDClient.getInstance('bad-token', mockObsidianService),
      ).rejects.toMatchObject({
        type: HackMDErrorType.AUTH_INVALID,
        message: expect.stringContaining('token appears to be invalid'),
        statusCode: 401,
        originalError: expect.objectContaining({
          status: 401,
          message: 'Invalid token',
        }),
      })

      // Verify reset behavior by trying to create another instance
      const newInstance = await createAuthenticatedClient('new-token')
      expect(newInstance).toBeInstanceOf(HackMDClient)
    })
  })

  describe('getMe', () => {
    it('should return user object from API response', async () => {
      // GIVEN - a preconfigured client
      const client = await createAuthenticatedClient()
      mockObsidianService.mockSuccessfulApiResponse(validUserResponse)

      // WHEN - getting user information
      const user = await client.getMe()

      // THEN - the user data should match expected response
      expect(user).toEqual(validUserResponse)
    })

    it('should throw error when user response is invalid', async () => {
      // GIVEN - a preconfigured client
      const client = await createAuthenticatedClient()

      // Mock invalid response (missing required fields)
      mockObsidianService.mockSuccessfulApiResponse({ incorrect: 'data' })

      // WHEN/THEN - operation should fail with proper error
      await expect(client.getMe()).rejects.toMatchObject({
        type: HackMDErrorType.AUTH_INVALID,
        message: expect.stringContaining('Failed to get user information'),
      })
    })
  })

  describe('request', () => {
    it('should transform 202 Accepted responses into standardized response objects', async () => {
      // GIVEN - a preconfigured client
      const client = await createAuthenticatedClient()

      // Mock 202 Accepted response with empty text
      mockObsidianService.requestUrl.mockResolvedValueOnce({
        status: 202,
        text: '',
      })

      // WHEN - making request that returns 202
      const response = await client.request('POST', '/test-accepted')

      // THEN - should provide correct response structure
      expect(response).toEqual({
        status: 202,
        data: null,
        ok: true,
      })

      // Explicitly forcing coverage for line 89 by ensuring we test the exact path
      mockObsidianService.requestUrl.mockResolvedValueOnce({
        status: 202,
        text: 'some-text',
      })

      // Test the exact condition
      const response2 = await client.request('POST', '/test-accepted-with-body')

      // Should still return the standard 202 response object
      expect(response2.status).toBe(202)
      expect(response2.data).toBeNull()
      expect(response2.ok).toBe(true)
    })
  })
})
