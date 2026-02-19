import { createRoot } from "react-dom/client";
import React, { useState, useRef, useEffect } from "react";
import { Button, Input, List, Typography, Divider, Table } from "antd";

const { Text } = Typography;

interface LogMessage {
  time: string;
  log: string;
  level?: "info" | "error" | "success";
}

interface RecordedStep {
  type: string;
  locator: string;
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

const AppRun = () => {
  const [running, setRunning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedSteps, setRecordedSteps] = useState<RecordedStep[]>([]);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [streamLog, setStreamLog] = useState<LogMessage | null>();
  const [manualTestCases, setManualTestCases] = useState<ManualTestCase[]>([]);
  const [isGeneratingManual, setIsGeneratingManual] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState(
    'Open Twitter, search for "Hitesh__22" and follow'
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
      } else if (message.type === 'MANUAL_TESTCASE_GENERATED') {
        setIsGeneratingManual(false);
        if (message.testcases) {
          try {
            // AI might return JSON wrapped in backticks
            const cleaned = message.testcases.replace(/```json\n?|```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            setManualTestCases(Array.isArray(parsed) ? parsed : [parsed]);
          } catch (e) {
            console.error('Failed to parse test cases:', e);
            // Fallback: if it's not JSON, maybe it's still the old markdown or something went wrong
            // For now, we expect JSON.
          }
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

  const generateAIScript = () => {
    if (recordedSteps.length === 0) return;

    const stepsSummary = recordedSteps.map(s => `- ${s.type} on ${s.locator} ${s.value ? `with value "${s.value}"` : ''}`).join('\n');
    const newPrompt = `Convert these recorded interactions into a clean automation script:\n${stepsSummary}`;
    setPrompt(newPrompt);
  };

  const handleGenerateManual = () => {
    setManualTestCases([]);
    setIsGeneratingManual(true);
    chrome.runtime.sendMessage({ type: 'GENERATE_MANUAL_TESTCASE' });
  };

  const copyToClipboard = () => {
    const text = manualTestCases.map(tc =>
      `ID: ${tc.id}\nTitle: ${tc.title}\nPreconditions: ${tc.preconditions}\nSteps: ${tc.steps}\nData: ${tc.data}\nExpected: ${tc.expected}\nActual: ${tc.actual}\nStatus: ${tc.status}\n${'-'.repeat(20)}`
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
      const headers = ['Test Case ID', 'Test Title/Summary', 'Preconditions', 'Test Steps', 'Test Data', 'Expected Result', 'Actual Result', 'Status'];
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
        `ID: ${tc.id}\nTitle: ${tc.title}\nPreconditions: ${tc.preconditions}\nSteps: ${tc.steps}\nData: ${tc.data}\nExpected: ${tc.expected}\nActual: ${tc.actual}\nStatus: ${tc.status}\n${'='.repeat(40)}`
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
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    { title: 'Title', dataIndex: 'title', key: 'title', width: 150 },
    { title: 'Steps', dataIndex: 'steps', key: 'steps', width: 200, ellipsis: true },
    { title: 'Expected', dataIndex: 'expected', key: 'expected', width: 200, ellipsis: true },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 90 },
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
        <Button
          type="default"
          onClick={handleGenerateManual}
          loading={isGeneratingManual}
          block
          style={{ borderColor: '#722ed1', color: '#722ed1' }}
        >
          Generate Manual Testcases (AI)
        </Button>
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
                <Text code>{step.type}</Text> <Text type="secondary" style={{ fontSize: '10px' }}>{step.locator}</Text>
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
      <div style={{ textAlign: "center", marginTop: "4px" }}>
        <Input.TextArea
          ref={textAreaRef}
          rows={4}
          value={prompt}
          disabled={running}
          placeholder="Describe what you want to automate..."
          onChange={(e) => setPrompt(e.target.value)}
        />
        <Button
          type="primary"
          onClick={handleRunClick}
          style={{
            marginTop: "8px",
            width: '100%',
            background: running ? "#6666" : "#1677ff",
          }}
        >
          {running ? "Running AI..." : "Run Automation"}
        </Button>
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
