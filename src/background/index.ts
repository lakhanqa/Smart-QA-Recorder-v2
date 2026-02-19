import { Eko } from "@eko-ai/eko";
import { main, generateManualTestCases } from "./main";

var eko: Eko;

chrome.storage.local.set({ running: false });

// Listen to messages from the browser extension
chrome.runtime.onMessage.addListener(function (
  request,
  sender,
  sendResponse
) {
  if (request.type == "run") {
    (async () => {
      try {
        chrome.runtime.sendMessage({ type: "log", log: "Run..." });
        eko = await main(request.prompt);
      } catch (e) {
        console.error(e);
        chrome.runtime.sendMessage({
          type: "log",
          log: e + "",
          level: "error",
        });
      }
    })();
  } else if (request.type == "stop") {
    eko && eko.getAllTaskId().forEach(taskId => {
      eko.abortTask(taskId);
      chrome.runtime.sendMessage({ type: "log", log: "Abort taskId: " + taskId });
    });
    chrome.runtime.sendMessage({ type: "log", log: "Stop" });
  } else if (request.type === 'GENERATE_MANUAL_TESTCASE') {
    (async () => {
      try {
        chrome.runtime.sendMessage({ type: 'log', log: 'Checking tab access...' });

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          throw new Error('No active tab found');
        }

        // Check if it's a restricted page
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('chrome-extension://')) {
          throw new Error('Cannot capture context on this type of page. Please try on a regular website.');
        }

        chrome.runtime.sendMessage({ type: 'log', log: 'Ensuring content script is ready...' });

        // Ensure content script is injected
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
        } catch (e) {
          // If message fails, try injecting the script
          chrome.runtime.sendMessage({ type: 'log', log: 'Injecting content script...' });
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['js/content_script.js']
          });
          // Wait a bit for script to initialize
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        chrome.runtime.sendMessage({ type: 'log', log: 'Capturing page context...' });

        // Request context from content script using the more reliable sendMessage response
        const response: any = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Content script communication timeout')), 10000);

          chrome.tabs.sendMessage(tab.id!, { type: 'GET_PAGE_CONTEXT' }, (res) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (res && res.type === 'PAGE_CONTEXT_RESPONSE') {
              resolve(res.context);
            } else {
              reject(new Error('Invalid response from content script'));
            }
          });
        });

        chrome.runtime.sendMessage({ type: 'log', log: 'Generating test cases via AI...' });

        // 3. Generate test cases
        const testcases = await generateManualTestCases(response);

        // 4. Send back to sidebar
        chrome.runtime.sendMessage({ type: 'MANUAL_TESTCASE_GENERATED', testcases });
        chrome.runtime.sendMessage({ type: 'log', log: 'Manual test cases generated successfully!', level: 'success' });

      } catch (e) {
        console.error('Manual generation error:', e);
        const errorMsg = e instanceof Error ? e.message : String(e);
        chrome.runtime.sendMessage({ type: 'log', log: 'Failed: ' + errorMsg, level: 'error' });
        chrome.runtime.sendMessage({ type: 'MANUAL_TESTCASE_GENERATED', error: errorMsg });
      }
    })();
  }
  // No return true here as these actions don't send a response back through this channel
});

(chrome as any).sidePanel && (chrome as any).sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
