import { Eko } from "@eko-ai/eko";
import type { LLMs, StreamCallbackMessage, StreamCallback, HumanCallback } from "@eko-ai/eko";
import { BrowserAgent } from "@eko-ai/eko-extension";

let isRecording = false;
let recordedSteps: any[] = [];

export async function getLLMConfig(name: string = "llmConfig"): Promise<any> {
  let result = await chrome.storage.sync.get([name]);
  return result[name];
}

export async function generateManualTestCases(pageContext: any): Promise<string> {
  let config = await getLLMConfig();
  if (!config || !config.apiKey) {
    throw new Error("LLM not configured");
  }

  const prompt = `Generate a set of manual test cases for the following web page content. 
Return the result ONLY as a JSON array of objects. Do not include any other text or Markdown formatting.

Page Title: ${pageContext.title}
URL: ${pageContext.url}

Interactive Elements:
${pageContext.elements.map((el: any) => `- ${el.tagName}: ${el.text || el.placeholder || el.role || 'element'} (ID: ${el.id || 'N/A'})`).join('\n')}

Each object in the JSON array must have these exact keys:
1. "id": A unique identifier (e.g., "TC_001").
2. "title": A short description of the test purpose.
3. "preconditions": Prerequisite steps or state.
4. "steps": Detailed, step-by-step actions.
5. "data": Input values or files required.
6. "expected": Expected behavior or outcome.
7. "actual": Observed behavior (leave empty or put "Pending").
8. "status": Final verdict (e.g., "Not Run").`;

  return await callLLM(prompt, config);
}

