import {
  requestUrl,
  RequestUrlParam,
  RequestUrlResponsePromise,
  Editor,
  parseYaml,
  stringifyYaml,
} from 'obsidian';

/**
 * Abstraction for Obsidian's Editor
 */
export interface IEditor {
  getValue(): string;
  setValue(content: string): void;
}

/**
 * Service to encapsulate Obsidian API calls
 * This service makes testing easier by providing a layer that can be mocked
 */
export interface IObsidianService {
  /**
   * Make a request to a URL using Obsidian's requestUrl
   * @param options Request options
   */
  requestUrl(request: RequestUrlParam | string): RequestUrlResponsePromise;

  /**
   * Parse YAML string to object
   * @param yaml YAML string to parse
   */
  parseYaml(yaml: string): any;

  /**
   * Convert object to YAML string
   * @param object Object to convert to YAML
   */
  stringifyYaml(object: any): string;

  /**
   * Create an IEditor wrapper for Obsidian Editor
   * @param editor Obsidian Editor to wrap
   */
  createEditorAdapter(editor: Editor): IEditor;
}

/**
 * Implementation of the Obsidian service
 */
export class ObsidianService implements IObsidianService {
  /**
   * Make a request to a URL using Obsidian's requestUrl
   * @param options Request options
   */
  public requestUrl(
    request: RequestUrlParam | string
  ): RequestUrlResponsePromise {
    return requestUrl(request);
  }

  /**
   * Parse YAML string to object
   * @param yaml YAML string to parse
   */
  public parseYaml(yaml: string): any {
    return parseYaml(yaml);
  }

  /**
   * Convert object to YAML string
   * @param object Object to convert to YAML
   */
  public stringifyYaml(object: any): string {
    return stringifyYaml(object);
  }

  /**
   * Create an IEditor wrapper for Obsidian Editor
   * @param editor Obsidian Editor to wrap
   */
  public createEditorAdapter(editor: Editor): IEditor {
    return {
      getValue: () => editor.getValue(),
      setValue: (content: string) => editor.setValue(content),
    };
  }
}
