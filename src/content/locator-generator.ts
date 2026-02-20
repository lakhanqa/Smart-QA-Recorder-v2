
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

export interface GeneratedLocators {
    playwright: string;
    css: string;
    xpath: string;
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

    generateLocators(el: HTMLElement): GeneratedLocators {
        const tagName = el.tagName.toLowerCase();
        const type = (el as HTMLInputElement).type;
        const role = el.getAttribute('role') || this.inferRole(tagName, type);
        const text = el.innerText?.trim().substring(0, 50);
        const id = el.id;
        const dataTestId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
        const ariaLabel = el.getAttribute('aria-label');
        const placeholder = (el as HTMLInputElement).placeholder;
        const labelText = this.getLabelText(el);

        let playwright = '';
        let css = '';
        let xpath = `//${tagName}`; // default fallback xpath

        const accessibleName = ariaLabel || labelText || text;
        const escapedText = accessibleName ? this.escape(accessibleName) : '';

        // Playwright logic
        if (dataTestId) {
            playwright = `page.getByTestId('${dataTestId}')`;
        } else if (role && accessibleName) {
            playwright = `page.getByRole('${role}', { name: '${escapedText}' })`;
        } else if (['input', 'textarea', 'select'].includes(tagName) && labelText) {
            playwright = `page.getByLabel('${this.escape(labelText)}')`;
        } else if (placeholder) {
            playwright = `page.getByPlaceholder('${this.escape(placeholder)}')`;
        } else if (id) {
            playwright = `page.locator('#${id}')`;
        } else if (text && text.length > 0) {
            playwright = `page.getByText('${this.escape(text)}')`;
        } else {
            const className = Array.from(el.classList).join('.');
            playwright = className ? `${tagName}.${className}` : tagName;
        }

        // CSS logic
        if (id) {
            css = `#${id}`;
        } else if (dataTestId) {
            css = `[data-testid="${dataTestId}"]`;
        } else if (el.getAttribute('data-test-id')) {
            css = `[data-test-id="${el.getAttribute('data-test-id')}"]`;
        } else if ((el as any).name) {
            css = `${tagName}[name="${(el as any).name}"]`;
        } else if (placeholder) {
            css = `${tagName}[placeholder="${placeholder}"]`;
        } else {
            const classNames = Array.from(el.classList).join('.');
            css = classNames ? `${tagName}.${classNames}` : tagName;

            // For simple tags without classes/ids to identify them uniquely among siblings, 
            // nth-child is an option but might be brittle without full path generation.
            // Returning tag with class is decent for typical recordings.
        }

        // XPath logic
        if (id) {
            xpath = `//*[@id='${id}']`;
        } else if (dataTestId) {
            xpath = `//*[@data-testid='${dataTestId}']`;
        } else if (el.getAttribute('data-test-id')) {
            xpath = `//*[@data-test-id='${el.getAttribute('data-test-id')}']`;
        } else if (text && text.length > 0) {
            xpath = `//${tagName}[contains(text(), '${this.escape(text)}')]`;
        } else if (placeholder) {
            xpath = `//${tagName}[@placeholder='${placeholder}']`;
        } else if ((el as any).name) {
            xpath = `//${tagName}[@name='${(el as any).name}']`;
        } else if (el.classList.length > 0) {
            xpath = `//${tagName}[@class='${Array.from(el.classList).join(' ')}']`;
        }

        return {
            playwright,
            css,
            xpath
        };
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