async function callLLM(prompt: string, config: any): Promise<string> {
  const url = config.options.baseURL + (config.options.baseURL.endsWith('/') ? '' : '/') + 'chat/completions';

  const headers: any = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`
  };

  if (config.llm === 'openrouter') {
    headers['HTTP-Referer'] = 'https://eko.ai';
    headers['X-Title'] = 'Smart QA Automation Browser Agent';
  }

  const body = {
    model: config.modelName,
    messages: [
      { role: 'system', content: 'You are a professional QA engineer helping to generate manual test cases.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API Error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "Failed to generate test cases.";
}

export async function main(prompt: string): Promise<Eko> {
  let config = await getLLMConfig();
  if (!config || !config.apiKey) {
    printLog("Please configure apiKey, configure in the Smart QA Automation extension options of the browser extensions.", "error");
    chrome.runtime.openOptionsPage();
    chrome.storage.local.set({ running: false });
    chrome.runtime.sendMessage({ type: "stop" });
    return;
  }

  // Log configuration for debugging (without exposing the full API key)
  printLog(`Using LLM: ${config.llm}, Model: ${config.modelName}, BaseURL: ${config.options?.baseURL}`, "info");
  printLog(`API Key configured: ${config.apiKey ? 'Yes (length: ' + config.apiKey.length + ')' : 'No'}`, "info");

  // Validate configuration before creating LLMs object
  if (!config.options?.baseURL) {
    printLog("Error: Base URL is not configured properly", "error");
    return;
  }

  if (!config.modelName) {
    printLog("Error: Model name is not configured", "error");
    return;
  }

  // Additional validation for OpenRouter
  if (config.llm === 'openrouter') {
    if (!config.apiKey.startsWith('sk-or-')) {
      printLog("Warning: OpenRouter API keys typically start with 'sk-or-'", "error");
    }
    if (!config.options.baseURL.includes('openrouter.ai')) {
      printLog("Warning: Base URL should be OpenRouter endpoint", "error");
    }
    // Check if model is free tier
    if (config.modelName.includes(':free')) {
      printLog("Using free tier model - check OpenRouter limits", "info");
    }
  }

  // Additional validation for Google Gemini
  if (config.llm === 'google') {
    if (!config.apiKey.startsWith('AIza')) {
      printLog("Warning: Google API keys typically start with 'AIza'", "error");
    }
    if (!config.options.baseURL.includes('googleapis.com')) {
      printLog("Warning: Base URL should be Google API endpoint", "error");
    }
    printLog("Using Google Gemini API directly - better rate limits than OpenRouter", "info");
  }

  // Additional validation for Groq
  if (config.llm === 'groq') {
    if (!config.apiKey.startsWith('gsk_')) {
      printLog("Warning: Groq API keys typically start with 'gsk_'", "error");
    }
    if (!config.options.baseURL.includes('api.groq.com')) {
      printLog("Warning: Base URL should be Groq API endpoint", "error");
    }
    printLog("Using Groq API - ultra-fast inference speeds", "info");
  }

  const llms: LLMs = {
    default: {
      provider: config.llm === 'groq' ? 'openai' : config.llm as any, // Groq uses OpenAI-compatible API
      model: config.modelName,
      apiKey: config.apiKey,
      config: {
        baseURL: config.options.baseURL,
        // Add timeout and other error handling configs
        timeout: 60000, // 60 seconds timeout
        // Add provider-specific config
        ...(config.llm === 'openrouter' && {
          headers: {
            'HTTP-Referer': 'https://eko.ai',
            'X-Title': 'Smart QA Automation Browser Agent'
          }
        }),
        ...(config.llm === 'google' && {
          headers: {
            'Content-Type': 'application/json'
          }
        }),
        ...(config.llm === 'groq' && {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
          },
          // Groq-specific configurations to ensure proper message formatting
          messageFormat: 'openai',
          enforceStringContent: true
        })
      },
    },
  };

  // Log the LLM configuration (without API key)
  const actualProvider = config.llm === 'groq' ? 'openai' : config.llm;
  printLog(`LLM Config: Provider=${config.llm}, Actual Provider=${actualProvider}, Model=${config.modelName}, BaseURL=${config.options.baseURL}`, "info");

  let callback: StreamCallback & HumanCallback = {
    onMessage: async (message: StreamCallbackMessage) => {
      if (message.type == "workflow") {
        printLog("Plan\n" + message.workflow.xml, "info", !message.streamDone);
      } else if (message.type == "text") {
        printLog(message.text, "info", !message.streamDone);
      } else if (message.type == "tool_streaming") {
        printLog(`${message.agentName} > ${message.toolName}\n${message.paramsText}`, "info", true);
      } else if (message.type == "tool_use") {
        printLog(
          `${message.agentName} > ${message.toolName}\n${JSON.stringify(
            message.params
          )}`
        );
      } else if (message.type == "error") {
        // Catch LLM-specific errors
        printLog(`LLM Error: ${message.error || 'Unknown LLM error'}`, "error");
      }
      console.log("message: ", JSON.stringify(message, null, 2));
    },
    onHumanConfirm: async (context, prompt) => {
      return confirm(prompt);
    },
  };

  let agents = [new BrowserAgent()];

  try {
    printLog(`Creating Smart QA Automation instance with LLM provider: ${config.llm}`, "info");
    var eko = new Eko({ llms, agents, callback });
    printLog(`Smart QA Automation instance created successfully`, "info");
  } catch (ekoError) {
    printLog(`Failed to create Smart QA Automation instance: ${ekoError.message}`, "error");
    chrome.storage.local.set({ running: false });
    chrome.runtime.sendMessage({ type: "stop" });
    return;
  }

  printLog(`Starting Smart QA Automation with prompt: "${prompt}"`, "info");

  // Test network connectivity for Groq specifically
  if (config.llm === 'groq') {
    printLog(`Testing Groq API connectivity...`, "info");
    try {
      // Simple ping to Groq API to test connectivity
      await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        }
      }).then(response => {
        if (response.ok) {
          printLog(`✅ Groq API connectivity test successful`, "info");
        } else {
          printLog(`⚠️ Groq API responded with status: ${response.status}`, "error");
        }
      });
    } catch (connectError) {
      printLog(`❌ Groq API connectivity test failed: ${connectError.message}`, "error");
      printLog(`This may be because of network or CORS issues check network tab once.`, "error");
    }
  }

  eko
    .run(prompt)
    .then((res) => {
      printLog(res.result, res.success ? "success" : "error");
    })
    .catch((error) => {
      // Enhanced error logging with specific API error handling
      printLog(`Error Type: ${error.constructor.name}`, "error");
      printLog(`Error Message: ${error.message || error.toString()}`, "error");

      // Handle message format errors specifically
      if (error.message && error.message.includes('content must be a string')) {
        printLog(`📝 MESSAGE FORMAT ERROR: API received invalid message format`, "error");
        printLog(`This usually happens when:`, "error");
        printLog(`1. The framework sends non-string content (images, objects, etc.)`, "error");
        printLog(`2. Message formatting is incompatible with the provider`, "error");
        if (config.llm === 'groq') {
          printLog(`3. Groq requires strict OpenAI message format compliance`, "error");
          printLog(`4. Try switching to Google Gemini or OpenAI temporarily`, "error");
        }
        printLog(`5. This may be a limitation of the current Eko framework version`, "error");
      }

      // Handle fetch errors specifically
      if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
        printLog(`🌐 NETWORK ERROR: Failed to fetch from API`, "error");
        printLog(`Possible causes:`, "error");
        printLog(`1. Network connectivity issues`, "error");
        printLog(`2. CORS policy blocking the request`, "error");
        printLog(`3. API endpoint unreachable`, "error");
        printLog(`4. Invalid base URL: ${config.options?.baseURL}`, "error");
        if (config.llm === 'groq') {
          printLog(`5. Groq service might be temporarily down`, "error");
          printLog(`6. Try switching to a different provider temporarily`, "error");
        }
      }

      // Check for specific API-related error properties
      if (error.name === 'AI_APICallError' || error.constructor.name === 'AI_APICallError' || error.constructor.name === 'k') {
        printLog(`This is an AI API Call Error - check your API configuration`, "error");
        printLog(`Provider: ${config.llm}`, "error");
        printLog(`Model: ${config.modelName}`, "error");
        printLog(`Base URL: ${config.options?.baseURL}`, "error");
        printLog(`API Key length: ${config.apiKey?.length || 'undefined'}`, "error");

        // Provider-specific error guidance
        if (config.llm === 'openrouter') {
          printLog(`Common causes for OpenRouter API errors:`, "error");
          printLog(`1. Invalid API key format or permissions`, "error");
          printLog(`2. Model not available or rate limited`, "error");
          printLog(`3. Request format not compatible with model`, "error");
          printLog(`4. Free tier usage limits exceeded`, "error");
          printLog(`5. OpenRouter service issues`, "error");
        } else if (config.llm === 'google') {
          printLog(`Common causes for Google Gemini API errors:`, "error");
          printLog(`1. Invalid API key (should start with 'AIza')`, "error");
          printLog(`2. API not enabled in Google Cloud Console`, "error");
          printLog(`3. Billing not set up (required for API usage)`, "error");
          printLog(`4. Model name format incorrect`, "error");
          printLog(`5. Request quota exceeded`, "error");
          printLog(`6. Geographic restrictions`, "error");
        } else if (config.llm === 'groq') {
          printLog(`Common causes for Groq API errors:`, "error");
          printLog(`1. Invalid API key (should start with 'gsk_')`, "error");
          printLog(`2. Rate limit exceeded (very generous limits)`, "error");
          printLog(`3. Model name incorrect or unavailable`, "error");
          printLog(`4. Request format not compatible`, "error");
          printLog(`5. Message content format issues (must be strings)`, "error");
          printLog(`6. Service temporarily unavailable`, "error");
          printLog(`ℹ️ RECOMMENDATION: Try Google Gemini for better compatibility`, "error");
        }
      }

      // Try to extract more error details
      if (error.cause) {
        printLog(`Error Cause: ${JSON.stringify(error.cause)}`, "error");
      }
      if (error.details) {
        printLog(`Error Details: ${JSON.stringify(error.details)}`, "error");
      }
      if (error.statusCode) {
        printLog(`Status Code: ${error.statusCode}`, "error");

        // Provide specific guidance based on status code
        switch (error.statusCode) {
          case 429:
            printLog(`🚨 RATE LIMITED (429): You've exceeded the rate limit or quota`, "error");
            printLog(`Solutions:`, "error");
            printLog(`- Wait before trying again (rate limit resets)`, "error");
            printLog(`- Check your OpenRouter account usage/credits`, "error");
            printLog(`- Free tier models have strict limits`, "error");
            printLog(`- Consider upgrading to paid plan`, "error");
            break;
          case 401:
            printLog(`🔑 UNAUTHORIZED (401): Invalid API key`, "error");
            break;
          case 403:
            printLog(`🚫 FORBIDDEN (403): Access denied to this model`, "error");
            break;
          case 400:
            printLog(`📝 BAD REQUEST (400): Invalid request format`, "error");
            break;
          case 500:
            printLog(`🔥 SERVER ERROR (500): OpenRouter service issue`, "error");
            break;
        }
      }

      // Extract response body and headers if available
      if (error.responseBody) {
        printLog(`Response Body: ${JSON.stringify(error.responseBody)}`, "error");
      }
      if (error.responseHeaders) {
        printLog(`Response Headers: ${JSON.stringify(error.responseHeaders)}`, "error");
      }
      if (error.url) {
        printLog(`Request URL: ${error.url}`, "error");
      }
      if (error.requestBodyValues) {
        printLog(`Request Body: ${JSON.stringify(error.requestBodyValues)}`, "error");
      }
      if (error.isRetryable) {
        printLog(`Is Retryable: ${error.isRetryable}`, "error");
      }
      if (error.data) {
        printLog(`Error Data: ${JSON.stringify(error.data)}`, "error");
      }
      if (error.response) {
        printLog(`API Response Status: ${error.response.status}`, "error");
        printLog(`API Response Headers: ${JSON.stringify(error.response.headers)}`, "error");
        printLog(`API Response Data: ${JSON.stringify(error.response.data)}`, "error");
      }
      if (error.request) {
        printLog(`Request URL: ${error.request.url || 'unknown'}`, "error");
        printLog(`Request Method: ${error.request.method || 'unknown'}`, "error");
      }
      if (error.config) {
        printLog(`Request Config: ${JSON.stringify({
          url: error.config.url,
          method: error.config.method,
          headers: error.config.headers ? Object.keys(error.config.headers) : 'none'
        })}`, "error");
      }

      // Log all enumerable properties of the error
      printLog(`All error properties: ${JSON.stringify(Object.getOwnPropertyNames(error))}`, "error");

      if (error.stack) {
        printLog(`Error Stack: ${error.stack}`, "error");
      }

      console.error("Full error object:", error);
      console.error("Error keys:", Object.keys(error));
      console.error("Error values:", Object.values(error));
    })
    .finally(() => {
      chrome.storage.local.set({ running: false });
      chrome.runtime.sendMessage({ type: "stop" });
    });
  return eko;
}

