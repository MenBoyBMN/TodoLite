/** Shared dialogs, styled with TodoLite instead of browser popups. */
const backdrop = document.getElementById('app-dialog-backdrop');
const dialog = document.getElementById('app-dialog');
const icon = document.getElementById('app-dialog-icon');
const title = document.getElementById('app-dialog-title');
const message = document.getElementById('app-dialog-message');
const input = document.getElementById('app-dialog-input');
const cancelButton = document.getElementById('app-dialog-cancel');
const confirmButton = document.getElementById('app-dialog-confirm');
let activeDialog = null;

function close(value) {
  if (!activeDialog) return;
  const { resolve, returnFocus } = activeDialog;
  activeDialog = null;
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden', 'true');
  input.value = '';
  returnFocus?.focus?.();
  resolve(value);
}

function show(options) {
  if (!backdrop || !dialog) return Promise.resolve(options.input ? null : false);
  if (activeDialog) close(activeDialog.input ? null : false);
  const isPrompt = Boolean(options.input);
  dialog.classList.toggle('is-danger', Boolean(options.danger));
  icon.hidden = isPrompt;
  title.textContent = options.title || 'Xác nhận thao tác';
  message.textContent = options.message || '';
  input.hidden = !isPrompt;
  input.required = isPrompt;
  input.value = options.defaultValue || '';
  input.placeholder = options.placeholder || '';
  cancelButton.textContent = options.cancelLabel || 'Hủy';
  confirmButton.textContent = options.confirmLabel || (isPrompt ? 'Tiếp tục' : 'Xác nhận');
  confirmButton.classList.toggle('is-danger', Boolean(options.danger));
  return new Promise((resolve) => {
    activeDialog = { resolve, input: isPrompt, returnFocus: document.activeElement };
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => (isPrompt ? input : confirmButton).focus());
  });
}

export const confirmDialog = (options = {}) => show(options);
export const promptDialog = (options = {}) => show({ ...options, input: true });

cancelButton?.addEventListener('click', () => close(activeDialog?.input ? null : false));
confirmButton?.addEventListener('click', () => {
  if (!activeDialog) return;
  const value = activeDialog.input ? input.value.trim() : true;
  if (activeDialog.input && !value) return input.focus();
  close(value);
});
backdrop?.addEventListener('click', (event) => {
  if (event.target === backdrop) close(activeDialog?.input ? null : false);
});
window.addEventListener('keydown', (event) => {
  if (!activeDialog) return;
  if (event.key === 'Escape') { event.preventDefault(); close(activeDialog.input ? null : false); }
  if (event.key === 'Enter' && activeDialog.input && document.activeElement === input) { event.preventDefault(); confirmButton.click(); }
});
