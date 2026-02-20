
import { LocatorGenerator } from './locator-generator';

let isRecording = false;

function handleEvent(event: Event) {
    if (!isRecording) return;

    const target = event.target as HTMLElement;
    if (!target || !target.tagName) return;

    // Don't record interactions with the extension's own UI if it were injected (not the case here but good practice)

    const step = {
        type: event.type,
        locators: LocatorGenerator.generateLocators(target),
        value: (target as HTMLInputElement).value,
        timestamp: Date.now(),
        tagName: target.tagName,
        innerText: target.innerText?.substring(0, 50)
    };

    try {
        chrome.runtime.sendMessage({ type: 'RECORDED_STEP', step });
    } catch (e) {
        console.warn('Smart QA Recorder: Failed to send recorded step. Extension might have been reloaded.', e);
        isRecording = false;
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_RECORDING') {
        isRecording = true;
        console.log('Smart QA Recorder: Advanced Recording enabled');

        try {
            // Capture initial URL when explicitly starting
            chrome.runtime.sendMessage({
                type: 'RECORDED_STEP',
                step: {
                    type: 'navigate',
                    locators: { playwright: '', css: '', xpath: '' },
                    value: window.location.href,
                    timestamp: Date.now(),
                    tagName: 'PAGE',
                    innerText: document.title
                }
            });
        } catch (e) {
            console.warn('Smart QA Recorder: Failed to send initial navigate step.', e);
        }
        sendResponse({ success: true });
    } else if (message.type === 'STOP_RECORDING') {
        isRecording = false;
        console.log('Smart QA Recorder: Recording stopped');
        sendResponse({ success: true });
    } else if (message.type === 'GET_PAGE_CONTEXT') {
        const context = extractPageContext();
        sendResponse({ type: 'PAGE_CONTEXT_RESPONSE', context });
    }
});

// Check if recording is already active (e.g., after page navigation)
try {
    chrome.runtime.sendMessage({ type: 'CHECK_RECORDING_STATE' }, (response) => {
        if (chrome.runtime.lastError) {
            console.debug('Smart QA Recorder: Could not check state', chrome.runtime.lastError);
            return;
        }
        if (response && response.isRecording) {
            isRecording = response.isRecording;
            console.log('Smart QA Recorder: Resumed recording after navigation');

            // Optionally capture navigation step here if needed
            try {
                chrome.runtime.sendMessage({
                    type: 'RECORDED_STEP',
                    step: {
                        type: 'navigate',
                        locators: { playwright: '', css: '', xpath: '' },
                        value: window.location.href,
                        timestamp: Date.now(),
                        tagName: 'PAGE',
                        innerText: document.title
                    }
                });
            } catch (innerE) {
                console.warn('Smart QA Recorder: Failed to send navigate step on resume.', innerE);
            }
        }
    });
} catch (e) {
    console.warn('Smart QA Recorder: Extension context invalidated on load.', e);
}

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
