import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Form, Input, Button, message, Card, Select, AutoComplete } from "antd";

const { Option } = Select;

const OptionsPage = () => {
  const [form] = Form.useForm();

  const [config, setConfig] = useState({
    llm: "anthropic",
    apiKey: "",
    modelName: "claude-3-7-sonnet-20250219",
    options: {
      baseURL: "https://api.anthropic.com/v1",
    },
  });

  useEffect(() => {
    chrome.storage.sync.get(["llmConfig"], (result) => {
      if (result.llmConfig) {
        if (result.llmConfig.llm === "") {
          result.llmConfig.llm = "anthropic";
        }
        setConfig(result.llmConfig);
        form.setFieldsValue(result.llmConfig);
      }
    });
  }, []);

  const handleSave = () => {
    form
      .validateFields()
      .then((values) => {
        setConfig(values);
        chrome.storage.sync.set(
          {
            llmConfig: values,
          },
          () => {
            message.success("Save Success!");
          }
        );
      })
      .catch(() => {
        message.error("Please check the form field");
      });
  };

  const modelLLMs = [
    { value: "anthropic", label: "Claude (default)" },
    { value: "openai", label: "OpenAI" },
    { value: "google", label: "Google Gemini" },
    { value: "groq", label: "Groq" },
    { value: "openrouter", label: "OpenRouter" },
  ];

  //Add Model Providers you Like below update models if they are depricated by company in a case.
  const modelOptions = {
    anthropic: [
      { value: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet (default)" },
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" }
    ],
    openai: [
      { value: "gpt-4o", label: "gpt-4o (default)" },
      { value: "gpt-4.1", label: "gpt-4.1" },
      { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
      { value: "gpt-4o-mini", label: "gpt-4o-mini" },
    ],
    // Updated Models For the Code to Work with the Newer Version of the API
    google: [
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },

    ],
    groq: [
      { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile (default)" },
      { value: "llama-3.1-70b-versatile", label: "Llama 3.1 70B Versatile" },
      { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
      { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
      { value: "gemma2-9b-it", label: "Gemma 2 9B" },
    ],
    openrouter: [
      { value: "anthropic/claude-3.7-sonnet", label: "claude-3.7-sonnet (default)" },
      { value: "anthropic/claude-3.5-sonnet", label: "claude-3.5-sonnet" },
      { value: "openai/gpt-4.1", label: "gpt-4.1" },
      { value: "openai/gpt-4.1-mini", label: "gpt-4.1-mini" },
      { value: "openai/gpt-4o", label: "gpt-4o" },
      { value: "google/gemini-2.5-flash-preview-05-20", label: "gemini-2.5-flash-preview-05-20" },
      { value: "google/gemini-2.5-pro-preview", label: "gemini-2.5-pro-preview" },
      { value: "google/gemini-2.0-flash-exp:free", label: "gemini-2.0-flash-exp (free)" },
    ],
  };

  const handleLLMChange = (value: string) => {
    const baseURLMap = {
      openai: "https://api.openai.com/v1",
      anthropic: "https://api.anthropic.com/v1",
      google: "https://generativelanguage.googleapis.com/v1beta",
      groq: "https://api.groq.com/openai/v1",
      openrouter: "https://openrouter.ai/api/v1"
    };
    const newConfig = {
      llm: value,
      apiKey: "",
      modelName: modelOptions[value][0].value,
      options: {
        baseURL: baseURLMap[value]
      },
    };
    setConfig(newConfig);
    form.setFieldsValue(newConfig);
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <Card title="Model Config" className="shadow-md">
        <Form form={form} layout="vertical" initialValues={config}>
          <Form.Item
            name="llm"
            label="LLM"
            rules={[
              {
                required: true,
                message: "Please select a LLM",
              },
            ]}
          >
            <Select placeholder="Choose a LLM" onChange={handleLLMChange}>
              {modelLLMs.map((llm) => (
                <Option key={llm.value} value={llm.value}>
                  {llm.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name={["options", "baseURL"]}
            label="Base URL"
            rules={[
              {
                required: true,
                message: "Please enter the base URL",
              },
            ]}
          >
            <Input placeholder="Please enter the base URL" />
          </Form.Item>

          <Form.Item
            name="modelName"
            label="Model Name"
            rules={[
              {
                required: true,
                message: "Please select a model",
              },
            ]}
          >
            <AutoComplete
              placeholder="Model name"
              options={modelOptions[config.llm]}
              filterOption={(inputValue, option) =>
                (option.value as string).toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
              }
            />
          </Form.Item>

          <Form.Item
            name="apiKey"
            label="API Key"
            rules={[
              {
                required: true,
                message: "Please enter the API Key",
              },
            ]}
          >
            <Input.Password placeholder="Please enter the API Key" allowClear />
          </Form.Item>

          <Form.Item>
            <Button type="primary" onClick={handleSave} block>
              Save
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <OptionsPage />
  </React.StrictMode>
);
