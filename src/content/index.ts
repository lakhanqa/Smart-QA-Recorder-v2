
import { LocatorGenerator } from './locator-generator';

let isRecording = false;

function handleEvent(event: Event) {
    if (!isRecording) return;

    const target = event.target as HTMLElement;
    if (!target) return;

    // Don't record interactions with the extension's own UI if it were injected (not the case here but good practice)

    const step = {
        type: event.type,
        locator: LocatorGenerator.generateLocator(target),
        value: (target as HTMLInputElement).value,
        timestamp: Date.now(),
        tagName: target.tagName,
        innerText: target.innerText?.substring(0, 50)
    };

    chrome.runtime.sendMessage({ type: 'RECORDED_STEP', step });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_RECORDING') {
        isRecording = true;
        console.log('Smart QA Recorder: Advanced Recording enabled');
    } else if (message.type === 'STOP_RECORDING') {
        isRecording = false;
        console.log('Smart QA Recorder: Recording stopped');
    } else if (message.type === 'GET_PAGE_CONTEXT') {
        const context = extractPageContext();
        sendResponse({ type: 'PAGE_CONTEXT_RESPONSE', context });
    }
    return true; // Allow async responses
});

function extractPageContext() {
    const interactiveElements = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"], h1, h2, h3'));

    const context = interactiveElements.slice(0, 50).map(el => {
        const target = el as HTMLElement;
        return {
            tagName: target.tagName,
            text: target.innerText?.trim().substring(0, 50),
            role: target.getAttribute('role'),
            placeholder: (target as HTMLInputElement).placeholder,
            id: target.id,
            type: (target as HTMLInputElement).type,
        };
    });

    return {
        title: document.title,
        url: window.location.href,
        elements: context
    };
}

document.addEventListener('click', handleEvent, true);
document.addEventListener('input', handleEvent, true);
document.addEventListener('change', handleEvent, true);

console.log('Smart QA Recorder: Content script initialized with Playwright locators');