function printLog(
  message: string,
  level?: "info" | "success" | "error",
  stream?: boolean
) {
  chrome.runtime.sendMessage({
    type: "log",
    log: message + "",
    level: level || "info",
    stream,
  }, () => {
    if (chrome.runtime.lastError) {
      // Silently ignore: this happens if the sidebar/options page is not open
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_RECORDING') {
    isRecording = true;
    recordedSteps = [];

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        chrome.debugger.attach({ tabId: activeTab.id }, "1.3", () => {
          if (chrome.runtime.lastError) {
            console.error("Debugger attach error:", chrome.runtime.lastError.message);
            printLog("Wait! Cannot record on this page (Chrome restricted page or debugger already attached).", "error");
            isRecording = false;
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            chrome.debugger.sendCommand({ tabId: activeTab.id }, "Network.enable");
            chrome.debugger.sendCommand({ tabId: activeTab.id }, "Console.enable");
            printLog("CDP Session started for tab " + activeTab.id, "info");

            // Send message to content script ONLY after debugger attaches successfully
            chrome.tabs.sendMessage(activeTab.id, { type: 'START_RECORDING' }, () => {
              if (chrome.runtime.lastError) {
                console.warn("Content script not ready:", chrome.runtime.lastError.message);
              }
            });
            sendResponse({ success: true });
          }
        });
      } else {
        sendResponse({ success: false, error: "No active tab" });
      }
    });

    printLog("Recording started...", "info");
    return true; // Async response
  } else if (message.type === 'STOP_RECORDING') {
    isRecording = false;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        chrome.debugger.detach({ tabId: activeTab.id }, () => {
          if (chrome.runtime.lastError) {
            // Might already be detached
          }
          printLog("CDP Session finished.", "info");
          sendResponse({ steps: recordedSteps });
        });
        chrome.tabs.sendMessage(activeTab.id, { type: 'STOP_RECORDING' }, () => {
          if (chrome.runtime.lastError) {
            // Ignore
          }
        });
      } else {
        sendResponse({ steps: recordedSteps });
      }
    });

    printLog("Recording stopped. Captured " + recordedSteps.length + " steps.", "success");
    return true; // Async response
  } else if (message.type === 'RECORDED_STEP') {
    if (isRecording) {
      recordedSteps.push(message.step);
      chrome.runtime.sendMessage({ type: 'UPDATE_STEPS', steps: recordedSteps }, () => {
        if (chrome.runtime.lastError) {
          // Ignore: sidebar closed
        }
      });
    }
    sendResponse({}); // Acknowledge
    return false; // Keep it simple
  } else if (message.type === 'GET_RECORDED_STEPS') {
    sendResponse({ steps: recordedSteps, isRecording });
    return false;
  }
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!isRecording) return;

  if (method === "Console.messageAdded") {
    const message = (params as any).message;
    if (message.level === "error") {
      const text = message.text || "";

      // Filter out noisy external site errors that are not relevant to the recording
      const isNoisyError =
        text.includes('cart_items') ||
        text.includes('[object Object]') ||
        text.includes('Extension context invalidated');

      if (!isNoisyError) {
        printLog(`Page Error: ${text}`, "error");
      }
    }
  }
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (isRecording) {
    printLog("Debugger detached: " + reason, "error");
    isRecording = false;
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, () => {
      if (chrome.runtime.lastError) {
        // Ignore
      }
    });
  }
});
