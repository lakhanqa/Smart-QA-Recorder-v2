import { createRoot } from "react-dom/client";
import React, { useState, useRef, useEffect } from "react";
import { Button, Input, List, Typography, Divider, Table, Radio } from "antd";

const { Text } = Typography;

interface LogMessage {
  time: string;
  log: string;
  level?: "info" | "error" | "success";
}

interface RecordedStep {
  type: string;
  locators?: { playwright: string; css: string; xpath: string; };
  locator?: string; // fallback for backwards compatibility
  value?: string;
  timestamp: number;
  tagName: string;
  innerText?: string;
}

interface ManualTestCase {
  id: string;
  title: string;
  preconditions: string;
  steps: string;
  data: string;
  expected: string;
  actual: string;
  status: string;
}

type ScriptFramework = 'playwright-ts' | 'playwright-js' | 'java-selenium' | 'pytest';

const AppRun = () => {
  const [running, setRunning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedSteps, setRecordedSteps] = useState<RecordedStep[]>([]);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [streamLog, setStreamLog] = useState<LogMessage | null>();
  const [manualTestCases, setManualTestCases] = useState<ManualTestCase[]>([]);
  const [isGeneratingManual, setIsGeneratingManual] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);

  const [scriptFramework, setScriptFramework] = useState<ScriptFramework>('playwright-ts');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState(
    ''
  );

  useEffect(() => {
    chrome.storage.local.get(["running", "prompt"], (result) => {
      if (result.running !== undefined) setRunning(result.running);
      if (result.prompt !== undefined) setPrompt(result.prompt);
    });

    // Initial state check
    chrome.runtime.sendMessage({ type: 'GET_RECORDED_STEPS' }, (response) => {
      if (response) {
        setRecordedSteps(response.steps || []);
        setIsRecording(response.isRecording || false);
      }
    });

    const messageListener = (message: any) => {
      if (!message) return;

      if (message.type === "stop") {
        setRunning(false);
        chrome.storage.local.set({ running: false });
      } else if (message.type === "log") {
        const time = new Date().toLocaleTimeString();
        const log_message = {
          time,
          log: message.log,
          level: message.level || "info",
        };
        if (message.stream) {
          setStreamLog(log_message);
        } else {
          setStreamLog(null);
          setLogs((prev) => [...prev, log_message]);
        }
      } else if (message.type === 'UPDATE_STEPS') {
        setRecordedSteps(message.steps);
      } else if (message.type === 'TEST_SCRIPT_GENERATED') {
        setIsGeneratingScript(false);
        if (message.script && message.extension) {
          const blob = new Blob([message.script], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `automation_script${message.extension}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          chrome.runtime.sendMessage({ type: 'log', log: `Successfully generated and downloaded test script.`, level: 'success' });
        } else {
          chrome.runtime.sendMessage({ type: 'log', log: message.error || `Failed to generate test script.`, level: 'error' });
        }
      } else if (message.type === 'MANUAL_TESTCASE_GENERATED') {
        setIsGeneratingManual(false);
        setIsDiscovering(false);
        if (message.testcases && typeof message.testcases === 'string') {
          try {
            let jsonStr = message.testcases.trim();

            if (!jsonStr || jsonStr === "Discovery stopped by user.") {
              setStreamLog({
                time: new Date().toLocaleTimeString(),
                log: "Discovery ended without generating a full test case report.",
                level: "info"
              });
              return;
            }

            // 1. Try to find markdown code blocks first
            const match = jsonStr.match(/```json\n?([\s\S]*?)\n?```/);
            if (match) {
              jsonStr = match[1];
            } else {
              // 2. Fallback: find the first '[' and last ']' (greedy approach for a JSON array)
              const startIndex = jsonStr.indexOf('[');
              const endIndex = jsonStr.lastIndexOf(']');
              if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                jsonStr = jsonStr.substring(startIndex, endIndex + 1);
              }
            }

            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setManualTestCases(parsed);
              chrome.runtime.sendMessage({ type: 'log', log: `Successfully generated ${parsed.length} test cases.`, level: 'success' });
            } else {
              chrome.runtime.sendMessage({ type: 'log', log: 'Discovery completed but no test cases were found in the output.', level: 'warn' });
            }
          } catch (e: any) {
            console.error('Failed to parse test cases:', e);
            chrome.runtime.sendMessage({
              type: 'log',
              log: `Failed to parse AI response as JSON: ${e.message}. The AI might have returned a text summary instead of a structured table.`,
              level: 'error'
            });
          }
        } else {
          chrome.runtime.sendMessage({ type: 'log', log: 'Discovery finished with an empty response.', level: 'error' });
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, []);

  const handleRunClick = () => {
    if (running) {
      setRunning(false);
      chrome.storage.local.set({ running: false, prompt });
      chrome.runtime.sendMessage({ type: "stop" });
      return;
    }
    if (!prompt.trim()) return;
    setLogs([]);
    setRunning(true);
    chrome.storage.local.set({ running: true, prompt });
    chrome.runtime.sendMessage({ type: "run", prompt: prompt.trim() });
  };

  const toggleRecording = () => {
    if (isRecording) {
      chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, (response) => {
        setIsRecording(false);
        if (response && response.steps) {
          setRecordedSteps(response.steps);
        }
      });
    } else {
      setRecordedSteps([]);
      setIsRecording(true);
      chrome.runtime.sendMessage({ type: 'START_RECORDING' });
    }
  };

  const handleGenerateScriptClick = () => {
    if (recordedSteps.length === 0) {
      chrome.runtime.sendMessage({ type: 'log', log: 'No recorded steps available to generate a script.', level: 'error' });
      return;
    }
    setIsGeneratingScript(true);
    chrome.runtime.sendMessage({
      type: 'GENERATE_TEST_SCRIPT',
      framework: scriptFramework,
      steps: recordedSteps
    });
  };

  const generateAIScript = () => {
    if (recordedSteps.length === 0) return;

    // Use JSON to ensure locators structure remains intact
    const stepsSummary = JSON.stringify(recordedSteps, null, 2);
    const newPrompt = `Convert these recorded interactions (provided in JSON) into a clean automation script using ${scriptFramework}:\n${stepsSummary}`;
    setPrompt(newPrompt);
  };

  const handleGenerateManual = () => {
    setManualTestCases([]);
    setIsGeneratingManual(true);
    chrome.runtime.sendMessage({ type: 'GENERATE_MANUAL_TESTCASE' });
  };

  const handleDeepScan = () => {
    setManualTestCases([]);
    setIsDiscovering(true);
    chrome.runtime.sendMessage({ type: 'START_INTERACTIVE_DISCOVERY' });
  };

  const handleStopDiscovery = () => {
    chrome.runtime.sendMessage({ type: 'STOP_INTERACTIVE_DISCOVERY' });
  };

  const copyToClipboard = () => {
    const text = manualTestCases.map(tc =>
      `Test Case ID: ${tc.id}\nTest Scenario/Title: ${tc.title}\nPreconditions (Prerequisites): ${tc.preconditions}\nTest Steps: ${tc.steps}\nTest Data: ${tc.data}\nExpected Result: ${tc.expected}\nActual Result: ${tc.actual}\nStatus: ${tc.status}\n${'-'.repeat(20)}`
    ).join('\n\n');

    navigator.clipboard.writeText(text).then(() => {
      const time = new Date().toLocaleTimeString();
      setLogs(prev => [...prev, { time, log: 'Test cases copied to clipboard!', level: 'success' }]);
    });
  };

  const downloadFile = (format: 'csv' | 'txt') => {
    let content = '';
    let fileName = `test_cases_${Date.now()}`;

    if (format === 'csv') {
      const headers = ['Test Case ID', 'Test Scenario/Title', 'Preconditions (Prerequisites)', 'Test Steps', 'Test Data', 'Expected Result', 'Actual Result', 'Status'];
      const rows = manualTestCases.map(tc => [
        `"${tc.id.replace(/"/g, '""')}"`,
        `"${tc.title.replace(/"/g, '""')}"`,
        `"${tc.preconditions.replace(/"/g, '""')}"`,
        `"${tc.steps.replace(/"/g, '""')}"`,
        `"${tc.data.replace(/"/g, '""')}"`,
        `"${tc.expected.replace(/"/g, '""')}"`,
        `"${tc.actual.replace(/"/g, '""')}"`,
        `"${tc.status.replace(/"/g, '""')}"`
      ].join(','));
      content = [headers.join(','), ...rows].join('\n');
      fileName += '.csv';
    } else {
      content = manualTestCases.map(tc =>
        `Test Case ID: ${tc.id}\nTest Scenario/Title: ${tc.title}\nPreconditions (Prerequisites): ${tc.preconditions}\nTest Steps: ${tc.steps}\nTest Data: ${tc.data}\nExpected Result: ${tc.expected}\nActual Result: ${tc.actual}\nStatus: ${tc.status}\n${'='.repeat(40)}`
      ).join('\n\n');
      fileName += '.txt';
    }

    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const columns = [
    { title: 'Test Case ID', dataIndex: 'id', key: 'id', width: 100 },
    { title: 'Test Scenario/Title', dataIndex: 'title', key: 'title', width: 200 },
    { title: 'Preconditions', dataIndex: 'preconditions', key: 'preconditions', width: 150, ellipsis: true },
    { title: 'Test Steps', dataIndex: 'steps', key: 'steps', width: 250, ellipsis: true },
    { title: 'Test Data', dataIndex: 'data', key: 'data', width: 120, ellipsis: true },
    { title: 'Expected Result', dataIndex: 'expected', key: 'expected', width: 200, ellipsis: true },
    { title: 'Actual Result', dataIndex: 'actual', key: 'actual', width: 150 },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100 },
  ];

  const getLogStyle = (level: string) => {
    switch (level) {
      case "error": return { color: "#ff4d4f" };
      case "success": return { color: "#52c41a" };
      default: return { color: "#1890ff" };
    }
  };

  return (
    <div style={{ padding: '10px' }}>
      <Typography.Title level={4}>Smart QA Recorder</Typography.Title>

      <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Button
          danger={isRecording}
          type={isRecording ? "primary" : "default"}
          onClick={toggleRecording}
          block
        >
          {isRecording ? "Stop Recording" : "Start Interaction Recording"}
        </Button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            type="default"
            onClick={handleGenerateManual}
            loading={isGeneratingManual}
            style={{ flex: 1, borderColor: '#1890ff', color: '#1890ff' }}
          >
            Quick Scan
          </Button>
          <Button
            type="default"
            onClick={isDiscovering ? handleStopDiscovery : handleDeepScan}
            style={{
              flex: 1,
              borderColor: isDiscovering ? '#ff4d4f' : '#722ed1',
              color: isDiscovering ? '#ff4d4f' : '#722ed1'
            }}
          >
            {isDiscovering ? "Stop & Generate" : "Deep Scan (Discovery)"}
          </Button>
        </div>
      </div>

      {manualTestCases.length > 0 && (
        <div style={{
          marginBottom: '16px',
          padding: '8px',
          backgroundColor: '#f9f0ff',
          border: '1px solid #d3adf7',
          borderRadius: '4px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <Text strong style={{ color: '#722ed1' }}>Generated Testcases:</Text>
            <Button size="small" type="text" onClick={() => setManualTestCases([])}>Close</Button>
          </div>

          <div style={{ overflowX: 'auto', marginBottom: '8px' }}>
            <Table
              size="small"
              dataSource={manualTestCases}
              columns={columns}
              pagination={false}
              rowKey="id"
              scroll={{ x: 600 }}
              style={{ fontSize: '11px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            <Button size="small" onClick={copyToClipboard}>Copy</Button>
            <Button size="small" onClick={() => downloadFile('csv')}>CSV</Button>
            <Button size="small" onClick={() => downloadFile('txt')}>TXT</Button>
          </div>
        </div>
      )}

      {recordedSteps.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <Text strong>Captured Steps ({recordedSteps.length}):</Text>
          <List
            size="small"
            bordered
            dataSource={recordedSteps}
            renderItem={(step) => (
              <List.Item>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <Text code>{step.type}</Text>
                  {step.locators ? (
                    <>
                      <Text type="secondary" style={{ fontSize: '10px' }}>Playwright: {step.locators.playwright}</Text>
                      <Text type="secondary" style={{ fontSize: '10px' }}>CSS: {step.locators.css}</Text>
                      <Text type="secondary" style={{ fontSize: '10px' }}>XPath: {step.locators.xpath}</Text>
                    </>
                  ) : (
                    <Text type="secondary" style={{ fontSize: '10px' }}>{step.locator}</Text>
                  )}
                </div>
              </List.Item>
            )}
            style={{ maxHeight: '150px', overflowY: 'auto', marginTop: '4px', backgroundColor: '#fafafa' }}
          />
          <Button
            size="small"
            type="link"
            onClick={generateAIScript}
            style={{ marginTop: '4px', padding: 0 }}
          >
            Use these steps in Prompt
          </Button>
        </div>
      )}

      <Divider style={{ margin: '12px 0' }} />

      <div>Prompt:</div>

      <div style={{ marginBottom: '8px' }}>
        <Text strong style={{ fontSize: '12px' }}>Script Generation Options:</Text>
        <Radio.Group
          onChange={(e) => setScriptFramework(e.target.value)}
          value={scriptFramework}
          style={{ display: 'flex', flexDirection: 'column', marginTop: '4px', fontSize: '11px' }}
        >
          <Radio style={{ fontSize: '11px' }} value="playwright-ts">Playwright (TypeScript)</Radio>
          <Radio style={{ fontSize: '11px' }} value="playwright-js">Playwright (JavaScript)</Radio>
          <Radio style={{ fontSize: '11px' }} value="java-selenium">Java Selenium</Radio>
          <Radio style={{ fontSize: '11px' }} value="pytest">Pytest</Radio>
        </Radio.Group>
      </div>

      <div style={{ textAlign: "center", marginTop: "4px" }}>
        <Input.TextArea
          ref={textAreaRef}
          rows={4}
          value={prompt}
          disabled={running}
          placeholder="Describe what you want to automate..."
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div style={{ display: 'flex', gap: '8px', marginTop: "8px" }}>
          <Button
            type="primary"
            onClick={handleRunClick}
            style={{
              flex: 1,
              background: running ? "#666666" : "#1677ff",
            }}
          >
            {running ? "Running AI..." : "Run Automation"}
          </Button>

          <Button
            type="primary"
            onClick={handleGenerateScriptClick}
            loading={isGeneratingScript}
            disabled={recordedSteps.length === 0}
            style={{
              flex: 1,
              background: (recordedSteps.length === 0 || isGeneratingScript) ? "#666666" : "#52c41a",
            }}
          >
            Download Script
          </Button>
        </div>
      </div>

      {logs.length > 0 && (
        <div
          style={{
            marginTop: "16px",
            textAlign: "left",
            border: "1px solid #d9d9d9",
            borderRadius: "4px",
            padding: "8px",
            overflowY: "auto",
            backgroundColor: "#f5f5f5",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "8px" }}>Execution Logs:</div>
          {logs.map((log, index) => (
            <pre
              key={index}
              style={{
                margin: "2px 0",
                fontSize: "11px",
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                ...getLogStyle(log.level || "info"),
              }}
            >
              [{log.time}] {log.log}
            </pre>
          ))}
          {streamLog && (
            <pre
              style={{
                margin: "2px 0",
                fontSize: "11px",
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                ...getLogStyle(streamLog.level || "info"),
              }}
            >
              [{streamLog.time}] {streamLog.log}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<React.StrictMode><AppRun /></React.StrictMode>);
