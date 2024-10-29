import { App, Modal } from 'obsidian';

/**
 * Base interface for modal configurations
 */
interface ModalConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  warning?: boolean;
}

/**
 * Base class for plugin modals with common functionality
 */
abstract class BaseModal extends Modal {
  protected loading: boolean = false;

  /**
   * Creates the basic modal structure
   */
  protected createModalContent(
    title: string,
    message: string,
    buttonsContainer: HTMLElement
  ): void {
    const { contentEl } = this;

    // Title
    contentEl.createEl("h3", { text: title });

    // Message
    contentEl.createEl("p", { text: message });

    // Buttons container with styling
    buttonsContainer.addClass("modal-button-container");
  }

  /**
   * Creates a button for the modal
   */
  protected createButton(
    container: HTMLElement,
    text: string,
    handler: () => void | Promise<void>,
    warning: boolean = false
  ): HTMLButtonElement {
    const button = container.createEl("button", { text });
    if (warning) button.addClass("mod-warning");
    button.addEventListener("click", async () => {
      if (this.loading) return;
      await this.handleButtonClick(button, handler);
    });
    return button;
  }

  /**
   * Handles button click with loading state
   */
  private async handleButtonClick(
    button: HTMLButtonElement,
    handler: () => void | Promise<void>
  ): Promise<void> {
    const originalText = button.getText();
    try {
      this.setLoading(true);
      button.setText("Processing...");
      await handler();
    } finally {
      this.setLoading(false);
      button.setText(originalText);
    }
  }

  /**
   * Sets the loading state of the modal
   */
  protected setLoading(loading: boolean): void {
    this.loading = loading;
    this.contentEl.findAll("button").forEach(button => {
      if (loading) {
        button.setAttr('disabled', 'true');
      } else {
        button.removeAttribute('disabled');
      }
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * Modal for confirming destructive actions
 */
export class ConfirmModal extends BaseModal {
  private config: ModalConfig;
  private onConfirm: () => Promise<void>;

  constructor(app: App, config: ModalConfig, onConfirm: () => Promise<void>) {
    super(app);
    this.config = config;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const buttonsContainer = this.contentEl.createDiv();
    this.createModalContent(
      this.config.title,
      this.config.message,
      buttonsContainer
    );

    // Cancel button
    this.createButton(
      buttonsContainer,
      this.config.cancelText || "Cancel",
      () => this.close()
    );

    // Confirm button
    this.createButton(
      buttonsContainer,
      this.config.confirmText || "Confirm",
      async () => {
        try {
          await this.onConfirm();
          this.close();
        } catch (error) {
          console.error('Confirmation action failed:', error);
          // Modal stays open on error, showing the error in the UI
          const errorDiv = this.contentEl.createDiv('modal-error');
          errorDiv.setText(error.message);
        }
      },
      this.config.warning
    );
  }
}

/**
 * Specific modal for delete confirmation
 */
export class DeleteConfirmModal extends ConfirmModal {
  constructor(app: App, noteTitle: string, onConfirm: () => Promise<void>) {
    super(
      app,
      {
        title: "Delete HackMD Note",
        message: `Are you sure you want to delete the HackMD note for "${noteTitle}"? ` +
          `This will remove the note from HackMD and remove all HackMD metadata from the local file.`,
        confirmText: "Delete",
        warning: true
      },
      onConfirm
    );
  }
}

/**
 * Factory for creating common modal types
 */
export const ModalFactory = {
  /**
   * Creates a confirmation modal
   */
  createConfirmModal(
    app: App,
    title: string,
    message: string,
    onConfirm: () => Promise<void>,
    options: Partial<ModalConfig> = {}
  ): ConfirmModal {
    return new ConfirmModal(
      app,
      {
        title,
        message,
        ...options
      },
      onConfirm
    );
  },

  /**
   * Creates a delete confirmation modal
   */
  createDeleteModal(
    app: App,
    noteTitle: string,
    onConfirm: () => Promise<void>
  ): DeleteConfirmModal {
    return new DeleteConfirmModal(app, noteTitle, onConfirm);
  }
};
