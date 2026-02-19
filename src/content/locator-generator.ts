
export interface ElementData {
    tagName: string;
    id?: string;
    name?: string;
    className?: string;
    type?: string;
    placeholder?: string;
    text?: string;
    ariaLabel?: string;
    labelText?: string;
    dataTestId?: string;
    role?: string;
    href?: string;
    src?: string;
    title?: string;
    value?: string;
    checked?: boolean;
    attributes?: Record<string, string>;
    isSVG?: boolean;
}

export const LocatorGenerator = {
    inferRole(tagName: string, type?: string): string | null {
        const roleMap: Record<string, any> = {
            'button': 'button',
            'a': 'link',
            'img': 'img',
            'input': {
                'button': 'button',
                'submit': 'button',
                'checkbox': 'checkbox',
                'radio': 'radio',
                'text': 'textbox',
                'email': 'textbox',
                'password': 'textbox',
                'search': 'searchbox',
                'number': 'spinbutton'
            },
            'select': 'combobox',
            'textarea': 'textbox',
            'h1': 'heading',
            'h2': 'heading',
            'h3': 'heading',
            'h4': 'heading',
            'h5': 'heading',
            'h6': 'heading'
        };

        const tag = tagName.toLowerCase();
        if (tag === 'input' && type) {
            return roleMap.input[type] || 'textbox';
        }
        return roleMap[tag] || null;
    },

    generateLocator(el: HTMLElement): string {
        const tagName = el.tagName.toLowerCase();
        const type = (el as HTMLInputElement).type;
        const role = el.getAttribute('role') || this.inferRole(tagName, type);
        const text = el.innerText?.trim().substring(0, 50);
        const id = el.id;
        const dataTestId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
        const ariaLabel = el.getAttribute('aria-label');
        const placeholder = (el as HTMLInputElement).placeholder;
        const labelText = this.getLabelText(el);

        // Priority 1: Test ID
        if (dataTestId) {
            return `page.getByTestId('${dataTestId}')`;
        }

        // Priority 2: Role with Name
        const accessibleName = ariaLabel || labelText || text;
        if (role && accessibleName) {
            return `page.getByRole('${role}', { name: '${this.escape(accessibleName)}' })`;
        }

        // Priority 3: Label (for inputs)
        if (['input', 'textarea', 'select'].includes(tagName) && labelText) {
            return `page.getByLabel('${this.escape(labelText)}')`;
        }

        // Priority 4: Placeholder
        if (placeholder) {
            return `page.getByPlaceholder('${this.escape(placeholder)}')`;
        }

        // Priority 5: ID
        if (id) {
            return `page.locator('#${id}')`;
        }

        // Priority 6: Text (if not caught by role)
        if (text && text.length > 0) {
            return `page.getByText('${this.escape(text)}')`;
        }

        // Fallback: tag and class
        const className = Array.from(el.classList).join('.');
        return className ? `${tagName}.${className}` : tagName;
    },

    getLabelText(el: HTMLElement): string | null {
        if (el.id) {
            const label = document.querySelector(`label[for="${el.id}"]`);
            if (label) return (label as HTMLElement).innerText.trim();
        }
        const parentLabel = el.closest('label');
        if (parentLabel) return (parentLabel as HTMLElement).innerText.trim();
        return null;
    },

    escape(str: string): string {
        return str.replace(/'/g, "\\'").replace(/\n/g, ' ').trim();
    }
};
