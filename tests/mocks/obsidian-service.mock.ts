import { IEditor, IObsidianService } from '../../src/obsidian-service'
import { vi } from 'vitest'

/**
 * Mock of IObsidianService for tests
 * Uses Vitest spies to simulate behaviors
 */
export class MockObsidianService implements IObsidianService {
  // Create spies for all methods
  requestUrl = vi.fn()
  parseYaml = vi.fn()
  stringifyYaml = vi.fn()
  createEditorAdapter = vi.fn()

  /**
   * Default response configuration
   */
  constructor() {
    // Default mock for parseYaml
    this.parseYaml.mockImplementation((yaml: string) => {
      try {
        return JSON.parse(yaml)
      } catch (e) {
        return {}
      }
    })

    // Default mock for stringifyYaml
    this.stringifyYaml.mockImplementation((obj: any) => JSON.stringify(obj))

    // Default mock for createEditorAdapter
    this.createEditorAdapter.mockImplementation(() => this.createMockEditor())
  }

  /**
   * Create a mock for the editor
   * @private Used internally by createEditorAdapter
   */
  private createMockEditor(content = ''): IEditor {
    return {
      getValue: vi.fn().mockReturnValue(content),
      setValue: vi.fn(),
    }
  }

  /**
   * Configure the mock to simulate a successful API response for a single call
   */
  mockSuccessfulApiResponse(responseData: any): void {
    this.requestUrl.mockResolvedValueOnce({
      status: 200,
      json: responseData,
      text: JSON.stringify(responseData),
    })
  }

  /**
   * Configure the mock to simulate an API error for a single call
   */
  mockFailedApiResponse(status: number, message: string): void {
    // Create a properly structured error object with status property
    const error = {
      message: message,
      status: status,
    }
    // Use mockRejectedValueOnce to make the next call reject with this error
    this.requestUrl.mockRejectedValueOnce(error)
  }
}
