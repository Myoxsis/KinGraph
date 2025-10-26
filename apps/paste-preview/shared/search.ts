export interface WorkspaceSearchElements {
  input: HTMLInputElement;
  form: HTMLFormElement | null;
  clearButton: HTMLButtonElement | null;
}

export interface WorkspaceSearchOptions {
  elements?: Partial<WorkspaceSearchElements>;
  initialValue?: string;
  onInput?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onClear?: () => void;
}

export interface WorkspaceSearchHandle {
  getValue: () => string;
  setValue: (value: string) => void;
  focus: () => void;
}

function findSearchElements(
  overrides: Partial<WorkspaceSearchElements> | undefined,
): WorkspaceSearchElements | null {
  const formElement =
    overrides?.form ??
    (document.getElementById("workspace-search-form") as HTMLFormElement | null);
  const inputElement =
    overrides?.input ??
    (document.getElementById("workspace-search") as HTMLInputElement | null);
  const clearElement =
    overrides?.clearButton ??
    (document.getElementById("workspace-search-clear") as HTMLButtonElement | null);

  if (!(inputElement instanceof HTMLInputElement)) {
    return null;
  }

  return {
    input: inputElement,
    form: formElement instanceof HTMLFormElement ? formElement : null,
    clearButton: clearElement instanceof HTMLButtonElement ? clearElement : null,
  };
}

export function initializeWorkspaceSearch(
  options: WorkspaceSearchOptions = {},
): WorkspaceSearchHandle | null {
  const elements = findSearchElements(options.elements);

  if (!elements) {
    return null;
  }

  const { input, form, clearButton } = elements;

  function updateClearVisibility(): void {
    if (clearButton) {
      clearButton.hidden = input.value.trim().length === 0;
    }
  }

  function setValue(value: string): void {
    input.value = value;
    updateClearVisibility();
  }

  if (typeof options.initialValue === "string") {
    setValue(options.initialValue);
  } else {
    updateClearVisibility();
  }

  input.addEventListener("input", () => {
    updateClearVisibility();
    options.onInput?.(input.value.trim());
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    options.onSubmit?.(input.value.trim());
  });

  clearButton?.addEventListener("click", () => {
    setValue("");
    options.onClear?.();
    options.onInput?.("");
    input.focus();
  });

  return {
    getValue: () => input.value.trim(),
    setValue,
    focus: () => input.focus(),
  };
}
