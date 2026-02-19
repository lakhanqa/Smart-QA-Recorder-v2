import { Eko, Agent, Log } from "@eko-ai/eko";
import type { LLMs, StreamCallbackMessage, StreamCallback, HumanCallback } from "@eko-ai/eko";
import { BrowserAgent } from "@eko-ai/eko-extension";
import { FakerTool } from "./fakerTool";

let isRecording = false;
let recordedSteps: any[] = [];
let activeEko: Eko | null = null;
let activeTaskId: string | null = null;

export async function stopDiscovery(): Promise<void> {
  if (activeEko && activeTaskId) {
    const task = activeEko.getTask(activeTaskId);
    if (task) {
      task.abort();
      printLog("Stopping discovery and generating test cases...", "info");
    }
    activeEko = null;
    activeTaskId = null;
  }
}

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

Each object in the JSON array must have these exact keys and follow these descriptions:
1. "id": Test Case ID: A unique identifier for every test case (e.g., TC001, Login_01).
2. "title": Test Scenario/Title: A brief description of what functionality is being tested.
3. "preconditions": Preconditions (Prerequisites): Any conditions that must be met before executing the test (e.g., "User must be registered," "Browser is open").
4. "steps": Test Steps: A detailed, numbered list of actions to be performed.
5. "data": Test Data: The input values required to execute the steps (e.g., usernames, specific numbers, files).
6. "expected": Expected Result: The anticipated outcome based on requirements.
7. "actual": Actual Result: Observed behavior (set to "Pending" for initial generation).
8. "status": Status: The result of the test (Pass, Fail, Blocked, Not Run). Set to "Not Run" by default.`;

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

export async function exploreAndGenerateTestCases(): Promise<string> {
  // Simplify the prompt for the planner. The detailed instructions remain to guide the agent, 
  // but we remove the strict "ONLY JSON" requirement from the initial planning task
  // to avoid confusing Eko's XML-based planner.
  const explorationPrompt = `Perform a thorough discovery scan of the current page. 
Map out all dynamic behaviors, identify mandatory fields, test form validations, handle duplicate check flows, and explore sections that appear or disappear based on input.
Use the "faker_generate_data" tool to provide realistic input values during exploration.

FINALLY: Summarize all unique scenarios discovered.
Your LAST STEP must be to PRINT a JSON array containing the discovered manual test cases.
Each object MUST have these 8 fields: "id", "title", "preconditions", "steps", "data", "expected", "actual", "status".
Return ONLY the JSON array inside markdown code blocks.`;

  const ekoInstance = await initializeEko(explorationPrompt);
  if (!ekoInstance) throw new Error("Failed to initialize Eko");

  const taskId = `discovery-${Date.now()}`;
  activeEko = ekoInstance;
  activeTaskId = taskId;

  return new Promise((resolve, reject) => {
    ekoInstance.run(explorationPrompt, taskId)
      .then(res => {
        resolve(res.result);
      })
      .catch(err => {
        if (err?.name === "AbortError" || err?.message?.includes("abort")) {
          printLog("Discovery aborted. Finalizing report...", "success");
          // If aborted, we could potentially call a summary LLM here,
          // but for now we'll just resolve with it.
          resolve("Discovery stopped by user.");
        } else {
          reject(err);
        }
      })
      .finally(() => {
        if (activeTaskId === taskId) {
          activeEko = null;
          activeTaskId = null;
        }
      });
  });
}

export async function main(prompt: string): Promise<Eko> {
  const eko = await initializeEko(prompt);
  if (eko) {
    eko.run(prompt)
      .then((res) => {
        printLog(res.result, res.success ? "success" : "error");
      })
      .catch((error) => {
        // ... (Error handling remains same inside initializeEko or here)
        console.error("Execution error:", error);
      })
      .finally(() => {
        chrome.storage.local.set({ running: false });
        chrome.runtime.sendMessage({ type: "stop" });
      });
  }
  return eko;
}

export async function initializeEko(prompt: string): Promise<Eko | null> {
  let config = await getLLMConfig();
  if (!config || !config.apiKey) {
    printLog("Please configure apiKey in options.", "error");
    chrome.runtime.openOptionsPage();
    return null;
  }

  // Validations
  if (!config.options?.baseURL || !config.modelName) {
    printLog("Error: LLM Base URL or Model Name not configured", "error");
    return null;
  }

  // Enable internal Eko debug logging to help diagnose planning/execution issues
  (Log as any).setLevel(0); // 0 = LogLevel.DEBUG

  const llms: LLMs = {
    [config.llm]: {
      provider: config.llm === 'groq' ? 'openai' : config.llm as any,
      model: config.modelName,
      apiKey: config.apiKey,
      config: {
        baseURL: config.options.baseURL,
        timeout: 60000,
        ...(config.llm === 'openrouter' && {
          headers: { 'HTTP-Referer': 'https://eko.ai', 'X-Title': 'Smart QA Automation' }
        }),
        ...(config.llm === 'groq' && {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
          },
          messageFormat: 'openai',
          enforceStringContent: true
        })
      },
    },
  };

  let callback: StreamCallback & HumanCallback = {
    onMessage: async (message: StreamCallbackMessage) => {
      if (message.type == "workflow") {
        // XML might contain characters that break parsing if re-logged in some contexts, 
        // but here we just print it.
        printLog("Plan\n" + message.workflow.xml, "info", !message.streamDone);
      } else if (message.type == "text") {
        printLog(message.text, "info", !message.streamDone);
      } else if (message.type == "tool_streaming") {
        printLog(`${message.agentName} > ${message.toolName}\n${message.paramsText}`, "info", true);
      } else if (message.type == "tool_use") {
        printLog(`${message.agentName} > ${message.toolName}\n${JSON.stringify(message.params)}`);
      } else if (message.type == "error") {
        printLog(`LLM Error: ${message.error || 'Unknown error'}`, "error");
      }
    },
    onHumanConfirm: async (context, prompt) => {
      return confirm(prompt);
    },
  };

  let browserAgent = new BrowserAgent([config.llm]);
  browserAgent.addTool(new FakerTool());

  // Broaden the description so the Eko planner sees it as suitable for "discovery" tasks
  (browserAgent as any).description = "A comprehensive browser automation and discovery agent. Can navigate pages, identify interactive elements, probe dynamic behaviors, handle form validations, and generate realistic test data using faker tools.";

  let agents = [browserAgent];
  try {
    return new Eko({
      llms,
      agents,
      callback,
      planLlms: [config.llm]
    });
  } catch (e) {
    printLog(`Init Error: ${e.message}`, "error");
    return null;
  }
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
